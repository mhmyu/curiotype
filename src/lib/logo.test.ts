import { describe, expect, it } from 'vitest';
import {
  LOGO_BODY_PATH,
  LOGO_FILL,
  LOGO_GLYPH_PATH,
  LOGO_INK,
  LOGO_RING_PATH,
  fullBleedSvg,
  logoSvg,
} from './logo';

describe('logo', () => {
  it('uses the design colors primary and on-primary', () => {
    expect(LOGO_FILL).toBe('#a5ed6e');
    expect(LOGO_INK).toBe('#111');
  });

  it('has no ids, scripts or external references (it is placed inline more than once)', () => {
    for (const svg of [logoSvg(), fullBleedSvg()]) {
      expect(svg).not.toMatch(/\bid=|<script|href=|<title|style=/);
    }
  });

  it('is small', () => {
    expect(logoSvg().length).toBeLessThan(1500);
    expect(fullBleedSvg().length).toBeLessThan(1200);
  });

  it('the rounded logo draws body, ring and glyph; the full-bleed one only a background and the glyph', () => {
    const rounded = logoSvg();
    expect(rounded).toContain(LOGO_BODY_PATH);
    expect(rounded).toContain(LOGO_RING_PATH);
    expect(rounded).toContain(LOGO_GLYPH_PATH);
    const bleed = fullBleedSvg();
    expect(bleed).toContain('<rect width="24" height="24"');
    expect(bleed).toContain(LOGO_GLYPH_PATH);
    expect(bleed).not.toContain(LOGO_RING_PATH);
  });
});
