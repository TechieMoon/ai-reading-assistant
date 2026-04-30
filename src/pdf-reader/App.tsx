import { type ChangeEvent, type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist";
import { MESSAGE_TYPES } from "../shared/messages";
import { getSettings, saveReadingMode } from "../shared/storage";
import type { ApiResponse, ExplanationResponse, ReadingMode, SelectionPayload } from "../shared/types";
import {
  classifySelection,
  cleanPdfText,
  createSelectionId,
  hasEnglishText,
  labelForSelectionKind,
  normalizeWhitespace
} from "../shared/selection";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("assets/pdf.worker.mjs");

type PdfLoadState = "empty" | "loading" | "ready" | "error";
type AnswerState = "idle" | "loading" | "success" | "error";

interface FloatingButtonState {
  top: number;
  left: number;
  label: string;
}

interface PdfTextContent {
  items: Array<{ str?: string } | Record<string, unknown>>;
}

const MODE_LABELS: Record<ReadingMode, string> = {
  article: "기사 모드",
  academic: "논문 모드"
};

const PDF_CONTEXT_RADIUS = 800;
const ADJACENT_PAGE_CONTEXT = 500;

export function App() {
  const [mode, setMode] = useState<ReadingMode>("article");
  const [pdfState, setPdfState] = useState<PdfLoadState>("empty");
  const [pdfTitle, setPdfTitle] = useState("PDF Reader");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [selectedText, setSelectedText] = useState("");
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [floatingButton, setFloatingButton] = useState<FloatingButtonState | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageTextsRef = useRef<Map<number, string>>(new Map());
  const activeSelectionRef = useRef<SelectionPayload | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const renderRunRef = useRef(0);

  const source = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      type: params.get("source") ?? "pick",
      url: params.get("url"),
      title: params.get("title")
    };
  }, []);

  const loadPdfData = useCallback(async (data: ArrayBuffer, title: string) => {
    const currentRun = renderRunRef.current + 1;
    renderRunRef.current = currentRun;
    setPdfState("loading");
    setPdfTitle(title);
    setPdfError(null);
    setAnswerState("idle");
    setExplanation(null);
    setSelectedText("");
    setFloatingButton(null);
    activeSelectionRef.current = null;
    pageTextsRef.current.clear();
    await destroyPdf(pdfDocumentRef.current);
    pdfDocumentRef.current = null;

    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    viewer.replaceChildren();

    try {
      const loadingTask = getDocument({ data: new Uint8Array(data) });
      const pdf = await loadingTask.promise;

      if (renderRunRef.current !== currentRun) {
        await destroyPdf(pdf);
        return;
      }

      pdfDocumentRef.current = pdf;
      await renderPdf(pdf, viewer, pageTextsRef.current, currentRun, renderRunRef);

      if (renderRunRef.current === currentRun) {
        setPdfState("ready");
      }
    } catch {
      if (renderRunRef.current === currentRun) {
        setPdfState("error");
        setPdfError("이 PDF는 직접 불러올 수 없습니다. PDF 파일을 다운로드한 뒤 ‘PDF 열기’로 다시 열어주세요.");
      }
    }
  }, []);

  useEffect(() => {
    void getSettings().then((settings) => {
      setMode(settings.mode ?? "article");
    });

    return () => {
      void destroyPdf(pdfDocumentRef.current);
      pdfDocumentRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (source.type !== "url" || !source.url) {
      return;
    }

    void loadPdfFromUrl(source.url)
      .then((data) => loadPdfData(data, source.title || pdfNameFromUrl(source.url ?? "") || "PDF"))
      .catch(() => {
        setPdfState("error");
        setPdfTitle(source.title || "PDF Reader");
        setPdfError("이 PDF는 직접 불러올 수 없습니다. PDF 파일을 다운로드한 뒤 ‘PDF 열기’로 다시 열어주세요.");
      });
  }, [loadPdfData, source.title, source.type, source.url]);

  useEffect(() => {
    const updateSelection = () => window.setTimeout(updatePdfSelection, 40);
    const clearOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (viewerRef.current?.contains(target) || (target as HTMLElement).closest?.(".floating-action")) {
        return;
      }

      setFloatingButton(null);
      activeSelectionRef.current = null;
    };

    document.addEventListener("selectionchange", updateSelection);
    document.addEventListener("mouseup", updateSelection, true);
    document.addEventListener("keyup", updateSelection, true);
    document.addEventListener("pointerdown", clearOnPointerDown, true);

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("mouseup", updateSelection, true);
      document.removeEventListener("keyup", updateSelection, true);
      document.removeEventListener("pointerdown", clearOnPointerDown, true);
    };
  }, []);

  async function handleModeChange(nextMode: ReadingMode) {
    setMode(nextMode);
    await saveReadingMode(nextMode);

    if (activeSelectionRef.current) {
      await explain(activeSelectionRef.current, nextMode);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfState("error");
      setPdfError("PDF 파일만 열 수 있습니다.");
      return;
    }

    await loadPdfData(await file.arrayBuffer(), file.name);
  }

  async function explain(payload: SelectionPayload, nextMode = mode) {
    activeSelectionRef.current = payload;
    setSelectedText(payload.selectedText);
    setAnswerState("loading");
    setAnswerError(null);

    const response = (await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPLAIN_SELECTION,
      payload: {
        selection: payload,
        mode: nextMode
      }
    })) as ApiResponse<ExplanationResponse>;

    if (response.ok) {
      setExplanation(response.data);
      setAnswerState("success");
      return;
    }

    setExplanation(null);
    setAnswerError(response.error.message);
    setAnswerState("error");
  }

  function retry() {
    if (activeSelectionRef.current) {
      void explain(activeSelectionRef.current);
    }
  }

  function updatePdfSelection() {
    const viewer = viewerRef.current;
    const selection = window.getSelection();

    if (!viewer || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setFloatingButton(null);
      activeSelectionRef.current = null;
      return;
    }

    if (!selectionBelongsToViewer(selection, viewer)) {
      return;
    }

    const text = normalizeWhitespace(selection.toString());
    if (text.length < 2 || !hasEnglishText(text)) {
      setFloatingButton(null);
      activeSelectionRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = firstUsableRect(range);
    if (!rect) {
      setFloatingButton(null);
      return;
    }

    const pageNumber = detectCurrentPage(selection, rect, viewer);
    const selectionKind = classifySelection(text);
    const payload: SelectionPayload = {
      id: createSelectionId(),
      selectedText: text,
      surroundingContext: buildPdfContext(pageNumber, text, pageTextsRef.current),
      selectionKind,
      pageTitle: pdfTitle,
      pageUrl: window.location.href,
      createdAt: new Date().toISOString()
    };

    activeSelectionRef.current = payload;
    setFloatingButton({
      top: Math.max(10, rect.top - 42),
      left: clamp(rect.left + rect.width / 2 - 46, 10, window.innerWidth - 124),
      label: labelForSelectionKind(selectionKind)
    });
  }

  return (
    <main className="pdf-reader-shell">
      <section className="pdf-viewer-column">
        <header className="pdf-toolbar">
          <div>
            <p>AI Reading Assistant</p>
            <h1>{pdfTitle}</h1>
          </div>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            PDF 열기
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
        </header>

        {pdfState === "empty" && (
          <div className="pdf-empty-state">
            <h2>PDF Reader</h2>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              PDF 열기
            </button>
          </div>
        )}

        {pdfState === "loading" && <div className="pdf-loading">PDF를 불러오는 중입니다</div>}

        {pdfState === "error" && (
          <div className="pdf-error">
            <h2>이 PDF는 직접 불러올 수 없습니다</h2>
            <p>{pdfError}</p>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              PDF 열기
            </button>
          </div>
        )}

        <div ref={viewerRef} className="pdf-viewer" aria-label="PDF 문서" />

        {floatingButton && (
          <button
            type="button"
            className="floating-action"
            style={{ top: floatingButton.top, left: floatingButton.left }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => activeSelectionRef.current && void explain(activeSelectionRef.current)}
          >
            {floatingButton.label}
          </button>
        )}
      </section>

      <aside className="ai-panel">
        <header>
          <p>AI 설명</p>
          <h2>문맥 기반 이해</h2>
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

        {selectedText && (
          <section className="selected-text">
            <span>{activeSelectionRef.current ? labelForSelectionKind(activeSelectionRef.current.selectionKind) : "문장 분석"}</span>
            <p>{selectedText}</p>
          </section>
        )}

        <section className="answer-panel" aria-live="polite">
          {answerState === "idle" && <p className="muted">PDF에서 영어 텍스트를 드래그해 주세요.</p>}
          {answerState === "loading" && <p className="muted">설명 생성 중...</p>}
          {answerState === "error" && (
            <div className="answer-error">
              <p>{answerError}</p>
              <button type="button" onClick={retry}>
                다시 설명
              </button>
            </div>
          )}
          {answerState === "success" && explanation && (
            <article className="answer">
              <div className="answer-toolbar">
                <span>{MODE_LABELS[mode]}</span>
                <button type="button" onClick={retry}>
                  다시 설명
                </button>
              </div>
              <div>{explanation.explanation}</div>
            </article>
          )}
        </section>
      </aside>
    </main>
  );
}

