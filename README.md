# AI Reading Assistant

🇰🇷 한국어
🇺🇸 [English](./README.en.md)

AI Reading Assistant는 영어 PDF를 읽는 한국어 사용자를 위한 PC 클라이언트 프로그램입니다. 이제 Chrome Extension이
아니며, 오로지 PDF 파일을 앱 안에서 열고 읽는 데 집중합니다.

단순 번역기가 아니라 PDF 독해 도우미입니다. 단어와 구는 문맥을 참고해 알맞은 뜻을 풀이하고, 문장이나 여러 문장은
자연스럽게 해석한 뒤 핵심 표현을 짧게 설명합니다.

## 주요 기능

- Electron 기반 데스크톱 앱
- PDF.js 기반 PDF 렌더링
- PDF 텍스트 레이어 선택 지원
- 단어/짧은 구 선택: 문맥에 맞는 뜻 풀이
- 한 문장 선택: 문장 해석 + 핵심 표현 풀이
- 여러 문장 선택: 전체 해석 + 핵심 표현 풀이
- 기사 모드/논문 모드 구분 없음
- BYOK 방식의 OpenAI API Key 설정
- API Key는 앱의 localStorage에만 저장
- 별도 백엔드 서버 없음

## 설치 및 실행

```bash
npm install
npm run build
npm start
```

개발 중 빠르게 실행하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run dev
```

## 사용 방법

1. 앱을 실행합니다.
2. 오른쪽 패널에서 본인의 OpenAI API Key를 저장합니다.
3. "PDF 열기" 버튼으로 영어 PDF 파일을 엽니다.
4. PDF 본문에서 영어 단어, 구, 문장 또는 여러 문장을 드래그합니다.
5. 선택 영역 근처에 뜨는 버튼을 누릅니다.

선택 유형에 따라 버튼과 응답 방식이 달라집니다.

- 단어/짧은 구: "뜻 풀이"
- 한 문장: "문장 해석"
- 여러 문장: "전체 해석"

## 응답 정책

단어 또는 짧은 구를 선택하면 주변 문맥을 참고해 가장 적절한 뜻을 판단합니다. 다만 답변에서는 "문맥상 이렇다" 같은
설명을 길게 붙이지 않고, 해당 단어/구의 뜻과 뉘앙스만 풀이합니다.

문장 하나를 선택하면 문장 전체를 자연스럽게 한국어로 해석하고, 이해에 중요한 핵심 표현 몇 개를 풀이합니다.

여러 문장을 선택하면 선택한 전체 내용을 자연스럽게 해석하고, 전체 이해에 중요한 핵심 표현 몇 개를 풀이합니다.

## 보안 주의사항

- 실제 API Key를 소스 코드, README, 예시, 스크린샷, 테스트, 로그, 커밋에 포함하지 마세요.
- API Key는 사용자의 PC에 있는 앱 localStorage에만 저장됩니다.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, `dist-electron`, `build`는 `.gitignore`에 포함되어 있습니다.
- 공개 저장소에 푸시하기 전 `git diff`와 `git status`로 민감 정보가 없는지 확인하세요.

## 개발 구조

```text
electron/
  main.ts        Electron 메인 프로세스
src/
  renderer/      PDF Reader UI, OpenAI 호출, API Key 저장
  shared/        공통 타입, 설정, 선택 분류 유틸
index.html       데스크톱 앱 렌더러 진입점
```

## 향후 계획

- PDF 선택 좌표 기반 문맥 매칭 고도화
- 최근 PDF 목록
- 단어장 기능
- 학습 기록
- 앱 패키징/배포 설정
