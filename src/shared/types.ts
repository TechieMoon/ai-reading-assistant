export type SelectionKind = "term" | "sentence" | "passage";
export type AnswerKind = "term" | "sentence" | "passage";

export interface SelectionPayload {
  id: string;
  selectedText: string;
  surroundingContext: string;
  selectionKind: SelectionKind;
  pdfTitle: string;
  pageNumber: number;
  createdAt: string;
}

export interface ExplanationRequest {
  selection: SelectionPayload;
  answerKind: AnswerKind;
}

export interface ExplanationResponse {
  explanation: string;
  model: string;
  createdAt: string;
}

export interface AppErrorPayload {
  code: "missing_api_key" | "openai_error" | "network_error" | "unknown";
  message: string;
}
