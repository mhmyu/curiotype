import { DEFAULT_LANGUAGE } from '../i18n/config';
import type { ContentLang } from '../i18n/config';

/**
 * Content languages are discovered from the folders under `src/content/sentences/`:
 * adding a folder adds a language, with no code change. A folder name is a
 * lowercase BCP 47 style code (`id`, `en`, `pt-br`, `zh-hans`). It must be
 * lowercase because Astro's glob loader lowercases entry ids.
 */
export const CONTENT_LANG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

export function isContentLang(value: unknown): value is ContentLang {
  return typeof value === 'string' && CONTENT_LANG_PATTERN.test(value);
}

/** Entry ids of the glob loader look like "<lang>/<category>"; returns the "<lang>" part. */
export function contentLangFromEntryId(entryId: string): ContentLang {
  const [folder, ...rest] = entryId.split('/');
  if (rest.length === 0) {
    throw new Error(
      `Sentence file "${entryId}.json" must live in a language folder: src/content/sentences/<lang>/<category>.json.`,
    );
  }
  if (!isContentLang(folder)) {
    throw new Error(
      `Sentence folder "${folder}" is not a valid language code. Use lowercase codes such as "id", "en" or "pt-br".`,
    );
  }
  return folder;
}

/** Unique, sorted language codes of the given sentence entry ids. Throws on an invalid folder. */
export function discoverContentLangs(entryIds: readonly string[]): ContentLang[] {
  return [...new Set(entryIds.map(contentLangFromEntryId))].sort();
}

/**
 * Picks the content language to start with: the preferred one when it exists,
 * otherwise the default language, otherwise the first available one.
 */
export function resolveContentLang(
  preferred: string,
  available: readonly ContentLang[],
  fallback: string = DEFAULT_LANGUAGE,
): ContentLang {
  if (available.includes(preferred)) return preferred;
  if (available.includes(fallback)) return fallback;
  if (available.length === 0) throw new Error('No sentence languages found in src/content/sentences/.');
  return available[0];
}
