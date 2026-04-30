export type ReadingMode = "article" | "academic";
export type SelectionKind = "word" | "phrase" | "sentence";

export interface SelectionPayload {
  id: string;
  selectedText: string;
  surroundingContext: string;
  selectionKind: SelectionKind;
  pageTitle: string;
  pageUrl: string;
  createdAt: string;
}

export interface ExplanationRequest {
  selection: SelectionPayload;
  mode: ReadingMode;
}

export interface ExplanationResponse {
  explanation: string;
  model: string;
  createdAt: string;
}

export interface AppSettings {
  apiKey?: string;
  mode?: ReadingMode;
}

export interface ActiveTabInfo {
  title: string;
  url: string;
}

export interface AppErrorPayload {
  code: "missing_api_key" | "openai_error" | "network_error" | "unknown";
  message: string;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
}

export interface ErrorResponse {
  ok: false;
  error: AppErrorPayload;
}

export type ApiResponse<T> = OkResponse<T> | ErrorResponse;
