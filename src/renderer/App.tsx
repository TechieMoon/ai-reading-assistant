import { type ChangeEvent, type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy
} from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import logoUrl from "../../assets/logo.svg";
import { answerKindForSelection, classifySelection, cleanPdfText, createSelectionId, hasEnglishText, labelForSelectionKind, normalizeWhitespace } from "../shared/selection";
import type { AnswerKind, ExplanationResponse, SelectionPayload } from "../shared/types";
import { MarkdownView } from "./MarkdownView";
import { clearApiKey, explainSelection, getStoredApiKey, saveApiKey } from "./openaiClient";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

const PDF_CONTEXT_RADIUS = 800;
const ADJACENT_PAGE_CONTEXT = 500;
const DEFAULT_PDF_SCALE = 1.25;
const MIN_PDF_SCALE = 0.75;
const MAX_PDF_SCALE = 2.5;
const PDF_SCALE_STEP = 0.15;

export function App() {
  const [pdfState, setPdfState] = useState<PdfLoadState>("empty");
  const [pdfTitle, setPdfTitle] = useState("PDF를 열어 주세요");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<string | null>(null);
  const [pdfScale, setPdfScale] = useState(DEFAULT_PDF_SCALE);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [selectedText, setSelectedText] = useState("");
  const [answerKind, setAnswerKind] = useState<AnswerKind | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [floatingButton, setFloatingButton] = useState<FloatingButtonState | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageTextsRef = useRef<Map<number, string>>(new Map());
  const activeSelectionRef = useRef<SelectionPayload | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const pdfScaleRef = useRef(DEFAULT_PDF_SCALE);
  const renderRunRef = useRef(0);

  const loadPdfData = useCallback(async (data: ArrayBuffer, title: string) => {
    const currentRun = renderRunRef.current + 1;
    renderRunRef.current = currentRun;
    setPdfState("loading");
    setPdfTitle(title);
    setPdfError(null);
    setRenderProgress(null);
    resetAnswer();
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
      setPdfState("ready");
      setRenderProgress(`PDF를 불러오는 중입니다 0/${pdf.numPages}`);
      await renderPdf(pdf, viewer, pageTextsRef.current, currentRun, renderRunRef, pdfScaleRef.current, (renderedPages, totalPages) => {
        if (renderRunRef.current === currentRun) {
          setRenderProgress(renderedPages < totalPages ? `PDF를 불러오는 중입니다 ${renderedPages}/${totalPages}` : null);
        }
      });

      if (renderRunRef.current === currentRun) {
        setPdfState("ready");
        setRenderProgress(null);
      }
    } catch (error) {
      if (renderRunRef.current === currentRun) {
        const detail = pdfLoadErrorMessage(error);
        console.error("PDF load failed:", detail);
        setPdfState("error");
        setRenderProgress(null);
        setPdfError(`PDF를 불러오지 못했습니다. ${detail}`);
      }
    }
  }, []);

  useEffect(() => {
    setHasApiKey(Boolean(getStoredApiKey()));

    return () => {
      void destroyPdf(pdfDocumentRef.current);
      pdfDocumentRef.current = null;
    };
  }, []);

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
    document.addEventListener("wheel", handlePdfWheelZoom, { passive: false });

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("mouseup", updateSelection, true);
      document.removeEventListener("keyup", updateSelection, true);
      document.removeEventListener("pointerdown", clearOnPointerDown, true);
      document.removeEventListener("wheel", handlePdfWheelZoom);
    };
  }, []);

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

  async function explain(payload: SelectionPayload) {
    const nextAnswerKind = answerKindForSelection(payload.selectionKind);
    activeSelectionRef.current = payload;
    setSelectedText(payload.selectedText);
    setAnswerKind(nextAnswerKind);
    setAnswerState("loading");
    setAnswerError(null);

    try {
      const response = await explainSelection({
        selection: payload,
        answerKind: nextAnswerKind
      });
      setExplanation(response);
      setAnswerState("success");
    } catch (error) {
      setExplanation(null);
      setAnswerError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
      setAnswerState("error");
    }
  }

  function retry() {
    if (activeSelectionRef.current) {
      void explain(activeSelectionRef.current);
    }
  }

  function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      return;
    }

    saveApiKey(trimmed);
    setApiKeyInput("");
    setHasApiKey(true);
  }

  function handleClearApiKey() {
    clearApiKey();
    setApiKeyInput("");
    setHasApiKey(false);
  }

  function handleZoomOut() {
    updatePdfScale(pdfScaleRef.current - PDF_SCALE_STEP);
  }

  function handleZoomIn() {
    updatePdfScale(pdfScaleRef.current + PDF_SCALE_STEP);
  }

  function handlePdfWheelZoom(event: WheelEvent) {
    if (!event.ctrlKey || !viewerRef.current?.contains(event.target as Node)) {
      return;
    }

    event.preventDefault();
    updatePdfScale(pdfScaleRef.current + (event.deltaY < 0 ? PDF_SCALE_STEP : -PDF_SCALE_STEP));
  }

  function updatePdfScale(nextScale: number) {
    const normalizedScale = roundScale(clamp(nextScale, MIN_PDF_SCALE, MAX_PDF_SCALE));

    if (Math.abs(normalizedScale - pdfScaleRef.current) < 0.001) {
      return;
    }

    pdfScaleRef.current = normalizedScale;
    setPdfScale(normalizedScale);
    void rerenderCurrentPdf(normalizedScale);
  }

  async function rerenderCurrentPdf(scale: number) {
    const pdf = pdfDocumentRef.current;
    const viewer = viewerRef.current;

    if (!pdf || !viewer) {
      return;
    }

    const currentRun = renderRunRef.current + 1;
    renderRunRef.current = currentRun;
    setFloatingButton(null);
    activeSelectionRef.current = null;
    pageTextsRef.current.clear();
    viewer.replaceChildren();
    setRenderProgress(`PDF를 불러오는 중입니다 0/${pdf.numPages}`);

    try {
      await renderPdf(pdf, viewer, pageTextsRef.current, currentRun, renderRunRef, scale, (renderedPages, totalPages) => {
        if (renderRunRef.current === currentRun) {
          setRenderProgress(renderedPages < totalPages ? `PDF를 불러오는 중입니다 ${renderedPages}/${totalPages}` : null);
        }
      });

      if (renderRunRef.current === currentRun) {
        setRenderProgress(null);
      }
    } catch (error) {
      if (renderRunRef.current === currentRun) {
        const detail = pdfLoadErrorMessage(error);
        console.error("PDF rerender failed:", detail);
        setPdfState("error");
        setRenderProgress(null);
        setPdfError(`PDF를 다시 렌더링하지 못했습니다. ${detail}`);
      }
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
      pdfTitle,
      pageNumber,
      createdAt: new Date().toISOString()
    };

    activeSelectionRef.current = payload;
    setFloatingButton({
      top: Math.max(10, rect.top - 42),
      left: clamp(rect.left + rect.width / 2 - 46, 10, window.innerWidth - 124),
      label: labelForSelectionKind(selectionKind)
    });
  }

  function resetAnswer() {
    setAnswerState("idle");
    setSelectedText("");
    setAnswerKind(null);
    setExplanation(null);
    setAnswerError(null);
    setFloatingButton(null);
    activeSelectionRef.current = null;
  }

  return (
    <main className="app-shell">
      <section className="pdf-column">
        <header className="topbar">
          <div className="brand-title">
            <img src={logoUrl} alt="" aria-hidden="true" />
            <div>
              <p>AI Reading Assistant</p>
              <h1>{pdfTitle}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            {renderProgress && <span className="render-status">{renderProgress}</span>}
            <div className="zoom-controls" aria-label="PDF 확대/축소">
              <button type="button" onClick={handleZoomOut} disabled={pdfState !== "ready" || pdfScale <= MIN_PDF_SCALE} aria-label="축소">
                -
              </button>
              <span>{Math.round(pdfScale * 100)}%</span>
              <button type="button" onClick={handleZoomIn} disabled={pdfState !== "ready" || pdfScale >= MAX_PDF_SCALE} aria-label="확대">
                +
              </button>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              PDF 열기
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
        </header>

        {pdfState === "empty" && (
          <div className="center-state">
            <h2>PDF 전용 읽기 도우미</h2>
            <p>영어 PDF를 열고 텍스트를 드래그해 보세요.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              PDF 열기
            </button>
          </div>
        )}

        {pdfState === "loading" && <div className="center-state">PDF를 불러오는 중입니다</div>}

        {pdfState === "error" && (
          <div className="center-state error-state">
            <h2>PDF를 불러오지 못했습니다</h2>
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

      <aside className="assistant-panel">
        <section className="settings-panel">
          <div>
            <p>OpenAI API Key</p>
            <span>{hasApiKey ? "저장됨" : "설정 필요"}</span>
          </div>
          <div className="api-row">
            <input
              type="password"
              value={apiKeyInput}
              placeholder="OpenAI API Key"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setApiKeyInput(event.target.value)}
            />
            <button type="button" onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()}>
              저장
            </button>
            <button type="button" className="ghost" onClick={handleClearApiKey}>
              삭제
            </button>
          </div>
        </section>

        {selectedText && (
          <section className="selected-card">
            <span>{answerKind ? titleForAnswerKind(answerKind) : "선택한 텍스트"}</span>
            <p>{selectedText}</p>
          </section>
        )}

        <section className="answer-panel" aria-live="polite">
          {answerState === "idle" && <p className="muted">PDF에서 영어 단어, 구, 문장을 선택해 주세요.</p>}
          {answerState === "loading" && <p className="muted">설명 생성 중...</p>}
          {answerState === "error" && (
            <div className="answer-error">
              <p>{answerError}</p>
              {answerError?.includes("API Key") && <p>오른쪽 위 입력칸에 본인의 OpenAI API Key를 저장해 주세요.</p>}
              {activeSelectionRef.current && (
                <button type="button" onClick={retry}>
                  다시 설명
                </button>
              )}
            </div>
          )}
          {answerState === "success" && explanation && (
            <article className="answer">
              <div className="answer-toolbar">
                <span>{answerKind ? titleForAnswerKind(answerKind) : "AI 설명"}</span>
                <button type="button" onClick={retry}>
                  다시 설명
                </button>
              </div>
              <MarkdownView content={explanation.explanation} />
            </article>
          )}
        </section>
      </aside>
    </main>
  );
}

