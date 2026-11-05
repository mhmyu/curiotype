import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { writeServiceWorker } from './pwa-build.ts';

/** Where the worker template lives, relative to the project root. */
const TEMPLATE_PATH = 'src/pwa/sw-template.js';

/**
 * Astro integration that writes `dist/sw.js` once the build is done (T30). It is not a dependency:
 * a `@vite-pwa/astro` plugin was not needed for a site this small, and its Astro 7 support could
 * not be checked (see changelog). Does nothing in `astro dev`: the page registers the worker only
 * in a production build (`features/pwa/register.ts`).
 *
 * @param defaultLanguage Interface language of the page shown when a page is neither stored nor
 *   reachable (`/<lang>/`).
 */
export function pwa(options: { defaultLanguage: string }): AstroIntegration {
  let root = new URL('file:///');
  return {
    name: 'typing-pwa',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = config.root;
      },
      'astro:build:done': ({ dir, logger }) => {
        const template = readFileSync(new URL(TEMPLATE_PATH, root), 'utf8');
        const result = writeServiceWorker({
          outDir: fileURLToPath(dir),
          template,
          fallbackUrl: `/${options.defaultLanguage}/`,
        });
        logger.info(
          `sw.js written: ${result.plan.precache.length} files and ${result.plan.data.length} data files, revision ${result.revision}`,
        );
      },
    },
  };
}
