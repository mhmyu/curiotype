import { DEFAULT_LANGUAGE, LANGUAGES } from '@/i18n/config';
import type { Language } from '@/i18n/config';

/**
 * The root URL (`/`) sends a visitor to the interface language that fits the browser's language
 * list. Only `/` does this: `/id/` and `/en/` are never redirected, so a link, a bookmark or a
 * deliberate language choice always lands where it points.
 *
 * Rules, in order:
 * 1. The first language in the browser's list (most preferred first) that the site has wins, so
 *    `["es", "id"]` opens `/id/` and `["en-GB", "id"]` opens `/en/`. The old code `in` means
 *    Indonesian (some Android and Java browsers still report it).
 * 2. A list with no language the site has opens the fallback language (English), the most widely
 *    read one, not the default of the site.
 * 3. A browser that reports no language at all opens the default language.
 * The path, query string and hash of the visit are kept (`/?utm_source=x` -> `/en/?utm_source=x`).
 */

/** Language of visitors whose browser lists no language the site has. */
export const FALLBACK_LANGUAGE: Language = 'en';

/** Language codes that mean one of ours, besides the code itself. */
export const LANGUAGE_ALIASES: Record<string, Language> = { in: 'id' };

/**
 * Inline script of the root page. Plain ES5 on purpose (no build step touches it), a constant with
 * only build-time data interpolated, so its CSP hash can be computed from this exact string. It
 * leaves the page alone if anything fails: the language links on the page still work. It uses
 * `location.replace`, so the Back button does not return to a page that would redirect again.
 */
export const ROOT_REDIRECT_SCRIPT = `try{var L=${JSON.stringify(LANGUAGES)},A=${JSON.stringify(
  LANGUAGE_ALIASES,
)},p=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language],t=null,f=false,i,c;for(i=0;i<p.length;i++){if(typeof p[i]!=="string"||!p[i])continue;f=true;c=p[i].toLowerCase().split(/[-_]/)[0];c=A.hasOwnProperty(c)?A[c]:c;if(L.indexOf(c)>=0){t=c;break}}if(t===null)t=f?${JSON.stringify(
  FALLBACK_LANGUAGE,
)}:${JSON.stringify(DEFAULT_LANGUAGE)};location.replace("/"+t+"/"+location.search+location.hash)}catch(e){}`;
