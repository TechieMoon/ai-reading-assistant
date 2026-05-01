# AI Reading Assistant

🇺🇸 English
🇰🇷 [한국어](./README.md)

AI Reading Assistant is a desktop client for Korean users reading English PDFs. It is no longer a Chrome Extension. The
app focuses only on opening and reading PDF files inside the desktop client.

It is not a simple translator. For words and short phrases, it uses context to explain the appropriate meaning. For one
sentence or multiple sentences, it provides a natural Korean rendering and explains a few key expressions.

## Features

- Electron desktop app
- PDF.js-based PDF rendering
- Text selection on the PDF text layer
- Word/short phrase selection: contextual meaning explanation
- Single sentence selection: sentence rendering + key expressions
- Multi-sentence selection: full rendering + key expressions
- No Article Mode or Academic Mode
- BYOK OpenAI API key setup
- API key stored only in app localStorage
- No backend server

## Install And Run

```bash
npm install
npm run build
npm start
```

For a quick development run:

```bash
npm run dev
```

## Usage

1. Launch the app.
2. Save your own OpenAI API key in the right panel.
3. Click "PDF 열기" and open an English PDF.
4. Select an English word, phrase, sentence, or multiple sentences.
5. Click the floating button near the selected text.

Button and answer behavior depends on the selected text.

- Word/short phrase: "뜻 풀이"
- One sentence: "문장 해석"
- Multiple sentences: "전체 해석"

## Answer Policy

For a word or short phrase, the app uses surrounding context to identify the right meaning. The answer does not include a
long explanation such as "because of the surrounding context"; it focuses on the meaning and nuance of the selected term.

For one sentence, the app provides a natural Korean rendering and explains a few key expressions.

For multiple sentences, the app renders the full selected passage and explains a few key expressions that help
understanding.

## Security Notes

- Never include a real API key in source code, README files, examples, screenshots, tests, logs, or commits.
- The API key is stored only in the app's localStorage on the user's PC.
- `.env`, `.env.*`, `secrets.*`, `*.local`, `node_modules`, `dist`, `dist-electron`, and `build` are ignored by Git.
- Check `git diff` and `git status` before pushing to avoid committing sensitive data.

## Project Structure

```text
electron/
  main.ts        Electron main process
src/
  renderer/      PDF Reader UI, OpenAI calls, API key storage
  shared/        Shared types, config, and selection utilities
index.html       Desktop app renderer entry
```

## Roadmap

- Coordinate-based PDF context matching
- Recent PDF list
- Vocabulary list
- Learning history
- App packaging and distribution
