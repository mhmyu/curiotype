import type { Language } from './config';
import type { Dictionary } from './types';
import { en } from './ui/en';
import { id } from './ui/id';

const DICTIONARIES: Record<Language, Dictionary> = { id, en };

export function getDictionary(lang: Language): Dictionary {
  return DICTIONARIES[lang];
}

/** Builds an internal URL for a language, e.g. getLocalePath('en', 'about') -> /en/about/ */
export function getLocalePath(lang: Language, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return clean ? `/${lang}/${clean}/` : `/${lang}/`;
}
