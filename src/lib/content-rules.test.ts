import { describe, expect, it } from 'vitest';
import {
  checkSentence,
  DEFAULT_LANGUAGE_RULES,
  EXPLANATION_LENGTH,
  FALLBACK_LENGTH_LANG,
  findDisallowedChars,
  getLanguageRules,
  getTextLength,
  LANGUAGE_RULES,
  TEXT_LENGTH,
} from './content-rules';
import type { ItemToCheck, LanguageRules, RuleTables, TextLengthTable } from './content-rules';
import { DIFFICULTY_THRESHOLDS, classifyDifficulty } from './difficulty';
import type { DifficultyThresholds } from './difficulty';
import type { Language } from '../i18n/config';
import type { Category } from './taxonomy';

/** Text of exactly `length` characters that satisfies every text rule. */
function textOfLength(length: number): string {
  return 'a'.repeat(length - 1) + '.';
}

function validItem(overrides: Partial<ItemToCheck> = {}): ItemToCheck {
  return {
    id: 'en-science-001',
    difficulty: 'easy',
    text: textOfLength(60),
    explanation: 'x'.repeat(60),
    source: { title: 'Publisher: Page title', url: 'https://example.org/page' },
    ...overrides,
  };
}

function check(item: ItemToCheck, lang: Language = 'en', category: Category = 'science') {
  return checkSentence(lang, category, item);
}

