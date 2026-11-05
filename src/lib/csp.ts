import { createHash } from 'node:crypto';

/**
 * Content Security Policy helpers. They run at build time only (Node), never in the browser.
 *
 * An inline script is allowed by a CSP `script-src` entry of the form `'sha256-<base64>'`, where
 * the hash is taken over the exact text between `<script>` and `</script>`. Astro computes the
 * hashes of the scripts and styles it bundles itself; a script we write inline (the theme script)
 * needs its hash added by hand. Computing it from the same constant that is rendered keeps the
 * two from drifting apart.
 */

/** Hash of an inline script's text in the CSP source form Astro's `insertScriptHash` accepts. */
export function hashInlineScript(source: string): `sha256-${string}` {
  return `sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}`;
}
