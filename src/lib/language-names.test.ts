import { describe, expect, it } from 'vitest';
import { getLanguageDisplayName } from './language-names';

describe('getLanguageDisplayName', () => {
  it('names a language in the interface language', () => {
    expect(getLanguageDisplayName('en', 'id')).toBe('Inggris');
    expect(getLanguageDisplayName('id', 'id')).toBe('Indonesia');
    expect(getLanguageDisplayName('en', 'en')).toBe('English');
    expect(getLanguageDisplayName('id', 'en')).toBe('Indonesian');
  });

  it('names a regional code', () => {
    expect(getLanguageDisplayName('pt-br', 'en')).toMatch(/Portuguese/);
    expect(getLanguageDisplayName('pt-br', 'id')).toMatch(/Portugis/);
  });

  it('names every draft sentence language in both interface languages', () => {
    expect(getLanguageDisplayName('es', 'id')).toBe('Spanyol');
    expect(getLanguageDisplayName('es', 'en')).toBe('Spanish');
    expect(getLanguageDisplayName('fr', 'id')).toBe('Prancis');
    expect(getLanguageDisplayName('fr', 'en')).toBe('French');
    expect(getLanguageDisplayName('de', 'id')).toBe('Jerman');
    expect(getLanguageDisplayName('de', 'en')).toBe('German');
  });

  it('falls back to the upper-cased code when the runtime has no name for it', () => {
    expect(getLanguageDisplayName('zzz', 'en')).toBe('ZZZ');
  });

  it('falls back to the code for an invalid display locale or code', () => {
    expect(getLanguageDisplayName('en', 'not a locale')).toBe('EN');
    expect(getLanguageDisplayName('!!', 'en')).toBe('!!');
  });
});
