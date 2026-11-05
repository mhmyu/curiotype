/**
 * Name of a language as shown on the sentence language switch, written in the
 * interface language (`Intl.DisplayNames`): "Inggris" on /id/, "English" on /en/.
 * Falls back to the upper-cased code when the runtime cannot name it (unknown
 * code, or no `Intl.DisplayNames`), so the switch never shows an empty button.
 */
export function getLanguageDisplayName(code: string, displayLocale: string): string {
  try {
    const name = new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code);
    if (name && name !== code) return name;
  } catch {
    // Invalid locale or code, or Intl.DisplayNames is missing: use the fallback below.
  }
  return code.toUpperCase();
}
