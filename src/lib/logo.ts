/**
 * The curiotype logo, optimized (svgo, 3 decimals): a lime rounded square with a dark border and a
 * lowercase glyph. One source for the inline logo in the page (`components/Logo.astro`), the favicon
 * and the app icons (`scripts/generate-assets.mjs`, `scripts/generate-favicon-ico.mjs`).
 * The colors are the design tokens `primary` and `on-primary` (light mode values).
 */
export const LOGO_VIEWBOX = '0 0 24 24';
export const LOGO_FILL = '#a5ed6e';
export const LOGO_INK = '#111';

/** The lime body of the rounded square. */
export const LOGO_BODY_PATH =
  'M5.25.375h13.5a4.864 4.864 0 0 1 4.875 4.875v13.5a4.864 4.864 0 0 1-4.875 4.875H5.25A4.864 4.864 0 0 1 .375 18.75V5.25A4.864 4.864 0 0 1 5.25.375';

/** The dark border of the rounded square (outer edge and inner edge, drawn as a ring). */
export const LOGO_RING_PATH =
  'M5.25 0A5.247 5.247 0 0 0 0 5.25v13.5A5.247 5.247 0 0 0 5.25 24h13.5A5.247 5.247 0 0 0 24 18.75V5.25A5.247 5.247 0 0 0 18.75 0Zm0 .75h13.5c2.499 0 4.5 2.001 4.5 4.5v13.5c0 2.499-2.001 4.5-4.5 4.5H5.25a4.483 4.483 0 0 1-4.5-4.5V5.25c0-2.499 2.001-4.5 4.5-4.5';

/** The glyph inside the square. */
export const LOGO_GLYPH_PATH =
  'M3.756 12.468q0-1.728.528-3t1.56-2.136 2.544-1.296q1.512-.408 3.456-.408 1.992 0 3.552.432t2.64 1.272q1.08.864 1.632 2.112.576 1.272.576 2.904 0 1.368-.408 2.424-.384 1.056-1.128 1.752-.72.72-1.728 1.056-.984.336-2.208.288l-.672-3.504q1.128.072 1.824-.264.696-.312 1.008-.84.336-.504.336-1.056 0-.528-.288-1.008-.264-.48-.888-.864-.6-.384-1.584-.6t-2.4-.216q-1.944 0-3.12.384-1.152.408-1.68 1.08t-.528 1.488q0 .936.576 1.464.576.552 1.464.768.912.216 1.92.192l-.504 3.432q-1.368.048-2.544-.216t-2.064-.96q-.888-.672-1.392-1.824-.48-1.152-.48-2.856';

/** Rounded logo as a standalone SVG file (favicon and the icons with a transparent corner). */
export function logoSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}">` +
    `<path fill="${LOGO_FILL}" d="${LOGO_BODY_PATH}"/>` +
    `<path fill="${LOGO_INK}" d="${LOGO_RING_PATH}${LOGO_GLYPH_PATH}"/>` +
    '</svg>'
  );
}

/**
 * Full-bleed logo: no rounded corners and no border, because the platform masks it (iOS rounds the
 * apple-touch-icon, Android applies its own shape to maskable icons). The glyph is scaled down a
 * little so it stays inside the central 80% safe zone of a maskable icon.
 */
export function fullBleedSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}">` +
    `<rect width="24" height="24" fill="${LOGO_FILL}"/>` +
    `<path fill="${LOGO_INK}" d="${LOGO_GLYPH_PATH}" transform="translate(12 12) scale(.9) translate(-12 -12)"/>` +
    '</svg>'
  );
}
