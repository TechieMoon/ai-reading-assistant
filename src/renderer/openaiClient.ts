import {
  API_KEY_STORAGE_KEY,
  MAX_CONTEXT_LENGTH,
  MAX_PRONUNCIATION_TEXT_LENGTH,
  MAX_SELECTED_TEXT_LENGTH,
  OPENAI_MODEL,
  OPENAI_RESPONSES_URL,
  OPENAI_TTS_MODEL,
  OPENAI_TTS_URL,
  OPENAI_TTS_VOICE
} from "../shared/config";
import type { AppErrorPayload, ExplanationRequest, ExplanationResponse } from "../shared/types";

interface OpenAIResponseContent {
  type?: string;
  text?: string;
}

interface OpenAIResponseItem {
  content?: OpenAIResponseContent[];
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIResponseItem[];
  error?: {
    message?: string;
  };
}

const READABLE_ANSWER_STYLE_HINT =
  "한국어로 친절하게 설명해주세요. 읽기 쉽게 bullet point, 굵은 글씨, 적절한 이모지를 사용해도 됩니다.";

export class AssistantError extends Error {
  constructor(
    public readonly code: AppErrorPayload["code"],
    message: string
  ) {
    super(message);
  }
}

export function getStoredApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function saveApiKey(apiKey: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export async function explainSelection(request: ExplanationRequest): Promise<ExplanationResponse> {
  const apiKey = getStoredApiKey();

  if (!apiKey) {
    throw new AssistantError("missing_api_key", "OpenAI API Key를 먼저 설정해 주세요.");
  }

  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildUserPrompt(request)
          }
        ]
      }
    ],
    reasoning: {
      effort: "low"
    },
    max_output_tokens: request.answerKind === "term" ? 700 : 1300
  };

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new AssistantError("network_error", "네트워크 오류로 OpenAI에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }

  const data = (await safeJson(response)) as OpenAIResponseBody;

  if (!response.ok) {
    throw new AssistantError("openai_error", toKoreanApiError(response.status, data));
  }

  const explanation = extractOutputText(data);
  if (!explanation) {
    throw new AssistantError("openai_error", "OpenAI 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return {
    explanation,
    model: OPENAI_MODEL,
    createdAt: new Date().toISOString()
  };
}

export async function synthesizePronunciation(text: string): Promise<Blob> {
  const apiKey = getStoredApiKey();
  const input = normalizePronunciationInput(text);

  if (!apiKey) {
    throw new AssistantError("missing_api_key", "OpenAI API Key를 먼저 설정해 주세요.");
  }

  if (!input) {
    throw new AssistantError("openai_error", "발음할 영어 단어 또는 구를 선택해 주세요.");
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        input,
        instructions: "Pronounce this English word or short phrase clearly and naturally for a Korean English learner.",
        response_format: "mp3"
      })
    });
  } catch {
    throw new AssistantError("network_error", "네트워크 오류로 OpenAI에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }

  if (!response.ok) {
    const data = (await safeJson(response)) as OpenAIResponseBody;
    throw new AssistantError("openai_error", toKoreanApiError(response.status, data));
  }

  return response.blob();
}

function buildUserPrompt({ selection, answerKind }: ExplanationRequest): string {
  const selectedText = truncate(selection.selectedText, MAX_SELECTED_TEXT_LENGTH);

  if (answerKind === "term") {
    const contextSentence = selection.contextSentence?.trim() || truncate(selection.surroundingContext, MAX_CONTEXT_LENGTH);
    return withReadableAnswerStyle(`${ensureSentencePunctuation(contextSentence)} 이 문장에서 ${selectedText}가 뭐예요?`);
  }

  if (answerKind === "sentence") {
    const context = truncate(selection.surroundingContext, MAX_CONTEXT_LENGTH);
    return withReadableAnswerStyle(`${context}\n\n이 문맥에서\n\`\`\`\n${selectedText}\n\`\`\`\n에 대해 설명해주세요.`);
  }

  return withReadableAnswerStyle(["```", selectedText, "```", "에 대해 설명해주세요."].join("\n"));
}

function withReadableAnswerStyle(prompt: string): string {
  return `${prompt}\n\n${READABLE_ANSWER_STYLE_HINT}`;
}

function extractOutputText(data: OpenAIResponseBody): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function toKoreanApiError(status: number, data: OpenAIResponseBody): string {
  const apiMessage = data.error?.message;

  if (status === 401) {
    return "OpenAI API Key를 인증하지 못했습니다. API Key가 올바른지 확인해 주세요.";
  }

  if (status === 429) {
    return "OpenAI 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 계정 사용량을 확인해 주세요.";
  }

  if (status >= 500) {
    return "OpenAI 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return apiMessage ? `OpenAI 요청 실패: ${apiMessage}` : `OpenAI 요청 실패: HTTP ${status}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[일부 문맥 생략]`;
}

function ensureSentencePunctuation(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizePronunciationInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_PRONUNCIATION_TEXT_LENGTH);
}
