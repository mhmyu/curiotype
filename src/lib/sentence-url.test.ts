import { describe, expect, it } from 'vitest';
import { getSentencesUrl } from './sentence-url';

describe('getSentencesUrl', () => {
  it('builds the same-origin path of the sentence file', () => {
    expect(getSentencesUrl('id')).toBe('/data/id/sentences.json');
    expect(getSentencesUrl('en')).toBe('/data/en/sentences.json');
  });

  it('keeps hyphenated language codes as they are', () => {
    expect(getSentencesUrl('pt-br')).toBe('/data/pt-br/sentences.json');
  });
});
