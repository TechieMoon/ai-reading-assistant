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
        role: "developer",
        content: [
          {
            type: "input_text",
            text: buildDeveloperPrompt(request.answerKind)
          }
        ]
      },
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
    temperature: 0.25,
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

function buildDeveloperPrompt(answerKind: ExplanationRequest["answerKind"]): string {
  const common = [
    "당신은 한국어 사용자가 영어 PDF를 읽을 때 돕는 AI Reading Assistant입니다.",
    "모든 답변은 자연스럽고 정확한 한국어로 작성하세요.",
    "선택 텍스트와 주변 문맥을 함께 참고하되, 답변에서 추론 과정을 장황하게 설명하지 마세요.",
    "번역만 하는 도구가 아니라 이해를 돕는 뜻풀이/해석 도구입니다.",
    "문맥에 없는 내용을 만들지 말고, 불확실하면 단정하지 마세요."
  ];

  if (answerKind === "term") {
    return [
      ...common,
      "",
      "선택된 텍스트는 단어 또는 짧은 구입니다.",
      "주변 문맥을 참고해 가장 적절한 뜻을 특정하세요.",
      "답변 맨 앞에는 한영사전처럼 가장 가까운 한국어 뜻 하나를 짧게 제시하세요.",
      "그 뜻은 문맥에서 추론한 대표 의미여야 하며, 여러 뜻을 나열하지 마세요.",
      "하지만 답변에는 '문맥상', '주변 문맥에서', '이 문장에서' 같은 말을 붙이지 마세요.",
      "문맥을 설명하지 말고, 선택한 단어/구의 뜻과 뉘앙스만 풀이하세요.",
      "한국어 단어 하나로만 끝내지 말고, 의미 범위와 자연스러운 쓰임을 짧게 설명하세요."
    ].join("\n");
  }

  if (answerKind === "sentence") {
    return [
      ...common,
      "",
      "선택된 텍스트는 한 문장입니다.",
      "먼저 문장 전체를 자연스럽게 한국어로 해석하세요.",
      "그 다음 이해에 중요한 핵심 표현 몇 개를 짧게 풀이하세요.",
      "불필요한 문법 강의나 긴 배경 설명은 피하세요."
    ].join("\n");
  }

  return [
    ...common,
    "",
    "선택된 텍스트는 여러 문장 또는 문단입니다.",
    "먼저 선택한 전체 내용을 자연스럽게 한국어로 해석하세요.",
    "그 다음 전체 이해에 중요한 핵심 표현 몇 개를 짧게 풀이하세요.",
    "문장별로 지나치게 쪼개지 말고, 읽는 흐름이 살아 있게 해석하세요."
  ].join("\n");
}

function buildUserPrompt({ selection, answerKind }: ExplanationRequest): string {
  const selectedText = truncate(selection.selectedText, MAX_SELECTED_TEXT_LENGTH);
  const context = truncate(selection.surroundingContext, MAX_CONTEXT_LENGTH);

  return [
    `PDF 제목: ${selection.pdfTitle}`,
    `페이지: ${selection.pageNumber}`,
    "",
    "문맥:",
    context,
    "",
    buildRequestLine(answerKind, selectedText)
  ].join("\n");
}

function buildRequestLine(answerKind: ExplanationRequest["answerKind"], selectedText: string): string {
  if (answerKind === "term") {
    return `이 문맥에서 \`${escapeInlineCode(selectedText)}\`에 대해 설명해주세요.`;
  }

  if (answerKind === "sentence") {
    return ["이 문맥에서", "```", selectedText, "```", "에 대해 설명해주세요."].join("\n");
  }

  return ["```", selectedText, "```", "에 대해 설명해주세요."].join("\n");
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

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "'");
}

function normalizePronunciationInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_PRONUNCIATION_TEXT_LENGTH);
}
