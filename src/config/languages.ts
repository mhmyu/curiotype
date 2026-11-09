/**
 * Draft sentence languages (spec 21.1, decision K19).
 *
 * A draft language is built and validated like any other (content rules, `/data/<code>/sentences.json`,
 * `pnpm content:stats`) but is NOT offered in the sentence language select of a production build, so
 * visitors never see a language that has only a few sentences. In `pnpm dev` it is listed so authors
 * can try it. To launch a language, delete its code from `DRAFT_LANGUAGES` (one line); the checklist
 * is in "Adding a sentence language" (README.md) and MAINTAINING.md.
 *
 * Pure functions, no `astro:` imports and no `import.meta.env` (plain Node scripts import this
 * file too): the caller passes `dev` explicitly.
 */

/** Sentence language codes that are still drafts. Lowercase, like the folder names. */
export const DRAFT_LANGUAGES: readonly string[] = ['pt-br', 'fr', 'de'];

/** Whether a sentence language is still a draft. */
export function isDraftLanguage(code: string, drafts: readonly string[] = DRAFT_LANGUAGES): boolean {
  return drafts.includes(code);
}

export interface SelectableLangOptions {
  /** True in `pnpm dev`: every language is listed, drafts included. */
  dev: boolean;
  /**
   * The language in use. A draft that is in use (for example set through `localStorage` in a test)
   * stays in the list, so the select never shows an empty value and the user can still switch away.
   */
  active?: string;
  drafts?: readonly string[];
}

/**
 * Languages the sentence language select offers. `available` is every discovered language folder and
 * is also what `resolveContentLang` accepts, so a draft that is saved in the settings still works
 * even though it is not listed here.
 */
export function listSelectableContentLangs(
  available: readonly string[],
  { dev, active, drafts = DRAFT_LANGUAGES }: SelectableLangOptions,
): string[] {
  if (dev) return [...available];
  return available.filter((code) => !isDraftLanguage(code, drafts) || code === active);
}
