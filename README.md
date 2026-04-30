# AI Reading Assistant

🇰🇷 한국어
🇺🇸 [English](./README.en.md)

AI Reading Assistant는 영어 글을 읽는 한국어 사용자를 위한 Chrome 확장 프로그램입니다. 영어 기사, 블로그, 논문,
문서, PDF에서 텍스트를 선택하면 주변 문맥을 함께 보고 한국어로 의미, 구조, 표현 의도, 학습 포인트를 설명합니다.

이 프로젝트는 단순 번역기가 아닙니다. 번역은 보조 섹션으로만 제공하며, 핵심 가치는 "왜 이 표현이 이 문맥에서
그렇게 읽히는지"를 이해하도록 돕는 데 있습니다.

## 주요 기능

- 일반 웹페이지 텍스트 선택 감지
- 선택 영역 근처의 작은 플로팅 버튼
- 선택 유형별 버튼 라벨: "뜻 설명", "문맥 의미", "문장 분석"
- Chrome Side Panel 기반 웹페이지 설명 UI
- 확장 프로그램 내부 PDF.js 기반 PDF Reader
- PDF Reader 안에서 텍스트 선택, 문맥 추출, AI 설명
- 기사 모드: 자연스러운 의미, 뉘앙스, 실용 표현 중심
- 논문 모드: 문장 구조, 논리, 학술 표현, 기술적 의미 중심
- BYOK 방식의 OpenAI API Key 설정
- API Key는 `chrome.storage.local`에만 저장

## 설치 방법

```bash
npm install
npm run build
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 Developer mode를 활성화합니다.
3. Load unpacked를 누릅니다.
4. 이 저장소의 `dist` 폴더를 선택합니다.

## OpenAI API Key 설정

1. 확장 프로그램 팝업에서 "API Key 설정"을 누르거나 옵션 페이지를 엽니다.
2. 본인의 OpenAI API Key를 입력하고 저장합니다.
3. 영어 웹페이지 또는 PDF Reader에서 텍스트를 선택한 뒤 플로팅 버튼을 누릅니다.

현재 MVP는 사용자가 직접 API Key를 입력하는 BYOK 프로토타입입니다. 별도 백엔드 서버는 없습니다.

## 웹페이지 사용

일반 웹페이지는 직접 지원합니다. 영어 텍스트를 드래그하면 선택 영역 근처에 "뜻 설명", "문맥 의미", "문장 분석"
버튼이 나타납니다. 버튼을 누르면 Chrome Side Panel에서 한국어 설명을 볼 수 있습니다.

## PDF 사용

Chrome 내장 PDF 뷰어는 PDF 본문 텍스트와 선택 정보를 확장 프로그램이 안정적으로 분석하기 어렵습니다. 이 프로젝트는
Chrome의 기본 PDF 뷰어 설정을 바꾸라고 요구하지 않습니다. 대신 확장 프로그램 안의 PDF.js 기반 PDF Reader에서 PDF를
다시 열어 분석합니다.

PDF를 여는 방법은 두 가지입니다.

1. 확장 프로그램 팝업 → "PDF 열기" → `pdf-reader.html`에서 로컬 PDF 선택
2. 브라우저에서 PDF 탭을 연 상태 → 확장 프로그램 팝업 → "이 PDF를 AI Reader로 열기"

PDF Reader는 `chrome-extension://.../pdf-reader.html`에서 실행됩니다. PDF.js로 PDF를 렌더링하고 페이지별 텍스트를
추출합니다. 사용자가 PDF Reader 안에서 텍스트를 선택하면 선택 텍스트와 주변 문맥을 OpenAI로 보내 한국어 설명을
표시합니다.

## PDF 문제 해결

- 로컬 `file://` PDF URL을 직접 열 수 없다면 Chrome 확장 프로그램 상세 화면에서 "파일 URL에 대한 액세스 허용"을
  켜야 할 수 있습니다.
- CORS, 인증, 다운로드 제한 때문에 원격 PDF URL을 직접 불러오지 못할 수 있습니다.
- "이 PDF는 직접 불러올 수 없습니다" 메시지가 나오면 PDF 파일을 다운로드한 뒤 확장 프로그램 팝업의 "PDF 열기"로
  다시 열어 주세요.

## 보안 주의사항

- 실제 API Key를 소스 코드, README, 예시, 스크린샷, 테스트, 로그, 커밋에 포함하지 마세요.
- API Key는 이 브라우저의 `chrome.storage.local`에 저장됩니다.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, `build`는 `.gitignore`에 포함되어 있습니다.
- 공개 저장소에 푸시하기 전 `git diff`와 `git status`로 민감 정보가 없는지 확인하세요.

## 향후 계획

- PDF 선택 좌표 기반 문맥 매칭 고도화
- 단어장 기능
- 학습 기록
- 영어 UI
- 글로벌 확장

## 개발 구조

```text
src/
  background/   OpenAI 호출과 메시지 처리
  content/      웹페이지 텍스트 선택 감지와 플로팅 버튼
  pdf-reader/   PDF.js 기반 PDF Reader
  popup/        PDF 열기, AI Reader로 열기, API Key 설정 진입점
  sidepanel/    Chrome Side Panel React UI
  options/      API Key 설정 React UI
  shared/       공통 타입, 메시지, 설정, 선택 유틸, 저장소 유틸
manifest.json
pdf-reader.html
popup.html
README.md
README.en.md
```
