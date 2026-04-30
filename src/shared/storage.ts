import type { AppSettings, ReadingMode } from "./types";

export const API_KEY_STORAGE_KEY = "openaiApiKey";
export const MODE_STORAGE_KEY = "readingMode";

export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get([API_KEY_STORAGE_KEY, MODE_STORAGE_KEY]);
  return {
    apiKey: typeof result[API_KEY_STORAGE_KEY] === "string" ? result[API_KEY_STORAGE_KEY] : undefined,
    mode: isReadingMode(result[MODE_STORAGE_KEY]) ? result[MODE_STORAGE_KEY] : "article"
  };
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey.trim() });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}

export async function saveReadingMode(mode: ReadingMode): Promise<void> {
  await chrome.storage.local.set({ [MODE_STORAGE_KEY]: mode });
}

function isReadingMode(value: unknown): value is ReadingMode {
  return value === "article" || value === "academic";
}
