import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGE_TYPES, type LatestSelectionResponse, type RuntimeMessage } from "../shared/messages";
import { getSettings, saveReadingMode } from "../shared/storage";
import type { ApiResponse, ExplanationResponse, ReadingMode, SelectionPayload } from "../shared/types";

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
      const settings = await getSettings();
      const initialMode = settings.mode ?? "article";

      if (!mounted) {
        return;
      }

      setMode(initialMode);
      modeRef.current = initialMode;

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

  function openOptions() {
    void chrome.runtime.openOptionsPage();
  }

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
            <span>{new URL(selection.pageUrl).hostname}</span>
          </div>
          <p>{selection.selectedText}</p>
        </section>
      ) : (
        <section className="empty-state">
          <h2>선택된 텍스트 없음</h2>
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
