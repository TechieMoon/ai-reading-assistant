import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_TYPES, type ActiveTabResponse, type LatestSelectionResponse, type RuntimeMessage } from "../shared/messages";
import { getSettings, saveReadingMode } from "../shared/storage";
import type { ActiveTabInfo, ApiResponse, ExplanationResponse, ReadingMode, SelectionPayload } from "../shared/types";

type LoadState = "idle" | "loading" | "success" | "error";

const MODE_LABELS: Record<ReadingMode, string> = {
  article: "기사 모드",
  academic: "논문 모드"
};

export function App() {
  const [selection, setSelection] = useState<SelectionPayload | null>(null);
  const [mode, setMode] = useState<ReadingMode>("article");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [manualText, setManualText] = useState("");
  const modeRef = useRef<ReadingMode>("article");
  const requestIdRef = useRef(0);

  const explain = useCallback(async (nextSelection: SelectionPayload, nextMode: ReadingMode) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadState("loading");
    setErrorMessage(null);
    setNeedsApiKey(false);

    const response = (await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPLAIN_SELECTION,
      payload: {
        selection: nextSelection,
        mode: nextMode
      }
    })) as ApiResponse<ExplanationResponse>;

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (response.ok) {
      setExplanation(response.data);
      setLoadState("success");
      return;
    }

    setExplanation(null);
    setLoadState("error");
    setErrorMessage(response.error.message);
    setNeedsApiKey(response.error.code === "missing_api_key");
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const [settings, activeTabResponse] = await Promise.all([
        getSettings(),
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_ACTIVE_TAB }) as Promise<ApiResponse<ActiveTabResponse>>
      ]);
      const initialMode = settings.mode ?? "article";

      if (!mounted) {
        return;
      }

      setMode(initialMode);
      modeRef.current = initialMode;
      if (activeTabResponse.ok) {
        setActiveTab(activeTabResponse.data.tab);
      }

      const response = (await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_LATEST_SELECTION
      })) as ApiResponse<LatestSelectionResponse>;

      if (!mounted || !response.ok || !response.data.selection) {
        return;
      }

      setSelection(response.data.selection);
      void explain(response.data.selection, initialMode);
    }

    const listener = (message: RuntimeMessage) => {
      if (message.type !== MESSAGE_TYPES.SELECTION_UPDATED) {
        return;
      }

      setSelection(message.payload);
      setExplanation(null);
      void explain(message.payload, modeRef.current);
    };

    void initialize();
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      mounted = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [explain]);

  async function handleModeChange(nextMode: ReadingMode) {
    setMode(nextMode);
    modeRef.current = nextMode;
    await saveReadingMode(nextMode);

    if (selection) {
      setExplanation(null);
      void explain(selection, nextMode);
    }
  }

  function retry() {
    if (selection) {
      void explain(selection, mode);
    }
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedText = manualText.trim();

    if (!selectedText) {
      return;
    }

    const manualSelection = createManualSelection(selectedText, activeTab);
    setSelection(manualSelection);
    setExplanation(null);
    void explain(manualSelection, mode);
  }

  function openOptions() {
    void chrome.runtime.openOptionsPage();
  }

  const tabNotice = getTabNotice(activeTab);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI Reading Assistant</p>
          <h1>영어 읽기 도우미</h1>
        </div>
        <button className="settings-button" type="button" onClick={openOptions}>
          설정
        </button>
      </header>

      <section className="mode-switch" aria-label="읽기 모드">
        {(["article", "academic"] as ReadingMode[]).map((item) => (
          <button
            key={item}
            className={item === mode ? "active" : ""}
            type="button"
            onClick={() => void handleModeChange(item)}
          >
            {MODE_LABELS[item]}
          </button>
        ))}
      </section>

      {selection ? (
        <section className="selection-panel">
          <div className="selection-meta">
            <span>{labelForSelection(selection.selectionKind)}</span>
            <span>{hostLabel(selection.pageUrl)}</span>
          </div>
          <p>{selection.selectedText}</p>
        </section>
      ) : (
        <section className="empty-state">
          <h2>선택된 텍스트 없음</h2>
          {tabNotice && <p className="notice-text">{tabNotice}</p>}
          <form className="manual-form" onSubmit={handleManualSubmit}>
            <label htmlFor="manual-selection">선택한 텍스트 붙여넣기</label>
            <textarea
              id="manual-selection"
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              rows={5}
            />
            <button type="submit" disabled={!manualText.trim()}>
              문장 분석
            </button>
          </form>
        </section>
      )}

      <section className="answer-panel" aria-live="polite">
        {loadState === "loading" && (
          <div className="loading-state">
            <span className="loader" />
            <p>설명 생성 중...</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="error-state">
            <h2>{needsApiKey ? "API Key 설정 필요" : "오류가 발생했습니다"}</h2>
            <p>{errorMessage}</p>
            <div className="error-actions">
              {needsApiKey && (
                <button type="button" onClick={openOptions}>
                  API Key 설정
                </button>
              )}
              {selection && (
                <button type="button" onClick={retry}>
                  다시 설명
                </button>
              )}
            </div>
          </div>
        )}

        {loadState === "success" && explanation && (
          <article className="explanation">
            <div className="answer-toolbar">
              <span>{MODE_LABELS[mode]}</span>
              <button type="button" onClick={retry}>
                다시 설명
              </button>
            </div>
            <div className="answer-text">{explanation.explanation}</div>
          </article>
        )}

        {loadState === "idle" && selection && <p className="subtle-text">대기 중</p>}
      </section>
    </main>
  );
}

