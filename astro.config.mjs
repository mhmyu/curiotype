import { defineConfig, fontProviders } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { parseAnalyticsToken, parseSiteUrl } from './src/config/parse.ts';
import { analyticsCspSources } from './src/lib/analytics-config.ts';
import { LORA_SUBSETS, loraSubsetFile } from './src/config/font-subsets.ts';
import { DEFAULT_LANGUAGE, LOCALE_TAGS } from './src/i18n/config.ts';
import { pwa } from './src/lib/pwa-integration.ts';

// SITE_URL is the public origin of the deployed site (see .env.example). Real environment
// variables (set in the host's dashboard) win over the local files; Node never overrides a
// variable that is already set, so the first file loaded for a name wins.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // The file does not exist: nothing to load.
  }
}
const rawSiteUrl = process.env.SITE_URL;
const site = parseSiteUrl(rawSiteUrl);
if (rawSiteUrl?.trim() && !site) {
  console.warn(`SITE_URL "${rawSiteUrl}" is not a valid http(s) URL and is ignored.`);
}

// Analytics (T17): the token turns on Cloudflare Web Analytics. The two Cloudflare hosts are only
// added to the Content Security Policy when a token is set; without one, 'self' is the only source.
const analyticsToken = parseAnalyticsToken(process.env.PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN);
if (process.env.PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN?.trim() && !analyticsToken) {
  console.warn('PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN is not a valid token and is ignored.');
}
const analyticsCsp = analyticsCspSources(analyticsToken);

// Fonts are self-hosted: the variable font files come from the @fontsource-variable packages,
// so builds need no network and pages make no third-party requests. Astro serves them from
// /_astro/fonts and generates metric-adjusted fallbacks. Roles: heading = Bricolage Grotesque,
// ui = Inter, typing = Lora (typing area only). Heading and UI text are written by us in the
// interface languages, so they only need the latin subset. Lora also ships the latin-ext,
// vietnamese and cyrillic subsets (src/config/font-subsets.ts), each with a `unicode-range`
// so the browser downloads one only when a sentence uses its characters.
const FONTSOURCE = '@fontsource-variable';

// `site` comes from SITE_URL. Without it, absolute URLs (canonical, hreflang, Open Graph) are
// left out and the sitemap is not generated (the integration needs `site`).
export default defineConfig({
  site,
  integrations: [
    svelte(),
    ...(site
      ? [sitemap({ i18n: { defaultLocale: DEFAULT_LANGUAGE, locales: { ...LOCALE_TAGS } } })]
      : []),
    // Last, so `dist/sw.js` is written after every other integration has finished its files (T30).
    pwa({ defaultLanguage: DEFAULT_LANGUAGE }),
  ],
  vite: { plugins: [tailwindcss()] },
  // The site has no Markdown content, but Astro enables Shiki by default and warns that its inline
  // styles clash with the Content Security Policy below. Turning highlighting off removes the
  // warning and keeps the policy free of style exceptions.
  markdown: { syntaxHighlight: false },
  // Content Security Policy. Astro adds a <meta http-equiv="content-security-policy"> to every
  // page with `script-src 'self'` plus the hashes of every script and style it bundles or inlines
  // (island hydration, component styles); the hash of our own inline theme script is added in
  // BaseLayout.astro. The directives below cover everything else. Nothing is loaded from another
  // origin, so every source is 'self', except the two Cloudflare Web Analytics hosts that are added
  // only when a token is configured (src/lib/analytics-config.ts). A meta tag cannot carry
  // `frame-ancestors`; the header file public/_headers sets it. When a feature needs another
  // origin, add it here.
  security: {
    csp: {
      scriptDirective: { resources: analyticsCsp.script },
      directives: [
        "default-src 'self'",
        "img-src 'self'",
        "font-src 'self'",
        `connect-src ${analyticsCsp.connect.join(' ')}`,
        "manifest-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  fonts: [
    {
      name: 'Bricolage Grotesque',
      cssVariable: '--astro-font-heading',
      provider: fontProviders.local(),
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            src: [`${FONTSOURCE}/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2`],
            weight: '200 800',
            style: 'normal',
          },
        ],
      },
    },
    {
      name: 'Inter',
      cssVariable: '--astro-font-ui',
      provider: fontProviders.local(),
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            src: [`${FONTSOURCE}/inter/files/inter-latin-wght-normal.woff2`],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
    },
    {
      name: 'Lora',
      cssVariable: '--astro-font-typing',
      provider: fontProviders.local(),
      fallbacks: ['serif'],
      options: {
        variants: [
          ...LORA_SUBSETS.map((subset) => ({
            src: [loraSubsetFile(subset.name)],
            weight: '400 700',
            style: 'normal',
            unicodeRange: subset.unicodeRange,
          })),
        ],
      },
    },
  ],
  // The root URL redirects to the default language (static meta-refresh page).
  redirects: { '/': `/${DEFAULT_LANGUAGE}/` },
});
