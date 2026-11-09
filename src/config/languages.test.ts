import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/config';
import { resolveContentLang } from '../lib/content-langs';
import { CONTENT_LANG_PATTERN } from '../lib/content-langs';
import { DRAFT_LANGUAGES, isDraftLanguage, listSelectableContentLangs } from './languages';

const ALL = ['de', 'en', 'es', 'fr', 'id', 'pt-br'];

describe('DRAFT_LANGUAGES', () => {
  it('lists the sentence languages that are not launched yet', () => {
    expect([...DRAFT_LANGUAGES].sort()).toEqual(['de', 'fr', 'pt-br']);
  });

  it('holds valid, unique, lowercase language codes', () => {
    expect(new Set(DRAFT_LANGUAGES).size).toBe(DRAFT_LANGUAGES.length);
    for (const code of DRAFT_LANGUAGES) expect(CONTENT_LANG_PATTERN.test(code), code).toBe(true);
  });

  it('never lists a launched language (id, en, es) or one that has an interface', () => {
    for (const code of [...LANGUAGES, 'es']) expect(isDraftLanguage(code), code).toBe(false);
  });
});

describe('isDraftLanguage', () => {
  it('is true for a listed code and false otherwise', () => {
    expect(isDraftLanguage('fr')).toBe(true);
    expect(isDraftLanguage('pt-br')).toBe(true);
    expect(isDraftLanguage('es')).toBe(false);
    expect(isDraftLanguage('en')).toBe(false);
    expect(isDraftLanguage('it')).toBe(false);
  });

  it('accepts an injected list', () => {
    expect(isDraftLanguage('en', ['en'])).toBe(true);
    expect(isDraftLanguage('fr', [])).toBe(false);
  });
});

describe('listSelectableContentLangs', () => {
  it('production: drafts are left out of the select', () => {
    expect(listSelectableContentLangs(ALL, { dev: false })).toEqual(['en', 'es', 'id']);
  });

  it('dev: every language is listed, drafts included', () => {
    expect(listSelectableContentLangs(ALL, { dev: true })).toEqual(ALL);
  });

  it('production: a draft that is in use stays listed, so the select is never blank', () => {
    expect(listSelectableContentLangs(ALL, { dev: false, active: 'fr' })).toEqual(['en', 'es', 'fr', 'id']);
  });

  it('production: an active language that is not a draft changes nothing', () => {
    expect(listSelectableContentLangs(ALL, { dev: false, active: 'id' })).toEqual(['en', 'es', 'id']);
  });

  it('launching a language = removing its code from the draft list', () => {
    expect(listSelectableContentLangs(ALL, { dev: false, drafts: ['de', 'pt-br'] })).toEqual([
      'en',
      'es',
      'fr',
      'id',
    ]);
    expect(listSelectableContentLangs(ALL, { dev: false, drafts: [] })).toEqual(ALL);
  });

  it('does not modify the input and keeps its order', () => {
    const input = ['id', 'fr', 'es', 'en'];
    expect(listSelectableContentLangs(input, { dev: false })).toEqual(['id', 'es', 'en']);
    expect(input).toEqual(['id', 'fr', 'es', 'en']);
  });

  it('a language with no folder is never invented', () => {
    expect(listSelectableContentLangs(['id', 'en'], { dev: true })).toEqual(['id', 'en']);
    expect(listSelectableContentLangs(['id', 'en'], { dev: false, active: 'fr' })).toEqual(['id', 'en']);
  });
});

describe('drafts and resolveContentLang (resolution uses every discovered language)', () => {
  it('still accepts a saved draft language, even though the select does not list it', () => {
    expect(resolveContentLang('fr', ALL)).toBe('fr');
    expect(listSelectableContentLangs(ALL, { dev: false })).not.toContain('fr');
  });

  it('falls back when the draft folder does not exist', () => {
    expect(resolveContentLang('fr', ['id', 'en'])).toBe('id');
  });
});
