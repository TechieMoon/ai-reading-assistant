import { explainSelection, AssistantError } from "./openaiClient";
import { MESSAGE_TYPES, type RuntimeMessage } from "../shared/messages";
import type { ApiResponse, AppErrorPayload, ExplanationResponse, SelectionPayload } from "../shared/types";

const LATEST_SELECTION_SESSION_KEY = "latestSelection";
let latestSelection: SelectionPayload | null = null;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: toAppError(error)
      });
    });

  return true;
});

async function handleMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case MESSAGE_TYPES.SELECTION_SUBMITTED:
      latestSelection = message.payload;
      await persistLatestSelection(message.payload);
      await openSidePanel(sender.tab?.id);
      notifySidePanel(message.payload);
      return { ok: true };

    case MESSAGE_TYPES.GET_LATEST_SELECTION:
      return {
        ok: true,
        data: {
          selection: latestSelection ?? (await loadLatestSelection())
        }
      };

    case MESSAGE_TYPES.GET_ACTIVE_TAB:
      return {
        ok: true,
        data: {
          tab: await getActiveTab()
        }
      };

    case MESSAGE_TYPES.ENSURE_CONTENT_SCRIPT:
      return {
        ok: true,
        data: await ensureContentScript()
      };

    case MESSAGE_TYPES.CAPTURE_ACTIVE_SELECTION:
      return captureActiveSelection();

    case MESSAGE_TYPES.EXPLAIN_SELECTION: {
      const explanation = await explainSelection(message.payload);
      return {
        ok: true,
        data: explanation
      } satisfies ApiResponse<ExplanationResponse>;
    }

    default:
      return {
        ok: false,
        error: {
          code: "unknown",
          message: "알 수 없는 요청입니다."
        }
      };
  }
}

async function captureActiveSelection(): Promise<unknown> {
  const tab = await getActiveTabWithId();
  if (!tab?.id || !isInjectableUrl(tab.url ?? "") || isBrowserPdfUrl(tab.url ?? "")) {
    return {
      ok: false,
      error: {
        code: "unknown",
        message: "PDF는 확장 프로그램 팝업에서 AI Reader로 열어 분석해 주세요."
      }
    };
  }

  await injectContentScript(tab.id);

  let response: { ok: boolean; data?: { selection: SelectionPayload | null }; error?: { message: string } };
  try {
    response = (await chrome.tabs.sendMessage(tab.id, {
      type: "ai-reading-assistant/request-selection-capture"
    })) as { ok: boolean; data?: { selection: SelectionPayload | null }; error?: { message: string } };
  } catch {
    return {
      ok: false,
      error: {
        code: "unknown",
        message: "현재 탭에 선택 감지 스크립트를 연결하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
      }
    };
  }

  const selection = response.data?.selection ?? null;
  if (!response.ok || !selection) {
    return {
      ok: false,
      error: {
        code: "unknown",
        message: response.error?.message ?? "현재 탭에서 선택된 텍스트를 찾지 못했습니다."
      }
    };
  }

  latestSelection = selection;
  await persistLatestSelection(selection);
  notifySidePanel(selection);

  return {
    ok: true,
    data: {
      selection
    }
  };
}

async function ensureContentScript() {
  const tab = await getActiveTabWithId();
  if (!tab?.id) {
    return {
      injected: false,
      reason: "활성 탭을 찾지 못했습니다."
    };
  }

  if (!isInjectableUrl(tab.url ?? "") || isBrowserPdfUrl(tab.url ?? "")) {
    return {
      injected: false,
      reason: isBrowserPdfUrl(tab.url ?? "")
        ? "PDF는 확장 프로그램 팝업에서 AI Reader로 열어 분석해 주세요."
        : "Chrome 내부 페이지처럼 확장 프로그램이 접근할 수 없는 페이지입니다."
    };
  }

  const injected = await injectContentScript(tab.id);
  return injected
    ? {
        injected: true
      }
    : {
        injected: false,
        reason: "현재 탭에 선택 감지 스크립트를 주입하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
      };
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["assets/content.js"]
    });
    return true;
  } catch {
    // Static content scripts still cover normal newly loaded pages. This path is best-effort for already-open tabs.
    return false;
  }
}

async function getActiveTabWithId(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function getActiveTab() {
  const tab = await getActiveTabWithId();

  if (!tab) {
    return null;
  }

  return {
    title: tab.title ?? "",
    url: tab.url ?? ""
  };
}

function isInjectableUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  return /^(https?|file):/i.test(url);
}

function isBrowserPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isChromePdfViewer =
      parsed.protocol === "chrome-extension:" && parsed.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai";

    return isChromePdfViewer || parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

async function persistLatestSelection(selection: SelectionPayload): Promise<void> {
  try {
    await chrome.storage.session?.set({ [LATEST_SELECTION_SESSION_KEY]: selection });
  } catch {
    // Session storage is only a convenience cache; the in-memory value remains available.
  }
}

async function loadLatestSelection(): Promise<SelectionPayload | null> {
  try {
    const result = await chrome.storage.session?.get(LATEST_SELECTION_SESSION_KEY);
    const selection = result?.[LATEST_SELECTION_SESSION_KEY];
    return isSelectionPayload(selection) ? selection : null;
  } catch {
    return null;
  }
}

async function openSidePanel(tabId: number | undefined): Promise<void> {
  if (typeof tabId !== "number" || !chrome.sidePanel?.open) {
    return;
  }

  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    // Chrome may reject this if the user gesture is not propagated from the content script.
  }
}

function notifySidePanel(selection: SelectionPayload): void {
  void chrome.runtime
    .sendMessage({
      type: MESSAGE_TYPES.SELECTION_UPDATED,
      payload: selection
    })
    .catch(() => undefined);
}

function toAppError(error: unknown): AppErrorPayload {
  if (error instanceof AssistantError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "unknown",
    message: "예상하지 못한 오류가 발생했습니다. 다시 시도해 주세요."
  };
}

function isSelectionPayload(value: unknown): value is SelectionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as SelectionPayload;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.selectedText === "string" &&
    typeof candidate.surroundingContext === "string" &&
    typeof candidate.pageTitle === "string" &&
    typeof candidate.pageUrl === "string"
  );
}