async function loadPdfFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load PDF: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function renderPdf(
  pdf: PDFDocumentProxy,
  viewer: HTMLDivElement,
  pageTexts: Map<number, string>,
  runId: number,
  renderRunRef: MutableRefObject<number>
): Promise<void> {
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (renderRunRef.current !== runId) {
      return;
    }

    const page = await pdf.getPage(pageNumber);
    await renderPage(page, pageNumber, viewer, pageTexts);
  }
}

async function renderPage(
  page: PDFPageProxy,
  pageNumber: number,
  viewer: HTMLDivElement,
  pageTexts: Map<number, string>
): Promise<void> {
  const scale = 1.25;
  const viewport = page.getViewport({ scale });
  const pageShell = document.createElement("section");
  const canvas = document.createElement("canvas");
  const textLayerContainer = document.createElement("div");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  pageShell.className = "pdf-page";
  pageShell.dataset.pageNumber = String(pageNumber);
  pageShell.style.width = `${viewport.width}px`;
  pageShell.style.height = `${viewport.height}px`;

  canvas.className = "pdf-canvas";
  canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
  canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  textLayerContainer.className = "textLayer";
  textLayerContainer.style.width = `${viewport.width}px`;
  textLayerContainer.style.height = `${viewport.height}px`;

  pageShell.append(canvas, textLayerContainer);
  viewer.append(pageShell);

  const textContent = await page.getTextContent();
  pageTexts.set(pageNumber, textContentToPlainText(textContent));

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerContainer,
    viewport
  });
  await textLayer.render();
}

