import type { APIRoute } from 'astro';
import { LANGUAGES } from '@/i18n/config';
import type { Language } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { buildManifest } from '@/lib/manifest';

export function getStaticPaths() {
  return LANGUAGES.map((lang) => ({ params: { lang } }));
}

// One manifest per interface language, generated so its name and description stay in the
// dictionary (the single source of the texts).
export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Language;
  const ui = getDictionary(lang);
  const manifest = buildManifest({
    lang,
    name: ui.meta.siteName,
    description: ui.meta.description,
    text: {
      statsName: ui.nav.stats,
      collectionName: ui.nav.collection,
      screenshotNarrow: ui.pwa.screenshotNarrow,
      screenshotWide: ui.pwa.screenshotWide,
    },
  });
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
