import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { getCategories } from '@/lib/get-categories';
import { getContentLangs } from '@/lib/get-content-langs';
import { buildSentences } from '@/lib/sentence-corpus';

/** One JSON file per content language found under src/content/sentences/. */
export const getStaticPaths = (async () =>
  (await getContentLangs()).map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

/**
 * Emits the static JSON consumed by the typing island at runtime.
 * Fails the build on content mistakes the schema cannot catch (see buildSentences), and on
 * categories that are not registered in src/content/categories.json (see getCategories).
 */
export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as string;
  await getCategories();
  const files = await getCollection('sentences', ({ data }) => data.lang === lang);
  return new Response(JSON.stringify(buildSentences(files)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
