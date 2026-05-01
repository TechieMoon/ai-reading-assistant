import type { AnswerKind, SelectionKind } from "./types";

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
  const normalized = normalizeWhitespace(text);
  const words = normalized.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? [];
  const sentenceCount = countSentences(normalized);

  if (words.length <= 6 && sentenceCount === 0) {
    return "term";
  }

  if (sentenceCount <= 1) {
    return "sentence";
  }

  return "passage";
}

export function answerKindForSelection(kind: SelectionKind): AnswerKind {
  return kind === "term" ? "term" : kind;
}

export function labelForSelectionKind(kind: SelectionKind): string {
  if (kind === "term") {
    return "뜻 풀이";
  }

  if (kind === "sentence") {
    return "문장 해석";
  }

  return "전체 해석";
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

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches?.length ?? 0;
}
