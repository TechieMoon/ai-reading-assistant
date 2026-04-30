import type { SelectionKind } from "./types";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanPdfText(value: string): string {
  return value
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifySelection(text: string): SelectionKind {
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

export function labelForSelectionKind(kind: SelectionKind): string {
  if (kind === "word") {
    return "뜻 설명";
  }

  if (kind === "phrase") {
    return "문맥 의미";
  }

  return "문장 분석";
}

export function hasEnglishText(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

export function createSelectionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
