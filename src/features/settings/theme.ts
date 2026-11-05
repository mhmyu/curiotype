import { STORAGE_PREFIX } from '@/lib/storage/local-storage-adapter';
import { SETTINGS_KEY } from './settings';
import type { Theme } from './settings';

/**
 * Theme handling. The colors live in `styles/tokens.css`: without `data-theme` on `<html>` they
 * follow the system (`prefers-color-scheme`), and `data-theme="light" | "dark"` forces one mode.
 * So the `system` choice needs no script at all, only an explicit choice does.
 */

/**
 * Inline script for the `<head>` of every page. It runs before the first paint and applies a
 * saved explicit choice, so a user who picked a theme never sees the other one flash. It is
 * plain ES5 on purpose (no build step touches it), reads the settings key directly (the store
 * is not loaded yet), and does nothing when storage is missing, blocked or holds bad JSON.
 *
 * It is a constant without any interpolated runtime data, so the CSP task (T16) can compute its
 * hash from this exact string.
 */
export const THEME_INIT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_PREFIX + SETTINGS_KEY,
)}) || "null").theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** The part of `<html>` that `applyTheme` needs (a real element, or a stand-in in tests). */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** Applies a theme: `system` removes the override, `light` and `dark` force that mode. */
export function applyTheme(theme: Theme, root: ThemeRoot = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
