/**
 * Normalization of a custom text (pure, no DOM). The text must be typeable on a standard
 * keyboard, so everything outside printable ASCII is replaced by its closest equivalent or
 * dropped, and all whitespace becomes single spaces.
 */

/** Longest custom text, in characters (the textarea enforces it too). */
export const MAX_CUSTOM_TEXT_LENGTH = 1000;

export type NormalizeResult =
  | {
      ok: true;
      /** Typeable text: printable ASCII, single spaces, no space at either end. */
      text: string;
      /** Characters of the input that were replaced or dropped (whitespace changes not counted). */
      changedChars: number;
    }
  | { ok: false; reason: 'empty' | 'too-long' };

/** Typographic characters and letters that Unicode decomposition does not turn into ASCII. */
const REPLACEMENTS: Readonly<Record<string, string>> = {
  '\u2018': "'", // left single quotation mark
  '\u2019': "'", // right single quotation mark
  '\u201A': "'", // single low-9 quotation mark
  '\u201B': "'", // single high-reversed-9 quotation mark
  '\u2032': "'", // prime
  '\u201C': '"', // left double quotation mark
  '\u201D': '"', // right double quotation mark
  '\u201E': '"', // double low-9 quotation mark
  '\u201F': '"', // double high-reversed-9 quotation mark
  '\u2033': '"', // double prime
  '\u00AB': '"', // left-pointing double angle quotation mark
  '\u00BB': '"', // right-pointing double angle quotation mark
  '\u2010': '-', // hyphen
  '\u2011': '-', // non-breaking hyphen
  '\u2012': '-', // figure dash
  '\u2013': '-', // en dash
  '\u2014': '-', // em dash
  '\u2015': '-', // horizontal bar
  '\u2212': '-', // minus sign
  '\u2026': '...', // horizontal ellipsis
  '\u2044': '/', // fraction slash
  '\u00D7': 'x', // multiplication sign
  '\u00F7': '/', // division sign
  '\u2022': '*', // bullet
  '\u00B7': '.', // middle dot
  '\u00DF': 'ss', // sharp s
  '\u00E6': 'ae',
  '\u00C6': 'AE',
  '\u0153': 'oe',
  '\u0152': 'OE',
  '\u00F8': 'o',
  '\u00D8': 'O',
  '\u0111': 'd',
  '\u0110': 'D',
  '\u0142': 'l',
  '\u0141': 'L',
  '\u00F0': 'd',
  '\u00D0': 'D',
  '\u00FE': 'th',
  '\u00DE': 'Th',
  '\u0131': 'i',
  '\u00A9': '(c)',
  '\u00AE': '(r)',
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
};

const isPrintableAscii = (ch: string): boolean => ch >= ' ' && ch <= '~';

/** The replacement of one character that is neither whitespace nor printable ASCII ('' = dropped). */
function replaceCharacter(ch: string): string {
  const mapped = REPLACEMENTS[ch];
  if (mapped !== undefined) return mapped;

  // Accented letters and compatibility forms (e.g. "é" -> "e", "²" -> "2"): decompose, then
  // keep only what is ASCII (combining marks and anything else not typeable are dropped).
  let replacement = '';
  for (const part of ch.normalize('NFKD')) {
    if (isPrintableAscii(part)) replacement += part;
    else replacement += REPLACEMENTS[part] ?? '';
  }
  return replacement;
}

export function normalizeCustomText(raw: string): NormalizeResult {
  let text = '';
  let changedChars = 0;

  for (const ch of raw) {
    // Any kind of whitespace (new lines, tabs, no-break spaces, ...) becomes one plain space.
    if (/\s/u.test(ch)) {
      text += ' ';
    } else if (isPrintableAscii(ch)) {
      text += ch;
    } else {
      text += replaceCharacter(ch);
      changedChars += 1;
    }
  }

  // Dropped characters can leave two spaces side by side, so collapse after the pass.
  text = text.replace(/ {2,}/g, ' ').trim();

  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > MAX_CUSTOM_TEXT_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, text, changedChars };
}

/** True when `text` is already exactly what `normalizeCustomText` produces (used for stored texts). */
export function isNormalizedText(text: string): boolean {
  if (text.length === 0 || text.length > MAX_CUSTOM_TEXT_LENGTH) return false;
  if (text !== text.trim() || text.includes('  ')) return false;
  for (const ch of text) if (!isPrintableAscii(ch)) return false;
  return true;
}
