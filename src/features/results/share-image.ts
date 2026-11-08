import { LOGO_BODY_PATH, LOGO_FILL, LOGO_GLYPH_PATH, LOGO_INK, LOGO_RING_PATH } from '@/lib/logo';
import type { Sentence } from '@/lib/types';

/** Size of the result image (the usual Open Graph / link preview size). */
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

/** The fact is wrapped to at most this many lines; a longer text ends with an ellipsis. */
export const SHARE_FACT_MAX_LINES = 3;

/**
 * Fixed light palette (the light-mode design palette). The image leaves the app, so it does not follow
 * the theme of the page: it must look the same wherever it is shared.
 */
export const SHARE_PALETTE = {
  background: '#ddf4ff',
  surface: '#ffffff',
  text: '#3c3c3c',
  textMuted: '#5c5c5c',
  accent: '#0b6fb3',
  border: '#6b7f8c',
} as const;

/** Everything the image shows, already translated by the caller. */
export interface ShareImageData {
  siteName: string;
  wpm: number;
  wpmLabel: string;
  accuracy: number;
  accuracyLabel: string;
  /** Mode with its option, e.g. "Time 30s" (see `getModeLabel`). */
  modeLabel: string;
  /** One short fact (the text of a typed sentence), or null to leave the fact out. */
  fact: string | null;
}

/** Width in pixels of a text in the font that is currently set (canvas `measureText`). */
export type MeasureText = (text: string) => number;

const ELLIPSIS = '…';

/**
 * The fact for the image: the first sentence typed to the last character, otherwise the first
 * sentence that was started (null when none was typed).
 */
export function pickShareFact(
  typed: readonly Sentence[],
  completed: readonly Sentence[],
): string | null {
  const sentence = completed[0] ?? typed[0];
  return sentence ? sentence.text : null;
}

/** Shortens `text` until it and the ellipsis fit `maxWidth`. */
function ellipsize(text: string, maxWidth: number, measure: MeasureText): string {
  let shortened = text.trimEnd();
  while (shortened.length > 0 && measure(shortened + ELLIPSIS) > maxWidth) {
    shortened = shortened.slice(0, -1).trimEnd();
  }
  return shortened + ELLIPSIS;
}

/**
 * Greedy word wrap. Returns at most `maxLines` lines; when the text does not fit, the last line
 * ends with an ellipsis. A single word wider than `maxWidth` is cut with an ellipsis as well.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureText,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || maxLines < 1) return [];

  const lines: string[] = [];
  let current = '';
  let overflowFrom = -1;
  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      if (lines.length === maxLines) {
        overflowFrom = i;
        break;
      }
      current = words[i];
    } else {
      current = candidate;
    }
  }

  if (overflowFrom >= 0) {
    // More text than lines: the last allowed line ends with an ellipsis.
    const rest = words.slice(overflowFrom).join(' ');
    lines[maxLines - 1] = ellipsize(`${lines[maxLines - 1]} ${rest}`, maxWidth, measure);
  } else {
    lines.push(current);
  }

  // A single word wider than the line is cut as well.
  return lines.map((line) => (measure(line) > maxWidth ? ellipsize(line, maxWidth, measure) : line));
}

/** Name of the downloaded file, e.g. `typing-result-42wpm.png`. */
export function getShareFileName(wpm: number): string {
  return `typing-result-${Math.max(0, Math.round(wpm))}wpm.png`;
}

/** Short text sent along with the image by the Web Share API. */
export function getShareText(data: Pick<ShareImageData, 'siteName' | 'wpm' | 'wpmLabel' | 'accuracy' | 'accuracyLabel'>): string {
  return `${data.siteName}: ${Math.round(data.wpm)} ${data.wpmLabel}, ${data.accuracyLabel} ${data.accuracy}%`;
}

// Fonts: the family names registered by Astro's Fonts API (astro.config.mjs).
const HEADING_FONT = '"Bricolage Grotesque", sans-serif';
const UI_FONT = 'Inter, sans-serif';

/** Loads the faces the image uses; the page normally has them already, so this resolves at once. */
async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 128px ${HEADING_FONT}`),
      document.fonts.load(`700 36px ${HEADING_FONT}`),
      document.fonts.load(`600 30px ${UI_FONT}`),
      document.fonts.load(`500 30px ${UI_FONT}`),
    ]);
  } catch {
    // A missing face falls back to the generic family; the image is still drawn.
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image'))), 'image/png');
  });
}

/** Draws the result card on a 1200x630 canvas and returns it as a PNG. Runs in the browser only. */
export async function renderShareImage(data: ShareImageData): Promise<Blob> {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const p = SHARE_PALETTE;
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  // Card
  const cardX = 40;
  const cardY = 40;
  const cardW = SHARE_IMAGE_WIDTH - 2 * cardX;
  const cardH = SHARE_IMAGE_HEIGHT - 2 * cardY;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.border;
  ctx.stroke();

  const left = 88;
  const right = SHARE_IMAGE_WIDTH - 88;
  ctx.textBaseline = 'alphabetic';

  // Logo: the one source in `lib/logo.ts` (same shapes and colors as the favicon and the page logo)
  const logo = 64;
  const logoY = 84;
  ctx.save();
  ctx.translate(left, logoY);
  ctx.scale(logo / 24, logo / 24);
  ctx.fillStyle = LOGO_FILL;
  ctx.fill(new Path2D(LOGO_BODY_PATH));
  ctx.fillStyle = LOGO_INK;
  ctx.fill(new Path2D(LOGO_RING_PATH + LOGO_GLYPH_PATH));
  ctx.restore();

  // Site name and mode
  ctx.textAlign = 'left';
  ctx.fillStyle = p.text;
  ctx.font = `700 36px ${HEADING_FONT}`;
  ctx.fillText(data.siteName, left + logo + 20, logoY + 45);

  ctx.textAlign = 'right';
  ctx.fillStyle = p.textMuted;
  ctx.font = `600 28px ${UI_FONT}`;
  ctx.fillText(data.modeLabel, right, logoY + 44);

  // Figures
  const columns = [
    { x: left, value: `${Math.round(data.wpm)}`, label: data.wpmLabel },
    { x: 560, value: `${data.accuracy}%`, label: data.accuracyLabel },
  ];
  ctx.textAlign = 'left';
  for (const column of columns) {
    ctx.fillStyle = p.accent;
    ctx.font = `700 128px ${HEADING_FONT}`;
    ctx.fillText(column.value, column.x, 310);
    ctx.fillStyle = p.textMuted;
    ctx.font = `600 30px ${UI_FONT}`;
    ctx.fillText(column.label, column.x, 356);
  }

  // Fact
  if (data.fact) {
    ctx.fillStyle = p.border;
    ctx.fillRect(left, 392, right - left, 2);

    ctx.fillStyle = p.text;
    ctx.font = `500 30px ${UI_FONT}`;
    const lines = wrapText(
      data.fact,
      right - left,
      (text) => ctx.measureText(text).width,
      SHARE_FACT_MAX_LINES,
    );
    lines.forEach((line, index) => ctx.fillText(line, left, 446 + index * 44));
  }

  return canvasToBlob(canvas);
}
