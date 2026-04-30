# AI Reading Assistant

🇰🇷 한국어
🇺🇸 [English](./README.en.md)

AI Reading Assistant는 영어 글을 읽는 한국어 사용자를 위한 Chrome 확장 프로그램입니다. 영어 기사, 블로그, 논문,
문서에서 텍스트를 선택하면 문맥을 함께 보고 한국어로 의미, 구조, 표현 의도, 학습 포인트를 설명합니다.

이 프로젝트는 단순 번역기가 아닙니다. 번역은 보조 섹션으로만 제공하며, 핵심 가치는 "왜 이 표현이 이 문맥에서
그렇게 읽히는지"를 이해하도록 돕는 데 있습니다.

## 주요 기능

- 일반 웹페이지 텍스트 선택 감지
- 선택 영역 근처의 작은 플로팅 버튼
- 선택 유형별 버튼 라벨: "뜻 설명", "문맥 의미", "문장 분석"
- Chrome Side Panel 기반 설명 UI
- 한국어 기본 설명
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

1. 확장 프로그램의 옵션 페이지를 엽니다.
2. 본인의 OpenAI API Key를 입력하고 저장합니다.
3. 영어 웹페이지에서 텍스트를 선택한 뒤 플로팅 버튼을 누릅니다.

현재 MVP는 사용자가 직접 API Key를 입력하는 BYOK 프로토타입입니다. 별도 백엔드 서버는 없습니다.

## 보안 주의사항

- 실제 API Key를 소스 코드, README, 예시, 스크린샷, 테스트, 로그, 커밋에 포함하지 마세요.
- API Key는 이 브라우저의 `chrome.storage.local`에 저장됩니다.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, `build`는 `.gitignore`에 포함되어 있습니다.
- 공개 저장소에 푸시하기 전 `git diff`와 `git status`로 민감 정보가 없는지 확인하세요.

## PDF 지원

MVP는 일반 웹페이지에서 선택한 텍스트를 지원합니다. Chrome 내장 PDF 뷰어는 텍스트 선택과 content script 동작에
제약이 있을 수 있습니다. 특히 `file://`로 열린 로컬 PDF는 확장 프로그램이 드래그 선택을 직접 읽지 못할 수
있습니다.

PDF에서 플로팅 버튼이 나타나지 않으면 선택한 문장을 복사한 뒤 Side Panel의 "선택한 텍스트 붙여넣기" 입력칸에
붙여넣어 설명을 받을 수 있습니다. 로컬 HTML 파일에서 사용하려면 Chrome 확장 프로그램 상세 화면에서 "파일 URL에
대한 액세스 허용"을 켜야 할 수 있습니다.

이후 PDF.js 기반 PDF 읽기 모드를 추가할 수 있도록 기능을 content script, side panel, background service worker로
분리했습니다.

## 향후 계획

- PDF.js 기반 PDF 지원
- 단어장 기능
- 학습 기록
- 영어 UI
- 글로벌 확장

## 개발 구조

```text
src/
  background/   OpenAI 호출과 메시지 처리
  content/      텍스트 선택 감지와 플로팅 버튼
  sidepanel/    Chrome Side Panel React UI
  options/      API Key 설정 React UI
  shared/       공통 타입, 메시지, 설정, 저장소 유틸
manifest.json
README.md
README.en.md
```
