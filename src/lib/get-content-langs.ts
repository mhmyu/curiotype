import { getCollection } from 'astro:content';
import type { ContentLang } from '@/i18n/config';
import { discoverContentLangs } from './content-langs';

/** Content languages found under `src/content/sentences/` (build time only). */
export async function getContentLangs(): Promise<ContentLang[]> {
  const files = await getCollection('sentences');
  return discoverContentLangs(files.map((file) => file.id));
}
