import { describe, expect, it } from 'vitest';
import { MAX_CUSTOM_TEXT_LENGTH, isNormalizedText, normalizeCustomText } from './normalize';

function text(raw: string): string {
  const result = normalizeCustomText(raw);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.text;
}

function changed(raw: string): number {
  const result = normalizeCustomText(raw);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.changedChars;
}

describe('normalizeCustomText: typography', () => {
  it('replaces curly quotes with straight ones', () => {
    expect(text('\u201CIt\u2019s fine,\u201D she said.')).toBe('"It\'s fine," she said.');
  });

  it('replaces dashes and the ellipsis', () => {
    expect(text('a \u2013 b \u2014 c')).toBe('a - b - c');
    expect(text('Wait\u2026')).toBe('Wait...');
  });

  it('replaces symbols with their closest typeable form', () => {
    expect(text('3 \u00D7 4 \u00F7 2')).toBe('3 x 4 / 2');
    expect(text('\u00A9 2026')).toBe('(c) 2026');
  });
});

describe('normalizeCustomText: letters', () => {
  it('drops accents and decomposes compatibility characters', () => {
    expect(text('caf\u00E9 na\u00EFve se\u00F1or')).toBe('cafe naive senor');
    expect(text('\u00BD cup')).toBe('1/2 cup');
  });

  it('maps letters that have no decomposition', () => {
    expect(text('Stra\u00DFe \u00C6sop \u0141\u00F3d\u017A')).toBe('Strasse AEsop Lodz');
  });
});

describe('normalizeCustomText: whitespace and invisible characters', () => {
  it('turns new lines, tabs and no-break spaces into single spaces and trims the ends', () => {
    expect(text('  one\n\ntwo\tthree\u00A0 four \n')).toBe('one two three four');
  });

  it('does not count whitespace changes as changed characters', () => {
    expect(changed('one\n\ntwo   three')).toBe(0);
  });

  it('removes control, zero-width and soft hyphen characters', () => {
    expect(text('a\u200Bb\u00ADc\u0007d')).toBe('abcd');
  });

  it('drops characters with no typeable form (emoji, other scripts) without leaving double spaces', () => {
    expect(text('one \uD83D\uDE00 two')).toBe('one two');
    expect(text('hello \u4E16\u754C world')).toBe('hello world');
  });
});

describe('normalizeCustomText: changed characters', () => {
  it('counts each replaced or dropped character once', () => {
    expect(changed('plain ASCII text.')).toBe(0);
    expect(changed('\u201Chi\u201D')).toBe(2);
    expect(changed('caf\u00E9 \uD83D\uDE00')).toBe(2);
    expect(changed('Wait\u2026')).toBe(1);
  });
});

describe('normalizeCustomText: rejected input', () => {
  it('rejects empty text and text with nothing typeable left', () => {
    expect(normalizeCustomText('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeCustomText(' \n\t ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeCustomText('\uD83D\uDE00\uD83D\uDE00')).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts exactly the limit and rejects one more', () => {
    expect(normalizeCustomText('x'.repeat(MAX_CUSTOM_TEXT_LENGTH)).ok).toBe(true);
    expect(normalizeCustomText('x'.repeat(MAX_CUSTOM_TEXT_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('measures the limit after the changes (an ellipsis grows to three characters)', () => {
    expect(normalizeCustomText(`${'x'.repeat(MAX_CUSTOM_TEXT_LENGTH - 1)}\u2026`)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });
});

describe('normalizeCustomText: idempotence', () => {
  it('produces text that is already normalized and stays the same when run again', () => {
    for (const raw of ['\u201CHi\u201D \u2014 caf\u00E9\u2026\n\nok', 'plain text.', '  a  b  ']) {
      const first = text(raw);
      expect(isNormalizedText(first)).toBe(true);
      expect(text(first)).toBe(first);
      expect(changed(first)).toBe(0);
    }
  });
});

describe('isNormalizedText', () => {
  it('accepts printable ASCII with single inner spaces', () => {
    expect(isNormalizedText('Hello, world! 123 ~')).toBe(true);
  });

  it('rejects empty, padded, double-spaced, non-ASCII, control and too long text', () => {
    for (const bad of ['', ' a', 'a ', 'a  b', 'caf\u00E9', 'a\nb', 'a\tb', 'x'.repeat(MAX_CUSTOM_TEXT_LENGTH + 1)]) {
      expect(isNormalizedText(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