function textContentToPlainText(textContent: PdfTextContent): string {
  const parts = textContent.items.map((item) => (typeof item.str === "string" ? item.str : ""));
  return cleanPdfText(parts.join(" "));
}

function selectionBelongsToViewer(selection: Selection, viewer: HTMLElement): boolean {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean(anchor && focus && viewer.contains(anchor) && viewer.contains(focus));
}

function firstUsableRect(range: Range): DOMRect | null {
  const rect = Array.from(range.getClientRects()).find((item) => item.width > 0 && item.height > 0);
  if (rect) {
    return rect;
  }

  const fallback = range.getBoundingClientRect();
  return fallback.width > 0 && fallback.height > 0 ? fallback : null;
}

function detectCurrentPage(selection: Selection, rect: DOMRect, viewer: HTMLElement): number {
  const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  const pageFromAnchor = anchorElement?.closest<HTMLElement>("[data-page-number]");
  if (pageFromAnchor?.dataset.pageNumber) {
    return Number(pageFromAnchor.dataset.pageNumber);
  }

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const pages = Array.from(viewer.querySelectorAll<HTMLElement>("[data-page-number]"));
  const pageByRect = pages.find((page) => {
    const pageRect = page.getBoundingClientRect();
    return centerX >= pageRect.left && centerX <= pageRect.right && centerY >= pageRect.top && centerY <= pageRect.bottom;
  });

  return Number(pageByRect?.dataset.pageNumber ?? 1);
}

function buildPdfContext(pageNumber: number, selectedText: string, pageTexts: Map<number, string>): string {
  const pageText = pageTexts.get(pageNumber) ?? "";
  const normalizedSelection = normalizeWhitespace(selectedText);
  const index = findSelectionIndex(pageText, normalizedSelection);

  // TODO: Replace text-search matching with coordinate-based matching using PDF.js text item geometry.
  const currentPageContext =
    index >= 0
      ? pageText.slice(Math.max(0, index - PDF_CONTEXT_RADIUS), Math.min(pageText.length, index + normalizedSelection.length + PDF_CONTEXT_RADIUS))
      : pageText;

  const previousPage = pageTexts.get(pageNumber - 1);
  const nextPage = pageTexts.get(pageNumber + 1);
  const contextParts = [
    previousPage ? `이전 페이지 문맥: ${previousPage.slice(-ADJACENT_PAGE_CONTEXT)}` : "",
    `현재 페이지 문맥: ${currentPageContext}`,
    nextPage ? `다음 페이지 문맥: ${nextPage.slice(0, ADJACENT_PAGE_CONTEXT)}` : ""
  ].filter(Boolean);

  return contextParts.join("\n\n");
}

function findSelectionIndex(pageText: string, selectedText: string): number {
  const exactIndex = pageText.indexOf(selectedText);
  if (exactIndex >= 0) {
    return exactIndex;
  }

  return pageText.toLowerCase().indexOf(selectedText.toLowerCase());
}

function pdfNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() || "PDF");
  } catch {
    return "PDF";
  }
}

async function destroyPdf(pdf: PDFDocumentProxy | null): Promise<void> {
  if (pdf) {
    await pdf.destroy();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
