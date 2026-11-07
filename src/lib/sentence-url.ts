/**
 * URL of the sentence file of a sentence language (see src/pages/data/[lang]/sentences.json.ts).
 * The home page preloads it and the typing test fetches it, so both must use this one function:
 * the browser reuses a preloaded response only for the same URL.
 */
export function getSentencesUrl(contentLang: string): string {
  return `/data/${contentLang}/sentences.json`;
}
