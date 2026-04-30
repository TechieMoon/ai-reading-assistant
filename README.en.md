# AI Reading Assistant

🇺🇸 English
🇰🇷 [한국어](./README.md)

AI Reading Assistant is a Chrome extension MVP for Korean users who read English articles, papers, blogs,
documentation, and PDFs. When a user selects English text, the extension uses nearby context to explain the meaning,
structure, wording, and learning points in Korean.

This project is not a simple translator. Translation is intentionally kept as a small optional section. The main value is
understanding why an English expression means what it means in context.

## Features

- Text selection detection on normal webpages
- Small floating button near selected text
- Selection-aware labels: "뜻 설명", "문맥 의미", "문장 분석"
- Chrome Side Panel explanation UI for webpages
- Custom PDF.js-based PDF Reader inside the extension
- PDF text selection, context extraction, and AI explanation inside the PDF Reader
- Article Mode for natural nuance, expression, and practical learning
- Academic Mode for sentence structure, logic, academic wording, and technical meaning
- BYOK OpenAI API key setup
- API key stored only in `chrome.storage.local`

## Installation

```bash
npm install
npm run build
```

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist` folder from this repository.

## OpenAI API Key

1. Click "API Key 설정" in the extension popup, or open the options page.
2. Enter and save your own OpenAI API key.
3. Select English text on a webpage or inside the PDF Reader and click the floating button.

This MVP is a BYOK prototype. It does not include a backend server.

## Webpage Usage

Normal webpages are supported directly. Select English text and a floating "뜻 설명", "문맥 의미", or "문장 분석" button will
appear near the selection. Click it to open the Chrome Side Panel explanation.

## PDF Usage

Chrome's built-in PDF viewer does not reliably expose PDF body text and selection context to Chrome extensions. This
project does not ask users to change Chrome's default PDF viewer. Instead, PDFs are reopened inside the extension's
custom PDF.js-based PDF Reader.

There are two PDF flows:

1. Extension popup → "PDF 열기" → choose a local PDF in `pdf-reader.html`
2. Open a PDF in the browser → extension popup → "이 PDF를 AI Reader로 열기"

The PDF Reader runs at `chrome-extension://.../pdf-reader.html`. It renders PDFs with PDF.js, extracts per-page text, and
sends selected text plus surrounding context to OpenAI for Korean explanation.

## PDF Troubleshooting

- Directly loading local `file://` PDF URLs may require enabling "Allow access to file URLs" on the extension details
  page.
- Some remote PDFs cannot be loaded directly because of CORS, authentication, or download restrictions.
- If you see "이 PDF는 직접 불러올 수 없습니다", download the PDF file and reopen it through the extension popup's
  "PDF 열기" flow.

## Security Notes

- Never include a real API key in source code, README files, examples, screenshots, tests, logs, or commits.
- The API key is stored in this browser's `chrome.storage.local`.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, and `build` are ignored by Git.
- Check `git diff` and `git status` before pushing to avoid committing sensitive data.

## Roadmap

- Coordinate-based PDF selection/context matching
- Vocabulary list
- Learning history
- English UI
- Global expansion

## Project Structure

```text
src/
  background/   OpenAI calls and message handling
  content/      Webpage selection detection and floating button
  pdf-reader/   PDF.js-based PDF Reader
  popup/        PDF open, AI Reader open, and API key settings entry point
  sidepanel/    Chrome Side Panel React UI
  options/      API key settings React UI
  shared/       Shared types, messages, config, selection utilities, and storage helpers
manifest.json
pdf-reader.html
popup.html
README.md
README.en.md
```
