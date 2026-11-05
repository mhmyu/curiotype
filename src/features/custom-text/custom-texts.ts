import type { StorageAdapter } from '@/lib/storage/types';
import { isNormalizedText } from './normalize';

/** Versioned key of the saved custom texts. The texts never leave the browser. */
export const CUSTOM_TEXTS_KEY = 'custom-texts:v1';
/** The most recent texts kept; saving a sixth drops the oldest. */
export const MAX_CUSTOM_TEXTS = 5;

export interface CustomText {
  id: string;
  /** Already normalized (see `normalize.ts`). */
  text: string;
  /** When it was last used (epoch ms). */
  savedAt: number;
}

/** Works without crypto.randomUUID, which needs a secure context. */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseOne(raw: unknown): CustomText | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, text, savedAt } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof text !== 'string' || !isNormalizedText(text)) return null;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  return { id, text, savedAt };
}

/**
 * Tolerant reader: drops broken entries, repeated ids and repeated texts, sorts newest first and
 * keeps at most `MAX_CUSTOM_TEXTS`.
 */
export function parseCustomTexts(raw: unknown): CustomText[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const texts = new Set<string>();
  const list: CustomText[] = [];
  for (const item of raw) {
    const entry = parseOne(item);
    if (!entry || ids.has(entry.id) || texts.has(entry.text)) continue;
    ids.add(entry.id);
    texts.add(entry.text);
    list.push(entry);
  }
  return list.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_CUSTOM_TEXTS);
}

/** Union of two lists (same text = the later save wins), newest first, trimmed to the limit. */
export function mergeCustomTexts(
  current: readonly CustomText[],
  incoming: readonly CustomText[],
): CustomText[] {
  const byText = new Map<string, CustomText>();
  for (const entry of [...current, ...incoming]) {
    const known = byText.get(entry.text);
    if (!known || entry.savedAt > known.savedAt) byText.set(entry.text, entry);
  }
  return parseCustomTexts([...byText.values()]);
}

export async function loadCustomTexts(storage: StorageAdapter): Promise<CustomText[]> {
  return parseCustomTexts(await storage.get<unknown>(CUSTOM_TEXTS_KEY));
}

/**
 * Saves a normalized text as the newest one. A text that is already saved is moved to the top
 * (keeping its id) instead of being stored twice. Returns the new list.
 */
export async function saveCustomText(
  storage: StorageAdapter,
  text: string,
  now: number = Date.now(),
): Promise<CustomText[]> {
  if (!isNormalizedText(text)) return loadCustomTexts(storage);
  const current = await loadCustomTexts(storage);
  const known = current.find((entry) => entry.text === text);
  const entry: CustomText = { id: known?.id ?? createId(), text, savedAt: now };
  const next = [entry, ...current.filter((item) => item.text !== text)].slice(0, MAX_CUSTOM_TEXTS);
  await storage.set(CUSTOM_TEXTS_KEY, next);
  return next;
}

export async function removeCustomText(storage: StorageAdapter, id: string): Promise<CustomText[]> {
  const current = await loadCustomTexts(storage);
  const next = current.filter((entry) => entry.id !== id);
  if (next.length !== current.length) await storage.set(CUSTOM_TEXTS_KEY, next);
  return next;
}