async function renderPdf(
  pdf: PDFDocumentProxy,
  viewer: HTMLDivElement,
  pageTexts: Map<number, string>,
  runId: number,
  renderRunRef: MutableRefObject<number>,
  scale: number,
  onPageRendered: (renderedPages: number, totalPages: number) => void
): Promise<void> {
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (renderRunRef.current !== runId) {
      return;
    }

    const page = await pdf.getPage(pageNumber);
    await renderPage(page, pageNumber, viewer, pageTexts, scale);
    onPageRendered(pageNumber, pdf.numPages);
  }
}

async function renderPage(
  page: PDFPageProxy,
  pageNumber: number,
  viewer: HTMLDivElement,
  pageTexts: Map<number, string>,
  scale: number
): Promise<void> {
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
  pageShell.style.setProperty("--scale-factor", String(scale));
  pageShell.style.setProperty("--user-unit", "1");
  pageShell.style.setProperty("--total-scale-factor", String(scale));

  canvas.className = "pdf-canvas";
  canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
  canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  textLayerContainer.className = "textLayer";
  textLayerContainer.style.width = `${viewport.width}px`;
  textLayerContainer.style.height = `${viewport.height}px`;
  textLayerContainer.style.setProperty("--scale-factor", String(scale));
  textLayerContainer.style.setProperty("--total-scale-factor", String(scale));

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
  const currentPageContext =
    index >= 0
      ? pageText.slice(Math.max(0, index - PDF_CONTEXT_RADIUS), Math.min(pageText.length, index + normalizedSelection.length + PDF_CONTEXT_RADIUS))
      : pageText;

  const previousPage = pageTexts.get(pageNumber - 1);
  const nextPage = pageTexts.get(pageNumber + 1);
  const contextParts = [
    previousPage ? `이전 페이지: ${previousPage.slice(-ADJACENT_PAGE_CONTEXT)}` : "",
    `현재 페이지: ${currentPageContext}`,
    nextPage ? `다음 페이지: ${nextPage.slice(0, ADJACENT_PAGE_CONTEXT)}` : ""
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

async function destroyPdf(pdf: PDFDocumentProxy | null): Promise<void> {
  if (pdf) {
    await pdf.destroy();
  }
}

function titleForAnswerKind(kind: AnswerKind): string {
  if (kind === "term") {
    return "뜻 풀이";
  }

  if (kind === "sentence") {
    return "문장 해석";
  }

  return "전체 해석";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

function pdfLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return "파일이 손상되었거나 현재 렌더링 방식에서 처리할 수 없는 PDF일 수 있습니다.";
}
