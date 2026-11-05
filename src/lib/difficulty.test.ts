import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_THRESHOLDS,
  DIFFICULTY_WEIGHTS,
  FALLBACK_THRESHOLD_LANG,
  LONG_WORD_LETTERS,
  classifyDifficulty,
  getDifficultyThreshold,
  scoreSentence,
} from './difficulty';

describe('scoreSentence', () => {
  it('is the length of a plain sentence (one capital at the start, a final full stop)', () => {
    expect(scoreSentence('Hello world.')).toBe(12);
    expect(scoreSentence('a b.')).toBe(4);
  });

  it('adds the digit weight per digit', () => {
    expect(scoreSentence('Room 12.')).toBe('Room 12.'.length + 2 * DIFFICULTY_WEIGHTS.digit);
  });

  it('adds the capital weight for capitals after the first character, not for the first', () => {
    expect(scoreSentence('The Moon.')).toBe('The Moon.'.length + DIFFICULTY_WEIGHTS.innerCapital);
    expect(scoreSentence('the moon.')).toBe('the moon.'.length);
    expect(scoreSentence('THE.')).toBe('THE.'.length + 2 * DIFFICULTY_WEIGHTS.innerCapital);
  });

  it('adds the punctuation weight per symbol but not for spaces or the final full stop', () => {
    expect(scoreSentence('Yes it is.')).toBe(10);
    expect(scoreSentence('Yes, it is.')).toBe('Yes, it is.'.length + DIFFICULTY_WEIGHTS.punctuation);
    expect(scoreSentence('well-known.')).toBe('well-known.'.length + DIFFICULTY_WEIGHTS.punctuation);
  });

  it('counts a full stop inside the sentence, and every symbol of a text without a final full stop', () => {
    expect(scoreSentence('a.b.')).toBe(4 + DIFFICULTY_WEIGHTS.punctuation);
    expect(scoreSentence('Yes, it is')).toBe('Yes, it is'.length + DIFFICULTY_WEIGHTS.punctuation);
    expect(scoreSentence('Yes it is.')).toBeLessThan(scoreSentence('Yes it is!'));
  });

  it('adds the long-word weight for words of 10 letters or more only', () => {
    const nine = 'a'.repeat(LONG_WORD_LETTERS - 1);
    const ten = 'a'.repeat(LONG_WORD_LETTERS);
    expect(scoreSentence(`${nine}.`)).toBe(nine.length + 1);
    expect(scoreSentence(`${ten}.`)).toBe(ten.length + 1 + DIFFICULTY_WEIGHTS.longWord);
  });

  it('a hyphen splits a word for the long-word count', () => {
    const half = 'a'.repeat(LONG_WORD_LETTERS - 1);
    const text = `${half}-${half}.`;
    expect(scoreSentence(text)).toBe(text.length + DIFFICULTY_WEIGHTS.punctuation);
  });

  it('treats accented letters as letters, not as symbols', () => {
    expect(scoreSentence('caf\u00E9.')).toBe(5);
  });

  it('combines every factor', () => {
    const text = 'Water boils at 100 C (212 F) at sea level, i.e. "normal" pressure - 1 atm.';
    // Length 75, 7 digits, 4 inner capitals, 8 symbols, no long word; the value is pinned on purpose.
    expect(scoreSentence(text)).toBe(115);
  });
});

describe('thresholds', () => {
  it('has an entry for the fallback language', () => {
    expect(FALLBACK_THRESHOLD_LANG in DIFFICULTY_THRESHOLDS).toBe(true);
  });

  it('is higher for Indonesian than for English (its sentences run longer)', () => {
    expect(DIFFICULTY_THRESHOLDS.id).toBeGreaterThan(DIFFICULTY_THRESHOLDS.en);
  });

  it('getDifficultyThreshold falls back to the en threshold and accepts an injected table', () => {
    expect(getDifficultyThreshold('id')).toBe(DIFFICULTY_THRESHOLDS.id);
    expect(getDifficultyThreshold('it')).toBe(DIFFICULTY_THRESHOLDS.en);
    expect(getDifficultyThreshold('fr', { en: 50, fr: 70 })).toBe(70);
    expect(getDifficultyThreshold('de', { en: 50, fr: 70 })).toBe(50);
  });
});

describe('thresholds of the draft languages (T37a)', () => {
  it('start from the en threshold times a length factor (es, pt-br, fr 1.2; de 1.15)', () => {
    const en = DIFFICULTY_THRESHOLDS.en;
    for (const lang of ['es', 'pt-br', 'fr']) {
      expect(DIFFICULTY_THRESHOLDS[lang], lang).toBe(Math.round((en * 120) / 100));
    }
    expect(DIFFICULTY_THRESHOLDS.de).toBe(Math.round((en * 115) / 100));
  });

  it('are used instead of the en threshold', () => {
    expect(getDifficultyThreshold('es')).toBe(120);
    expect(getDifficultyThreshold('de')).toBe(115);
    // 110 points: easy for Spanish (below 120), hard for English (at or above 100).
    const text = 'a'.repeat(104) + '.';
    expect(scoreSentence(text)).toBe(110);
    expect(classifyDifficulty(text, 'es')).toBe('easy');
    expect(classifyDifficulty(text, 'en')).toBe('hard');
  });

  it('score accented letters as letters, not as punctuation', () => {
    expect(scoreSentence('El ni\u00F1o come pi\u00F1as.')).toBe('El ni\u00F1o come pi\u00F1as.'.length);
    expect(scoreSentence('Les \u00E9l\u00E8ves \u00E9tudient.')).toBe('Les \u00E9l\u00E8ves \u00E9tudient.'.length);
  });
});

describe('classifyDifficulty', () => {
  // `a`.repeat(n - 1) + '.' scores n + 5 for n >= 10 (one long word).
  const withScore = (score: number) => 'a'.repeat(score - 6) + '.';
  const threshold = DIFFICULTY_THRESHOLDS.en;

  it('is easy below the threshold and hard at it', () => {
    expect(scoreSentence(withScore(threshold))).toBe(threshold);
    expect(classifyDifficulty(withScore(threshold - 1), 'en')).toBe('easy');
    expect(classifyDifficulty(withScore(threshold), 'en')).toBe('hard');
    expect(classifyDifficulty(withScore(threshold + 1), 'en')).toBe('hard');
  });

  it('uses the threshold of the language', () => {
    const text = withScore(DIFFICULTY_THRESHOLDS.en + 5);
    expect(classifyDifficulty(text, 'en')).toBe('hard');
    expect(classifyDifficulty(text, 'id')).toBe('easy');
  });

  it('uses an injected table', () => {
    expect(classifyDifficulty('Hello world.', 'en', { en: 12 })).toBe('hard');
    expect(classifyDifficulty('Hello world.', 'en', { en: 13 })).toBe('easy');
  });

  it('a short sentence full of numbers is hard and a long plain one can be easy', () => {
    const numbers = '2024 2025 2026 2027 2028 2029 2030 2031 2032 2033 2034 2035.';
    expect(numbers).toHaveLength(60);
    expect(classifyDifficulty(numbers, 'en')).toBe('hard');
    expect(classifyDifficulty('the cat sat on the mat and the dog '.repeat(2) + 'ran.', 'en')).toBe('easy');
  });
});
