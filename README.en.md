# AI Reading Assistant

🇺🇸 English
🇰🇷 [한국어](./README.md)

AI Reading Assistant is a Chrome extension MVP for Korean users who read English articles, papers, blogs, and
documentation. When a user selects English text on a webpage, the extension uses nearby context to explain the meaning,
structure, wording, and learning points in Korean.

This project is not a simple translator. Translation is intentionally kept as a small optional section. The main value is
understanding why an English expression means what it means in context.

## Features

- Text selection detection on normal webpages
- Small floating button near the selected text
- Selection-aware labels: "뜻 설명", "문맥 의미", "문장 분석"
- Chrome Side Panel UI
- Korean explanation by default
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

1. Open the extension options page.
2. Enter and save your own OpenAI API key.
3. Select English text on a webpage and click the floating button.

This MVP is a BYOK prototype. It does not include a backend server.

## Security Notes

- Never include a real API key in source code, README files, examples, screenshots, tests, logs, or commits.
- The API key is stored in this browser's `chrome.storage.local`.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, and `build` are ignored by Git.
- Check `git diff` and `git status` before pushing to avoid committing sensitive data.

## PDF Support

The MVP supports selected text on normal webpages. Chrome's built-in PDF viewer can limit text selection and content
script behavior. This is especially common for local PDFs opened through `file://`.

If the floating button does not appear in a PDF, copy the selected text and paste it into the "선택한 텍스트 붙여넣기"
field in the Side Panel. For local HTML files, Chrome may also require enabling "Allow access to file URLs" on the
extension details page.

The code is split into content script, side panel, and background service worker modules so PDF.js support can be added
later.

## Roadmap

- PDF.js-based PDF support
- Vocabulary list
- Learning history
- English UI
- Global expansion

## Project Structure

```text
src/
  background/   OpenAI calls and message handling
  content/      Selection detection and floating button
  sidepanel/    Chrome Side Panel React UI
  options/      API key settings React UI
  shared/       Shared types, messages, config, and storage helpers
manifest.json
README.md
README.en.md
```
