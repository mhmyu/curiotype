import { getCollection } from 'astro:content';
import registryJson from '@/content/categories.json';
import { LANGUAGES } from '@/i18n/config';
import { buildCategories, parseCategoryRegistry } from './categories';
import type { BuiltCategories, CategoryDefinition } from './categories';

export interface SiteCategories extends BuiltCategories {
  registry: CategoryDefinition[];
}

let warned = false;

/**
 * Registered categories and the ones each sentence language has (build time only).
 * Fails the build on a broken `categories.json` or a sentence file whose category is not registered.
 */
export async function getCategories(): Promise<SiteCategories> {
  const registry = parseCategoryRegistry(registryJson, LANGUAGES);
  const files = await getCollection('sentences');
  const built = buildCategories(
    registry,
    files.map((file) => ({ path: `${file.id}.json`, lang: file.data.lang, category: file.data.category })),
  );
  if (built.unused.length > 0 && !warned) {
    warned = true;
    console.warn(`[categories] Registered but without any sentence file: ${built.unused.join(', ')}.`);
  }
  return { registry, ...built };
}
