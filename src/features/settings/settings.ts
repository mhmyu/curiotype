import type { ContentLang } from '@/i18n/config';
import { isContentLang } from '@/lib/content-langs';
import type { StorageAdapter } from '@/lib/storage/types';

// Versioned key: bump it and write a migration if the stored shape ever changes incompatibly.
export const SETTINGS_KEY = 'settings:v1';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** Tests per day; 0 turns the goal off. */
export const DAILY_GOALS = [0, 1, 3, 5] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

export const CARET_STYLES = ['line', 'block', 'underline'] as const;
export type CaretStyle = (typeof CARET_STYLES)[number];

export interface Settings {
  /**
   * Language of the sentences the user types (a folder under src/content/sentences/).
   * `null` = never chosen: the test follows the interface language. Whether a code still
   * exists is only known at build time, so the page falls back when it does not.
   */
  contentLang: ContentLang | null;
  theme: Theme;
  fontSize: FontSize;
  dailyGoal: DailyGoal;
  sound: boolean;
  /** 0 (silent) to 1 (full). Only used while `sound` is on. */
  volume: number;
  stopOnError: boolean;
  caretStyle: CaretStyle;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  contentLang: null,
  theme: 'system',
  fontSize: 'md',
  dailyGoal: 0,
  sound: false,
  volume: 0.5,
  stopOnError: false,
  caretStyle: 'line',
});

function pickOneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickContentLang(value: unknown): ContentLang | null {
  return isContentLang(value) ? value : null;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

/**
 * Turns any stored value into a complete, valid Settings object. Unknown keys
 * are dropped and every missing or invalid field falls back to its default, so
 * old data, hand-edited data and data from newer versions never break the app.
 */
export function parseSettings(raw: unknown): Settings {
  const source: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const d = DEFAULT_SETTINGS;
  return {
    contentLang: pickContentLang(source.contentLang),
    theme: pickOneOf(source.theme, THEMES, d.theme),
    fontSize: pickOneOf(source.fontSize, FONT_SIZES, d.fontSize),
    dailyGoal: pickOneOf(source.dailyGoal, DAILY_GOALS, d.dailyGoal),
    sound: pickBoolean(source.sound, d.sound),
    volume: pickVolume(source.volume, d.volume),
    stopOnError: pickBoolean(source.stopOnError, d.stopOnError),
    caretStyle: pickOneOf(source.caretStyle, CARET_STYLES, d.caretStyle),
  };
}

export async function loadSettings(storage: StorageAdapter): Promise<Settings> {
  return parseSettings(await storage.get<unknown>(SETTINGS_KEY));
}

/** Saves the normalized settings (never writes unknown keys or invalid values). */
export async function saveSettings(storage: StorageAdapter, settings: Settings): Promise<void> {
  await storage.set(SETTINGS_KEY, parseSettings(settings));
}
