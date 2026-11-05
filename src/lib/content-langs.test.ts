import { describe, expect, it } from 'vitest';
import {
  contentLangFromEntryId,
  discoverContentLangs,
  isContentLang,
  resolveContentLang,
} from './content-langs';

describe('isContentLang', () => {
  it('accepts lowercase language codes with optional subtags', () => {
    for (const code of ['id', 'en', 'fil', 'pt-br', 'zh-hans', 'sr-latn-rs']) {
      expect(isContentLang(code)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const code of ['', 'e', 'english', 'EN', 'pt-BR', 'pt_br', 'en:us', 'en/us', ' en', 'en-', 1, null]) {
      expect(isContentLang(code)).toBe(false);
    }
  });
});

describe('contentLangFromEntryId', () => {
  it('returns the folder of a "<lang>/<category>" entry id', () => {
    expect(contentLangFromEntryId('id/health')).toBe('id');
    expect(contentLangFromEntryId('pt-br/science')).toBe('pt-br');
  });

  it('throws for a file outside a language folder', () => {
    expect(() => contentLangFromEntryId('health')).toThrow(/language folder/);
  });

  it('throws for a folder that is not a valid code', () => {
    expect(() => contentLangFromEntryId('English/health')).toThrow(/"English"/);
    expect(() => contentLangFromEntryId('pt-BR/health')).toThrow(/"pt-BR"/);
  });
});

describe('discoverContentLangs', () => {
  it('returns each language once, sorted', () => {
    expect(discoverContentLangs(['id/health', 'en/science', 'id/science', 'en/health'])).toEqual([
      'en',
      'id',
    ]);
  });

  it('picks up a new folder without any other change', () => {
    const before = ['id/health', 'en/health'];
    expect(discoverContentLangs([...before, 'fr/health'])).toEqual(['en', 'fr', 'id']);
  });

  it('returns an empty list when there are no files', () => {
    expect(discoverContentLangs([])).toEqual([]);
  });

  it('throws on an invalid folder instead of skipping it', () => {
    expect(() => discoverContentLangs(['id/health', 'XX/health'])).toThrow();
  });
});

describe('resolveContentLang', () => {
  it('keeps the preferred language when it exists', () => {
    expect(resolveContentLang('en', ['en', 'id'])).toBe('en');
  });

  it('falls back to the default language, then to the first one', () => {
    expect(resolveContentLang('fr', ['en', 'id'])).toBe('id');
    expect(resolveContentLang('fr', ['de', 'en'])).toBe('de');
  });

  it('uses the given fallback', () => {
    expect(resolveContentLang('fr', ['en', 'id'], 'en')).toBe('en');
  });

  it('throws when no language exists', () => {
    expect(() => resolveContentLang('id', [])).toThrow(/No sentence languages/);
  });
});
