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

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    return null;
  }

  return {
    title: tab.title ?? "",
    url: tab.url ?? ""
  };
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
