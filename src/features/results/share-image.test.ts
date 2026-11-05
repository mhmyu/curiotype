import { describe, expect, it } from 'vitest';
import type { Sentence } from '@/lib/types';
import {
  SHARE_FACT_MAX_LINES,
  getShareFileName,
  getShareText,
  pickShareFact,
  wrapText,
} from './share-image';

// One pixel per character keeps the expected lines easy to read.
const measure = (text: string): number => text.length;

function sentence(id: string, text: string): Sentence {
  return {
    id,
    lang: 'en',
    category: 'science',
    difficulty: 'easy',
    text,
    explanation: 'Explanation.',
    source: { title: 'Publisher: Page', url: 'https://example.org/page' },
  };
}

describe('pickShareFact', () => {
  const a = sentence('a', 'First sentence.');
  const b = sentence('b', 'Second sentence.');

  it('prefers the first sentence that was typed to the end', () => {
    expect(pickShareFact([a, b], [b])).toBe('Second sentence.');
  });

  it('falls back to the first sentence that was started', () => {
    expect(pickShareFact([a, b], [])).toBe('First sentence.');
  });

  it('returns null when nothing was typed', () => {
    expect(pickShareFact([], [])).toBeNull();
  });
});

describe('wrapText', () => {
  it('keeps a short text on one line', () => {
    expect(wrapText('one two three', 20, measure, 3)).toEqual(['one two three']);
  });

  it('breaks between words without exceeding the width', () => {
    const lines = wrapText('aaaa bbbb cccc dddd', 9, measure, 5);
    expect(lines).toEqual(['aaaa bbbb', 'cccc dddd']);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(9);
  });

  it('collapses repeated whitespace', () => {
    expect(wrapText('  aa   bb  ', 20, measure, 3)).toEqual(['aa bb']);
  });

  it('ends the last line with an ellipsis when the text is too long', () => {
    const lines = wrapText('aaaa bbbb cccc dddd eeee ffff', 9, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('aaaa bbbb');
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1])).toBeLessThanOrEqual(9);
  });

  it('does not add an ellipsis when the text fills the lines exactly', () => {
    expect(wrapText('aaaa bbbb cccc dddd', 9, measure, 2)).toEqual(['aaaa bbbb', 'cccc dddd']);
  });

  it('cuts a single word that is wider than the line', () => {
    const lines = wrapText('abcdefghijklmnop', 8, measure, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('…')).toBe(true);
    expect(measure(lines[0])).toBeLessThanOrEqual(8);
  });

  it('returns no lines for empty text or no room', () => {
    expect(wrapText('   ', 10, measure, 3)).toEqual([]);
    expect(wrapText('abc', 10, measure, 0)).toEqual([]);
  });

  it('never returns more lines than allowed', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    expect(wrapText(text, 30, measure, SHARE_FACT_MAX_LINES)).toHaveLength(SHARE_FACT_MAX_LINES);
  });
});

describe('getShareFileName', () => {
  it('uses the rounded WPM', () => {
    expect(getShareFileName(42.6)).toBe('typing-result-43wpm.png');
    expect(getShareFileName(0)).toBe('typing-result-0wpm.png');
  });

  it('never writes a negative number', () => {
    expect(getShareFileName(-3)).toBe('typing-result-0wpm.png');
  });
});

describe('getShareText', () => {
  it('summarizes speed and accuracy', () => {
    expect(
      getShareText({ siteName: 'Typing Knowledge', wpm: 51.4, wpmLabel: 'WPM', accuracy: 97, accuracyLabel: 'Accuracy' }),
    ).toBe('Typing Knowledge: 51 WPM, Accuracy 97%');
  });
});
