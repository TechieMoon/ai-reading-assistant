type SelectionKind = "word" | "phrase" | "sentence";

interface SelectionPayload {
  id: string;
  selectedText: string;
  surroundingContext: string;
  selectionKind: SelectionKind;
  pageTitle: string;
  pageUrl: string;
  createdAt: string;
}

interface SelectionReadResult {
  payload: SelectionPayload;
  rect: DOMRect | null;
}

(() => {
const CONTENT_SCRIPT_LOADED_KEY = "__aiReadingAssistantContentScriptLoaded";
const MESSAGE_SELECTION_SUBMITTED = "ai-reading-assistant/selection-submitted";
const MESSAGE_REQUEST_SELECTION_CAPTURE = "ai-reading-assistant/request-selection-capture";
const BUTTON_ID = "ai-reading-assistant-floating-button";
const MAX_SELECTED_TEXT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 4200;
const CONTEXT_RADIUS_CHARS = 1800;

const globalWindow = window as Window & {
  [CONTENT_SCRIPT_LOADED_KEY]?: boolean;
};

if (globalWindow[CONTENT_SCRIPT_LOADED_KEY]) {
  return;
}

globalWindow[CONTENT_SCRIPT_LOADED_KEY] = true;

let floatingButton: HTMLButtonElement | null = null;
let activePayload: SelectionPayload | null = null;
let selectionTimer: number | undefined;

document.addEventListener("selectionchange", () => scheduleSelectionUpdate(120));
document.addEventListener("mouseup", () => scheduleSelectionUpdate(40), true);
document.addEventListener("touchend", () => scheduleSelectionUpdate(80), true);
document.addEventListener("keyup", () => scheduleSelectionUpdate(40), true);
chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type !== MESSAGE_REQUEST_SELECTION_CAPTURE) {
    return;
  }

  const result = readCurrentSelection();
  if (!result) {
    hideButton();
    sendResponse({
      ok: false,
      error: {
        message: "현재 탭에서 선택된 영어 텍스트를 찾지 못했습니다. 텍스트를 드래그한 뒤 다시 시도해 주세요."
      }
    });
    return;
  }

  activePayload = result.payload;
  if (result.rect) {
    showButton(result.rect, labelForSelectionKind(result.payload.selectionKind));
  }

  sendResponse({
    ok: true,
    data: {
      selection: result.payload
    }
  });
});
scheduleSelectionUpdate(0);

function scheduleSelectionUpdate(delay: number): void {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(updateSelectionButton, delay);
}

document.addEventListener(
  "pointerdown",
  (event) => {
    if (floatingButton?.contains(event.target as Node)) {
      return;
    }

    window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        hideButton();
      }
    }, 0);
  },
  true
);

function updateSelectionButton(): void {
  const result = readCurrentSelection();
  if (!result?.rect) {
    hideButton();
    return;
  }

  activePayload = result.payload;
  showButton(result.rect, labelForSelectionKind(result.payload.selectionKind));
}

function readCurrentSelection(): SelectionReadResult | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = normalizeWhitespace(selection.toString());
  if (!isUsableSelection(selectedText)) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = getSelectionRect(range);
  const selectionKind = classifySelection(selectedText);

  return {
    rect,
    payload: {
      id: createSelectionId(),
      selectedText: truncate(selectedText, MAX_SELECTED_TEXT_LENGTH),
      surroundingContext: truncate(extractSurroundingContext(range, selectedText), MAX_CONTEXT_LENGTH),
      selectionKind,
      pageTitle: document.title,
      pageUrl: location.href,
      createdAt: new Date().toISOString()
    }
  };
}

function showButton(rect: DOMRect, label: string): void {
  const button = ensureButton();
  button.textContent = label;

  const top = Math.max(8, rect.top - 42);
  const left = clamp(rect.left + rect.width / 2 - 42, 8, document.documentElement.clientWidth - 108);

  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.style.opacity = "1";
  button.style.pointerEvents = "auto";
  button.hidden = false;
}

