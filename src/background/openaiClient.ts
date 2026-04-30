import { MAX_CONTEXT_LENGTH, MAX_SELECTED_TEXT_LENGTH, OPENAI_MODEL, OPENAI_RESPONSES_URL } from "../shared/config";
import { getSettings } from "../shared/storage";
import type { AppErrorPayload, ExplanationRequest, ExplanationResponse, ReadingMode } from "../shared/types";

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
    type?: string;
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

export async function explainSelection(request: ExplanationRequest): Promise<ExplanationResponse> {
  const { apiKey } = await getSettings();

  if (!apiKey) {
    throw new AssistantError("missing_api_key", "API Key 설정 필요: 옵션 페이지에서 OpenAI API Key를 저장해 주세요.");
  }

  const body = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: buildDeveloperPrompt(request.mode)
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
    temperature: 0.35,
    max_output_tokens: 1400
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

function buildDeveloperPrompt(mode: ReadingMode): string {
  const modeInstruction =
    mode === "academic"
      ? [
          "현재 모드는 논문 모드입니다.",
          "문장을 더 구조적으로 분석하고, 논리 관계, 수식어 범위, 학술적 표현, 기술적 의미를 정확히 설명하세요.",
          "논문, 기술 문서, arXiv, 리포트에 적합한 차분하고 명확한 한국어를 사용하세요."
        ].join("\n")
      : [
          "현재 모드는 기사 모드입니다.",
          "표현의 뉘앙스, 실제 쓰임, 자연스러운 한국어 이해, 실용적인 영어 학습 포인트에 집중하세요.",
          "뉴스, 블로그, 에세이, 일반 웹 문서에 적합한 자연스러운 한국어를 사용하세요."
        ].join("\n");

  return [
    "당신은 한국어 사용자를 위한 AI 영어 읽기 어시스턴트입니다.",
    "목표는 번역이 아니라 이해를 돕는 것입니다.",
    "선택된 영어 텍스트와 주변 문맥을 함께 보고, 왜 그런 의미가 되는지 초급자도 따라올 수 있게 설명하세요.",
    "직역 위주로 답하지 말고 문맥, 표현 의도, 문장 구조, 학습 포인트를 중심으로 설명하세요.",
    "부정확한 과장이나 문맥에 없는 단정은 피하고, 불확실하면 가능성을 구분해서 말하세요.",
    modeInstruction,
    "",
    "응답은 반드시 한국어로 작성하고 아래 섹션을 포함하세요.",
    "## 선택한 텍스트",
    "## 문맥 의미",
    "## 왜 이렇게 쓰였는지",
    "## 문장/표현 구조 설명",
    "## 유용한 영어 표현",
    "## 선택적 번역",
    "",
    "선택적 번역은 마지막에 짧게만 제공하세요. 번역을 핵심 기능처럼 강조하지 마세요."
  ].join("\n");
}

function buildUserPrompt({ selection, mode }: ExplanationRequest): string {
  return [
    `모드: ${mode === "academic" ? "논문 모드" : "기사 모드"}`,
    `페이지 제목: ${selection.pageTitle || "제목 없음"}`,
    `페이지 URL: ${selection.pageUrl}`,
    `선택 유형: ${selection.selectionKind}`,
    "",
    "선택한 텍스트:",
    truncate(selection.selectedText, MAX_SELECTED_TEXT_LENGTH),
    "",
    "주변 문맥:",
    truncate(selection.surroundingContext, MAX_CONTEXT_LENGTH)
  ].join("\n");
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
    return "OpenAI API Key를 인증하지 못했습니다. 옵션 페이지에서 키가 올바른지 확인해 주세요.";
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