describe('checkSentence: a valid sentence', () => {
  it('passes with no problems', () => {
    expect(check(validItem())).toEqual([]);
  });

  it('reports several problems at once', () => {
    const problems = check(validItem({ text: 'bad  text', id: 'nope' }));
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('names the sentence id in every message', () => {
    const problems = check(validItem({ id: 'nope', text: 'short' }));
    expect(problems.length).toBeGreaterThan(0);
    for (const message of problems) expect(message).toContain('"nope"');
  });
});

describe('checkSentence: id format', () => {
  it('accepts <lang>-<category>-NNN', () => {
    expect(check(validItem({ id: 'en-science-123' }))).toEqual([]);
  });

  it.each([
    ['too few digits', 'en-science-1'],
    ['too many digits', 'en-science-0001'],
    ['wrong language', 'id-science-001'],
    ['wrong category', 'en-history-001'],
  ])('rejects %s', (_name, id) => {
    expect(check(validItem({ id })).some((m) => m.includes('id must look like'))).toBe(true);
  });
});

describe('checkSentence: text length per language', () => {
  const langs = Object.keys(TEXT_LENGTH) as Language[];

  it.each(langs)('%s: accepts both bounds and rejects one outside each', (lang) => {
    const [min, max] = TEXT_LENGTH[lang];
    const run = (length: number) => {
      const text = textOfLength(length);
      // The label follows the score, so only the length can be wrong here.
      const difficulty = classifyDifficulty(text, lang);
      return check(validItem({ id: `${lang}-science-001`, difficulty, text }), lang);
    };

    expect(run(min)).toEqual([]);
    expect(run(max)).toEqual([]);
    expect(run(min - 1).some((m) => m.includes('characters, but'))).toBe(true);
    expect(run(max + 1).some((m) => m.includes('characters, but'))).toBe(true);
  });
});

describe('checkSentence: difficulty label', () => {
  // textOfLength(n) is one long word, so its score is n + 5 (see difficulty.test.ts).
  const textWithScore = (score: number) => textOfLength(score - 5);
  // `lang` is any language code (a language without entries, such as "fr", uses the fallbacks).
  const run = (score: number, difficulty: ItemToCheck['difficulty'], lang = 'en') =>
    checkSentence(
      lang,
      'science',
      validItem({ id: `${lang}-science-001`, difficulty, text: textWithScore(score) }),
    );
  const enThreshold = DIFFICULTY_THRESHOLDS.en;

  it('accepts the label that matches the score on both sides of the threshold', () => {
    expect(run(enThreshold - 1, 'easy')).toEqual([]);
    expect(run(enThreshold, 'hard')).toEqual([]);
  });

  it('rejects a hard label on an easy score and an easy label on a hard score', () => {
    const tooEasy = run(enThreshold - 1, 'hard');
    expect(tooEasy).toHaveLength(1);
    expect(tooEasy[0]).toContain('\"en-science-001\"');
    expect(tooEasy[0]).toContain(`score ${enThreshold - 1} is easy`);
    expect(tooEasy[0]).toContain('difficulty is \"hard\"');

    const tooHard = run(enThreshold, 'easy');
    expect(tooHard).toHaveLength(1);
    expect(tooHard[0]).toContain(`score ${enThreshold} is hard`);
    expect(tooHard[0]).toContain('difficulty is \"easy\"');
  });

  it('uses the threshold of the language of the sentence', () => {
    const idThreshold = DIFFICULTY_THRESHOLDS.id;
    expect(idThreshold).toBeGreaterThan(enThreshold);
    const score = enThreshold + 5; // hard for en, still easy for id
    expect(run(score, 'hard', 'en')).toEqual([]);
    expect(run(score, 'easy', 'en')).toHaveLength(1);
    expect(run(score, 'easy', 'id')).toEqual([]);
    expect(run(score, 'hard', 'id')).toHaveLength(1);
  });

  it('a language without its own threshold uses the en threshold', () => {
    expect(run(enThreshold, 'hard', 'it')).toEqual([]);
    expect(run(enThreshold, 'easy', 'it')).toHaveLength(1);
  });

  it('applies an injected threshold table', () => {
    const tables = tablesFor({}, undefined, { en: 70 });
    const item = validItem({ difficulty: 'easy', text: textWithScore(80) });
    expect(checkSentence('en', 'science', item, tables)).toHaveLength(1);
    expect(checkSentence('en', 'science', { ...item, difficulty: 'hard' }, tables)).toEqual([]);
  });

  it('counts digits, names and symbols, not only the length', () => {
    // 60 characters but full of digits: hard although a plain 60-character sentence is easy.
    const text = '2024 2025 2026 2027 2028 2029 2030 2031 2032 2033 2034 2035.';
    expect(text).toHaveLength(60);
    expect(check(validItem({ difficulty: 'hard', text }))).toEqual([]);
    expect(check(validItem({ difficulty: 'easy', text })).some((m) => m.includes('is hard'))).toBe(true);
  });
});

describe('checkSentence: typable characters', () => {
  it('accepts printable ASCII punctuation and digits', () => {
    const text = 'Water boils at 100 C (212 F) at sea level, i.e. "normal" pressure - 1 atm.';
    // Digits and symbols raise the score to 115, so the sentence must be labelled hard.
    expect(check(validItem({ text, difficulty: 'hard' }))).toEqual([]);
  });

  it.each([
    ['an accented letter', 'é'],
    ['a curly quote', '“'],
    ['an em dash', '—'],
    ['a degree sign', '°'],
    ['an emoji', '\u{1F600}'],
  ])('rejects %s', (_name, bad) => {
    const text = 'a'.repeat(58) + bad + '.';
    expect(check(validItem({ text })).some((m) => m.includes('not on a standard keyboard'))).toBe(true);
  });
});

describe('checkSentence: spacing', () => {
  it('rejects a double space', () => {
    const text = 'a'.repeat(30) + '  ' + 'a'.repeat(27) + '.';
    expect(check(validItem({ text })).some((m) => m.includes('single spaces'))).toBe(true);
  });

  it('rejects a leading space', () => {
    const text = ' ' + 'a'.repeat(58) + '.';
    expect(check(validItem({ text })).some((m) => m.includes('single spaces'))).toBe(true);
  });

  it('rejects a trailing space', () => {
    const text = 'a'.repeat(58) + '. ';
    expect(check(validItem({ text })).some((m) => m.includes('single spaces'))).toBe(true);
  });

  it('accepts single spaces between words', () => {
    const text = ('word ').repeat(11) + 'end.';
    expect(check(validItem({ text }))).toEqual([]);
  });
});

describe('checkSentence: final full stop', () => {
  it('accepts a text that ends with a full stop', () => {
    expect(check(validItem({ text: textOfLength(60) }))).toEqual([]);
  });

  it.each(['!', '?', 'a', ':'])('rejects a text ending with "%s"', (last) => {
    const text = 'a'.repeat(59) + last;
    expect(check(validItem({ text })).some((m) => m.includes('full stop'))).toBe(true);
  });
});

describe('checkSentence: explanation length', () => {
  const [min, max] = EXPLANATION_LENGTH;
  const run = (length: number) => check(validItem({ explanation: 'x'.repeat(length) }));

  it('accepts both bounds', () => {
    expect(run(min)).toEqual([]);
    expect(run(max)).toEqual([]);
  });

  it('rejects one character outside each bound', () => {
    expect(run(min - 1).some((m) => m.includes('explanation has'))).toBe(true);
    expect(run(max + 1).some((m) => m.includes('explanation has'))).toBe(true);
  });
});

describe('checkSentence: source title', () => {
  const run = (title: string) => check(validItem({ source: { title, url: 'https://example.org' } }));

  it.each(['Britannica: Photosynthesis', 'NASA: Mars: Overview', 'WHO: Fact sheet'])(
    'accepts "%s"',
    (title) => {
      expect(run(title)).toEqual([]);
    },
  );

  it.each([
    ['no publisher', 'Photosynthesis'],
    ['no space after the colon', 'Britannica:Photosynthesis'],
    ['empty publisher', ': Photosynthesis'],
    ['nothing after the colon', 'Britannica: '],
  ])('rejects %s', (_name, title) => {
    expect(run(title).some((m) => m.includes('source title'))).toBe(true);
  });
});

describe('checkSentence: source url', () => {
  const run = (url: string) => check(validItem({ source: { title: 'Publisher: Title', url } }));

  it('accepts https', () => {
    expect(run('https://example.org/page')).toEqual([]);
  });

  it.each(['http://example.org', 'ftp://example.org', 'example.org'])('rejects "%s"', (url) => {
    expect(run(url).some((m) => m.includes('https://'))).toBe(true);
  });
});

describe('languages without their own rules', () => {
  it('use the fallback length range', () => {
    expect(FALLBACK_LENGTH_LANG in TEXT_LENGTH).toBe(true);
    expect(getTextLength('it')).toEqual(TEXT_LENGTH[FALLBACK_LENGTH_LANG]);
    expect(getTextLength('id')).toEqual(TEXT_LENGTH.id);
  });

  it('accept a valid sentence of a new language', () => {
    const item = validItem({ id: 'it-science-001' });
    expect(checkSentence('it', 'science', item)).toEqual([]);
  });

  it('still check the id prefix, the length and the characters', () => {
    expect(checkSentence('it', 'science', validItem({ id: 'en-science-001' }))).toHaveLength(1);
    expect(checkSentence('it', 'science', validItem({ id: 'it-science-001', text: 'a.' }))).toHaveLength(1);
    expect(
      checkSentence('nl', 'science', validItem({ id: 'nl-science-001', text: textOfLength(60) })),
    ).toEqual([]);
  });
});

// Rules for languages that are not in the corpus yet, injected so the mechanism is tested
// without adding a real language. The Vietnamese range is a sample, not a reviewed rule set.
const VI_RULES: LanguageRules = {
  allowedChar: /[\x20-\x7E\u00C0-\u00FF\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]/,
  hint: 'Use Vietnamese letters only.',
};
const VI_LENGTH = [20, 40] as const;

function tablesFor(
  languageRules: Record<string, LanguageRules>,
  textLength?: TextLengthTable,
  difficultyThresholds?: DifficultyThresholds,
): RuleTables {
  return {
    languageRules,
    textLength: textLength ?? TEXT_LENGTH,
    difficultyThresholds: difficultyThresholds ?? DIFFICULTY_THRESHOLDS,
  };
}

/** Languages with their own character rules (launched or still drafts). */
const ACCENTED_LANGUAGES = ['de', 'es', 'fr', 'pt-br'];

describe('per-language character rules', () => {
  it('ship rules for the accented languages only: id and en keep the ASCII default', () => {
    expect(Object.keys(LANGUAGE_RULES).sort()).toEqual(ACCENTED_LANGUAGES);
    expect(getLanguageRules('id')).toBe(DEFAULT_LANGUAGE_RULES);
    expect(getLanguageRules('en')).toBe(DEFAULT_LANGUAGE_RULES);
    expect(getLanguageRules('vi')).toBe(DEFAULT_LANGUAGE_RULES);
  });

  it('getLanguageRules prefers the entry of the language', () => {
    expect(getLanguageRules('vi', { vi: VI_RULES })).toBe(VI_RULES);
    expect(getLanguageRules('en', { vi: VI_RULES })).toBe(DEFAULT_LANGUAGE_RULES);
  });

  it('findDisallowedChars lists each offending character once, in order', () => {
    expect(findDisallowedChars('abc', DEFAULT_LANGUAGE_RULES)).toEqual([]);
    expect(findDisallowedChars('aébéc\u00B0', DEFAULT_LANGUAGE_RULES)).toEqual(['é', '\u00B0']);
    expect(findDisallowedChars('aé', { allowedChar: /[a-z\u00E9]/, hint: '' })).toEqual([]);
  });

  it('an accented text fails under the default ASCII rule', () => {
    const text = 'Ng\u1ECBch l\u00FD tr\u1EB7ng l\u00E0 c\u00E1c ng\u00F4i sao trong v\u0169 tr\u1EE5 r\u1ED9ng l\u1EDBn.';
    const item = validItem({ id: 'vi-science-001', text });
    const problems = checkSentence('vi', 'science', item);
    expect(problems.some((m) => m.includes('not on a standard keyboard for "vi"'))).toBe(true);
  });

  it('the same text passes when its language has its own rules', () => {
    const text = 'Nh\u1EEFng ng\u00F4i sao trong v\u0169 tr\u1EE5 r\u1ED9ng l\u1EDBn.';
    const item = validItem({ id: 'vi-science-001', text });
    const tables = tablesFor({ vi: VI_RULES }, { ...TEXT_LENGTH, vi: VI_LENGTH });
    expect(checkSentence('vi', 'science', item, tables)).toEqual([]);
  });

  it('a character outside the language rules is still rejected and the hint is shown', () => {
    const text = 'Nh\u1EEFng ng\u00F4i sao \u201Ctrong\u201D v\u0169 tr\u1EE5 r\u1ED9ng l\u1EDBn.';
    const item = validItem({ id: 'vi-science-001', text });
    const tables = tablesFor({ vi: VI_RULES }, { ...TEXT_LENGTH, vi: VI_LENGTH });
    const problem = checkSentence('vi', 'science', item, tables).find((m) => m.includes('standard keyboard'));
    expect(problem).toContain('\u201C \u201D');
    expect(problem).toContain('Use Vietnamese letters only.');
  });

  it('rules of one language do not leak into another', () => {
    const item = validItem({ id: 'en-science-001', text: 'a'.repeat(58) + '\u00E9.' });
    const tables = tablesFor({ vi: VI_RULES });
    expect(checkSentence('en', 'science', item, tables).some((m) => m.includes('standard keyboard'))).toBe(true);
  });

  it('rejects text that is not NFC (a base letter plus a combining mark)', () => {
    const decomposed = 'e\u0301'.normalize('NFD');
    const text = 'a'.repeat(57) + decomposed + '.';
    const item = validItem({ id: 'fr-science-001', text });
    const permissive: Record<string, LanguageRules> = {
      fr: { allowedChar: /[\x20-\x7E\u00E9\u0301]/, hint: '' },
    };
    const problems = checkSentence('fr', 'science', item, tablesFor(permissive));
    expect(problems.some((m) => m.includes('NFC'))).toBe(true);
    const composed = validItem({ id: 'fr-science-001', text: 'a'.repeat(57) + '\u00E9.' });
    expect(checkSentence('fr', 'science', composed, tablesFor(permissive))).toEqual([]);
  });
});

describe('per-language length ranges', () => {
  it('getTextLength uses an injected table and still falls back to en', () => {
    const table: TextLengthTable = { en: [1, 2], vi: [3, 4] };
    expect(getTextLength('vi', table)).toEqual([3, 4]);
    expect(getTextLength('zz', table)).toEqual([1, 2]);
  });

  it('checkSentence applies the length range of the language, not the fallback', () => {
    const tables = tablesFor({}, { en: [50, 95], xx: [10, 20] });
    const short = validItem({ id: 'xx-science-001', text: textOfLength(15) });
    expect(checkSentence('xx', 'science', short, tables)).toEqual([]);
    expect(checkSentence('xx', 'science', short)).toHaveLength(1);
  });
});

// Rules of the draft languages (T37a, spec 21.2). Each language has passing sentences (every
// accented letter it allows, upper and lower case) and failing ones (each forbidden character).
// Letters are \u escapes so this file stays NFC and the characters under test are unambiguous.
describe('accented languages: character rules', () => {
  /** A sentence of `lang` with `body` inside, padded with plain letters to a valid length. */
  function sentenceWith(body: string): string {
    const filler = 'a'.repeat(70);
    return `${filler} ${body}.`;
  }
  function problemsOf(lang: string, body: string): string[] {
    const text = sentenceWith(body);
    const item = validItem({
      id: `${lang}-science-001`,
      difficulty: classifyDifficulty(text, lang),
      text,
    });
    return checkSentence(lang, 'science', item).filter((m) => m.includes('standard keyboard'));
  }

  const ALLOWED: Record<string, string> = {
    es: '\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1',
    'pt-br': '\u00E1\u00E0\u00E2\u00E3\u00E7\u00E9\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA',
    fr: '\u00E0\u00E2\u00E7\u00E9\u00E8\u00EA\u00EB\u00EE\u00EF\u00F4\u00F9\u00FB\u00FC',
    de: '\u00E4\u00F6\u00FC\u00DF',
  };
  const FORBIDDEN: Record<string, string> = {
    es: '\u00BF\u00A1',
    'pt-br': '\u00FC',
    fr: '\u0153\u00E6\u00FF\u00AB\u00BB',
    de: '\u1E9E',
  };

  it('has a rule, a length range and a threshold for every accented language', () => {
    for (const lang of ACCENTED_LANGUAGES) {
      expect(lang in LANGUAGE_RULES, `${lang} rules`).toBe(true);
      expect(lang in TEXT_LENGTH, `${lang} length`).toBe(true);
      expect(lang in DIFFICULTY_THRESHOLDS, `${lang} threshold`).toBe(true);
    }
  });

  it('starts every accented-language length range at the en range x 1.15, rounded (57.5 -> 58, 195.5 -> 196)', () => {
    const [enMin, enMax] = TEXT_LENGTH.en;
    for (const lang of ACCENTED_LANGUAGES) {
      expect(TEXT_LENGTH[lang], lang).toEqual([Math.round((enMin * 115) / 100), Math.round((enMax * 115) / 100)]);
    }
  });

  it.each(Object.keys(ALLOWED))('%s: every allowed letter passes, lower and upper case', (lang) => {
    const lower = ALLOWED[lang];
    // The capital sharp s is not allowed, so German capitals skip the sharp s.
    const upper = [...lower].filter((ch) => ch !== '\u00DF').map((ch) => ch.toUpperCase());
    expect(problemsOf(lang, [...lower].join(' '))).toEqual([]);
    expect(problemsOf(lang, upper.join(' '))).toEqual([]);
  });

  it.each(Object.keys(FORBIDDEN))('%s: each forbidden character is rejected on its own', (lang) => {
    for (const ch of FORBIDDEN[lang]) {
      const problems = problemsOf(lang, `x${ch}y`);
      expect(problems, `U+${ch.codePointAt(0)!.toString(16)}`).toHaveLength(1);
      expect(problems[0]).toContain(ch);
    }
  });

  it('rejects a letter that belongs to another accented language', () => {
    expect(problemsOf('es', '\u00E7')).toHaveLength(1); // c-cedilla is not Spanish
    expect(problemsOf('de', '\u00E9')).toHaveLength(1); // e-acute is not German
    expect(problemsOf('pt-br', '\u00F1')).toHaveLength(1); // n-tilde is not Portuguese
    expect(problemsOf('fr', '\u00F5')).toHaveLength(1); // o-tilde is not French
  });

  it('rejects the curly apostrophe and quotes, the long dash and emoji in every accented language', () => {
    for (const lang of ACCENTED_LANGUAGES) {
      for (const ch of ['\u2019', '\u201C', '\u2014', '\u{1F600}']) {
        expect(problemsOf(lang, `x${ch}y`), `${lang} U+${ch.codePointAt(0)!.toString(16)}`).toHaveLength(1);
      }
      expect(problemsOf(lang, "x'y")).toEqual([]); // the plain ASCII apostrophe is fine
    }
  });

  it('the hint names the allowed letters and what to do instead', () => {
    expect(getLanguageRules('es').hint).toContain('\u00F1');
    expect(getLanguageRules('es').hint).toContain('\u00BF');
    expect(getLanguageRules('fr').hint).toContain('\u0153');
    expect(getLanguageRules('de').hint).toContain('\u00DF');
    expect(getLanguageRules('pt-br').hint).toContain('\u00FC');
  });

  it('shows the hint in the build message of a rejected character', () => {
    const [problem] = problemsOf('es', '\u00BFx');
    expect(problem).toContain('\u00BF');
    expect(problem).toContain('inverted marks');
  });

  it('keeps every letter rule in Unicode NFC (no decomposed letter in a rule)', () => {
    for (const lang of ACCENTED_LANGUAGES) {
      const { allowedChar, hint } = getLanguageRules(lang);
      expect(hint).toBe(hint.normalize('NFC'));
      expect(allowedChar.source).toBe(allowedChar.source.normalize('NFC'));
      expect(allowedChar.global || allowedChar.sticky, `${lang} flags`).toBe(false);
    }
  });

  it('French: a space before : ; ! or ? is rejected, the mark right after the word passes', () => {
    const run = (body: string) => {
      const text = sentenceWith(body);
      const item = validItem({ id: 'fr-science-001', difficulty: classifyDifficulty(text, 'fr'), text });
      return checkSentence('fr', 'science', item);
    };
    for (const mark of [':', ';', '!', '?']) {
      const problems = run(`oui ${mark} non`);
      expect(problems, mark).toHaveLength(1);
      expect(problems[0]).toContain('space before');
      expect(run(`oui${mark} non`), mark).toEqual([]);
    }
  });

  it('the French spacing rule does not apply to other languages', () => {
    const text = sentenceWith('oui : non');
    const item = validItem({ id: 'es-science-001', difficulty: classifyDifficulty(text, 'es'), text });
    expect(checkSentence('es', 'science', item)).toEqual([]);
  });

  it('a decomposed accented letter (letter + combining mark) fails NFC and the keyboard rule', () => {
    const text = sentenceWith('cafe\u0301');
    const item = validItem({ id: 'fr-science-001', difficulty: classifyDifficulty(text, 'fr'), text });
    const problems = checkSentence('fr', 'science', item);
    expect(problems.some((m) => m.includes('NFC'))).toBe(true);
  });

  it('sample sentences pass: one realistic sentence per draft language', () => {
    const samples: Record<string, string> = {
      es: 'El ni\u00F1o aprendi\u00F3 que el sonido viaja m\u00E1s r\u00E1pido en el agua que en el aire.',
      'pt-br': 'A fotoss\u00EDntese transforma luz em energia qu\u00EDmica dentro das c\u00E9lulas das plantas.',
      fr: "L'eau bout \u00E0 cent degr\u00E9s au niveau de la mer, mais plus t\u00F4t en haute montagne.",
      de: 'Die Gr\u00F6\u00DFe eines Sterns bestimmt, wie lange er leuchtet und wie er endet.',
    };
    for (const [lang, text] of Object.entries(samples)) {
      const item = validItem({ id: `${lang}-science-001`, difficulty: classifyDifficulty(text, lang), text });
      expect(checkSentence(lang, 'science', item), lang).toEqual([]);
    }
  });
});

describe('placeholder skeletons', () => {
  it('rejects any sentence that still contains the placeholder, with one clear message', () => {
    const problems = checkSentence(
      'en',
      'science',
      validItem({ text: 'REPLACE_ME: write one sentence here.', difficulty: 'easy' }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"en-science-001"');
    expect(problems[0]).toContain('REPLACE_ME');
  });

  it.each(['explanation', 'source title', 'source url'])('also finds it in the %s', (field) => {
    const marker = 'REPLACE_ME';
    const item = validItem();
    if (field === 'explanation') item.explanation = marker + 'x'.repeat(60);
    if (field === 'source title') item.source = { ...item.source, title: `${marker}: Publisher: Page` };
    if (field === 'source url') item.source = { ...item.source, url: `https://example.org/${marker}` };
    expect(checkSentence('en', 'science', item)).toHaveLength(1);
  });

  it('does not report a normal sentence', () => {
    expect(checkSentence('en', 'science', validItem())).toEqual([]);
  });
});