function ensureButton(): HTMLButtonElement {
  if (floatingButton) {
    return floatingButton;
  }

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "AI Reading Assistant");
  Object.assign(button.style, {
    position: "fixed",
    zIndex: "2147483647",
    border: "0",
    borderRadius: "999px",
    padding: "8px 12px",
    minWidth: "84px",
    maxWidth: "108px",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.18)",
    background: "#12343b",
    color: "#ffffff",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
    fontWeight: "700",
    lineHeight: "1.2",
    cursor: "pointer",
    transition: "opacity 120ms ease, transform 120ms ease, background 120ms ease",
    opacity: "0",
    pointerEvents: "none"
  });

  button.addEventListener("mouseenter", () => {
    button.style.background = "#0f766e";
    button.style.transform = "translateY(-1px)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.background = "#12343b";
    button.style.transform = "translateY(0)";
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submitSelection();
  });

  document.documentElement.appendChild(button);
  floatingButton = button;
  return button;
}

function hideButton(): void {
  if (!floatingButton) {
    return;
  }

  floatingButton.hidden = true;
  floatingButton.style.opacity = "0";
  floatingButton.style.pointerEvents = "none";
  activePayload = null;
}

function submitSelection(): void {
  if (!activePayload) {
    return;
  }

  chrome.runtime.sendMessage({
    type: MESSAGE_SELECTION_SUBMITTED,
    payload: activePayload
  });

  hideButton();
}

function getSelectionRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length > 0) {
    return rects[0];
  }

  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function classifySelection(text: string): SelectionKind {
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

function labelForSelectionKind(kind: SelectionKind): string {
  if (kind === "word") {
    return "뜻 설명";
  }

  if (kind === "phrase") {
    return "문맥 의미";
  }

  return "문장 분석";
}

function extractSurroundingContext(range: Range, selectedText: string): string {
  const block = findContextBlock(range.commonAncestorContainer);
  const rawBlockText = block?.textContent ?? "";
  const blockText = normalizeWhitespace(rawBlockText);

  if (!blockText) {
    return selectedText;
  }

  const rawStartOffset = getTextOffsetWithin(block, range.startContainer, range.startOffset);
  if (rawStartOffset >= 0) {
    const rawStart = Math.max(0, rawStartOffset - CONTEXT_RADIUS_CHARS);
    const rawEnd = Math.min(rawBlockText.length, rawStartOffset + range.toString().length + CONTEXT_RADIUS_CHARS);
    return truncate(normalizeWhitespace(rawBlockText.slice(rawStart, rawEnd)), MAX_CONTEXT_LENGTH);
  }

  const index = blockText.indexOf(selectedText);
  if (index >= 0) {
    const start = Math.max(0, index - CONTEXT_RADIUS_CHARS);
    const end = Math.min(blockText.length, index + selectedText.length + CONTEXT_RADIUS_CHARS);
    return truncate(blockText.slice(start, end), MAX_CONTEXT_LENGTH);
  }

  return truncate(blockText, MAX_CONTEXT_LENGTH);
}

function findContextBlock(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return (
    element?.closest<HTMLElement>(
      "article, main, section, p, li, blockquote, td, th, pre, code, h1, h2, h3, h4, h5, h6, div"
    ) ?? null
  );
}

function getTextOffsetWithin(root: HTMLElement | null, targetNode: Node, targetOffset: number): number {
  if (!root) {
    return -1;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    if (currentNode === targetNode) {
      return currentOffset + targetOffset;
    }

    currentOffset += textLength;
    currentNode = walker.nextNode();
  }

  return -1;
}

function isUsableSelection(text: string): boolean {
  if (text.length < 2) {
    return false;
  }

  if (text.length > MAX_SELECTED_TEXT_LENGTH) {
    return true;
  }

  return /[A-Za-z]/.test(text);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createSelectionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

})();
