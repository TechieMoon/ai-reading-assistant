import { FormEvent, useEffect, useState } from "react";
import { clearApiKey, getSettings, saveApiKey } from "../shared/storage";

type SaveState = "idle" | "saved" | "cleared" | "error";

export function App() {
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    void getSettings().then((settings) => {
      setHasStoredKey(Boolean(settings.apiKey));
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setSaveState("error");
      return;
    }

    await saveApiKey(trimmedKey);
    setApiKey("");
    setHasStoredKey(true);
    setSaveState("saved");
  }

  async function handleClear() {
    await clearApiKey();
    setApiKey("");
    setHasStoredKey(false);
    setSaveState("cleared");
  }

  return (
    <main className="options-shell">
      <section className="settings-panel">
        <p className="eyebrow">AI Reading Assistant</p>
        <h1>설정</h1>

        <form onSubmit={(event) => void handleSubmit(event)} className="api-key-form">
          <label htmlFor="openai-api-key">OpenAI API Key</label>
          <input
            id="openai-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <div className="button-row">
            <button type="submit">저장</button>
            <button type="button" className="secondary" onClick={() => void handleClear()}>
              삭제
            </button>
          </div>
        </form>

        <div className="status-line" aria-live="polite">
          {hasStoredKey && saveState === "idle" && "저장된 API Key가 있습니다."}
          {saveState === "saved" && "API Key가 저장되었습니다."}
          {saveState === "cleared" && "API Key가 삭제되었습니다."}
          {saveState === "error" && "API Key를 입력해 주세요."}
        </div>

        <section className="security-note">
          <h2>보안 주의사항</h2>
          <p>
            API Key는 이 브라우저의 chrome.storage.local에만 저장됩니다. 공개 저장소, README, 예시, 스크린샷,
            로그에 API Key를 남기지 마세요.
          </p>
        </section>
      </section>
    </main>
  );
}