function labelForSelection(kind: SelectionPayload["selectionKind"]): string {
  if (kind === "word") {
    return "뜻 설명";
  }

  if (kind === "phrase") {
    return "문맥 의미";
  }

  return "문장 분석";
}

function createManualSelection(selectedText: string, activeTab: ActiveTabInfo | null): SelectionPayload {
  return {
    id: createId(),
    selectedText,
    surroundingContext: selectedText,
    selectionKind: classifySelection(selectedText),
    pageTitle: activeTab?.title ?? "",
    pageUrl: activeTab?.url ?? "",
    createdAt: new Date().toISOString()
  };
}

function classifySelection(text: string): SelectionPayload["selectionKind"] {
  const words = text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? [];
  const hasSentencePunctuation = /[.!?;:]/.test(text);

  if (words.length === 1 && /^[A-Za-z]+(?:[-'][A-Za-z]+)?$/.test(text)) {
    return "word";
  }

  if (words.length <= 6 && !hasSentencePunctuation) {
    return "phrase";
  }

  return "sentence";
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hostLabel(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "file:") {
      return "로컬 파일";
    }

    return parsedUrl.hostname || "현재 탭";
  } catch {
    return "현재 탭";
  }
}

function getTabNotice(activeTab: ActiveTabInfo | null): string | null {
  const url = activeTab?.url.toLowerCase() ?? "";
  const isPdf = url.split(/[?#]/)[0].endsWith(".pdf");
  const isFile = url.startsWith("file://");

  if (isPdf && isFile) {
    return "현재 탭은 로컬 PDF입니다. Chrome 내장 PDF 뷰어에서는 드래그 선택을 확장 프로그램이 직접 읽지 못할 수 있습니다. 선택한 문장을 복사해서 아래에 붙여넣어 주세요. 로컬 HTML 파일은 확장 프로그램 상세 화면에서 파일 URL 접근 허용이 필요합니다.";
  }

  if (isPdf) {
    return "현재 탭은 PDF입니다. Chrome 내장 PDF 뷰어에서는 드래그 선택을 확장 프로그램이 직접 읽지 못할 수 있습니다. 선택한 문장을 복사해서 아래에 붙여넣어 주세요.";
  }

  if (isFile) {
    return "현재 탭은 로컬 파일입니다. 드래그 선택이 동작하지 않으면 확장 프로그램 상세 화면에서 파일 URL 접근 허용을 켜 주세요.";
  }

  return null;
}
