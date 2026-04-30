import type { ActiveTabInfo, ExplanationRequest, ExplanationResponse, SelectionPayload } from "./types";

export const MESSAGE_TYPES = {
  SELECTION_SUBMITTED: "ai-reading-assistant/selection-submitted",
  SELECTION_UPDATED: "ai-reading-assistant/selection-updated",
  GET_LATEST_SELECTION: "ai-reading-assistant/get-latest-selection",
  GET_ACTIVE_TAB: "ai-reading-assistant/get-active-tab",
  ENSURE_CONTENT_SCRIPT: "ai-reading-assistant/ensure-content-script",
  CAPTURE_ACTIVE_SELECTION: "ai-reading-assistant/capture-active-selection",
  EXPLAIN_SELECTION: "ai-reading-assistant/explain-selection"
} as const;

export type RuntimeMessage =
  | {
      type: typeof MESSAGE_TYPES.SELECTION_SUBMITTED;
      payload: SelectionPayload;
    }
  | {
      type: typeof MESSAGE_TYPES.SELECTION_UPDATED;
      payload: SelectionPayload;
    }
  | {
      type: typeof MESSAGE_TYPES.GET_LATEST_SELECTION;
    }
  | {
      type: typeof MESSAGE_TYPES.GET_ACTIVE_TAB;
    }
  | {
      type: typeof MESSAGE_TYPES.ENSURE_CONTENT_SCRIPT;
    }
  | {
      type: typeof MESSAGE_TYPES.CAPTURE_ACTIVE_SELECTION;
    }
  | {
      type: typeof MESSAGE_TYPES.EXPLAIN_SELECTION;
      payload: ExplanationRequest;
    };

export interface LatestSelectionResponse {
  selection: SelectionPayload | null;
}

export interface ActiveTabResponse {
  tab: ActiveTabInfo | null;
}

export interface EnsureContentScriptResponse {
  injected: boolean;
  reason?: string;
}

export type ExplainSelectionData = ExplanationResponse;
