import { useEffect, useMemo, useState } from "react";

interface PdfCandidate {
  url: string;
  title: string;
}

export function App() {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setActiveTab(tab ?? null);
    });
  }, []);

  const pdfCandidate = useMemo(() => getPdfCandidate(activeTab), [activeTab]);

  function openPdfPicker() {
    void chrome.tabs.create({
      url: chrome.runtime.getURL("pdf-reader.html?source=pick")
    });
  }

  function openActivePdf() {
    if (!pdfCandidate) {
      return;
    }

    const params = new URLSearchParams({
      source: "url",
      url: pdfCandidate.url,
      title: pdfCandidate.title
    });

    void chrome.tabs.create({
      url: chrome.runtime.getURL(`pdf-reader.html?${params.toString()}`)
    });
  }

  function openOptions() {
    void chrome.runtime.openOptionsPage();
  }

  return (
    <main className="popup-shell">
      <header>
        <p>AI Reading Assistant</p>
        <h1>빠른 실행</h1>
      </header>

      <section className="action-list">
        {pdfCandidate && (
          <button type="button" className="primary" onClick={openActivePdf}>
            이 PDF를 AI Reader로 열기
          </button>
        )}
        <button type="button" onClick={openPdfPicker}>
          PDF 열기
        </button>
        <button type="button" onClick={openOptions}>
          API Key 설정
        </button>
      </section>

      {pdfCandidate ? (
        <p className="hint">현재 탭의 PDF를 확장 프로그램 PDF Reader에서 다시 엽니다.</p>
      ) : (
        <p className="hint">웹페이지에서는 텍스트를 드래그하면 플로팅 버튼이 나타납니다.</p>
      )}
    </main>
  );
}

function getPdfCandidate(tab: chrome.tabs.Tab | null): PdfCandidate | null {
  if (!tab?.url) {
    return null;
  }

  const parsedViewerUrl = parseChromePdfViewerUrl(tab.url);
  const candidateUrl = parsedViewerUrl ?? tab.url;

  if (!looksLikePdf(candidateUrl, tab.title ?? "")) {
    return null;
  }

  return {
    url: candidateUrl,
    title: tab.title ?? "PDF"
  };
}

function parseChromePdfViewerUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const isChromePdfViewer =
      parsed.protocol === "chrome-extension:" && parsed.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai";

    if (!isChromePdfViewer) {
      return null;
    }

    return parsed.searchParams.get("src");
  } catch {
    return null;
  }
}

function looksLikePdf(url: string, title: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf") || title.toLowerCase().includes(".pdf");
  } catch {
    return title.toLowerCase().includes(".pdf");
  }
}
