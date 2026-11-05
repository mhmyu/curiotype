import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

type Tokens = Record<string, string>;

function parseBlock(source: string, pattern: RegExp): Tokens {
  const match = pattern.exec(source);
  if (!match) throw new Error(`Block not found: ${pattern}`);
  const tokens: Tokens = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

const light = parseBlock(css, /^:root \{([\s\S]*?)\n\}/m);
const systemDark = parseBlock(css, /:root:not\(\[data-theme='light'\]\) \{([\s\S]*?)\n {2}\}/);
const explicitDark = parseBlock(css, /:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TOKEN_NAMES = [
  'primary',
  'on-primary',
  'background',
  'surface',
  'text',
  'text-muted',
  'accent',
  'error',
  'border',
  'typing-pending',
  'typing-correct',
];

describe('token blocks', () => {
  it('defines every token in light and in both dark blocks', () => {
    for (const tokens of [light, systemDark, explicitDark]) {
      expect(Object.keys(tokens).sort()).toEqual([...TOKEN_NAMES].sort());
    }
  });

  it('keeps the system-dark and explicit-dark blocks identical', () => {
    expect(systemDark).toEqual(explicitDark);
  });

  it('uses the design values for the base palette', () => {
    expect(light).toMatchObject({
      primary: '#a5ed6e',
      background: '#ddf4ff',
      surface: '#ffffff',
      text: '#3c3c3c',
      accent: '#0b6fb3',
    });
    expect(explicitDark).toMatchObject({ background: '#0f1c26', surface: '#192a37' });
  });
});

describe.each([
  ['light', light],
  ['dark', explicitDark],
])('contrast (%s)', (_mode, t) => {
  it('text tokens pass WCAG AA (4.5:1) on background and surface', () => {
    for (const bg of [t.background, t.surface]) {
      for (const name of ['text', 'text-muted', 'accent', 'error']) {
        expect(contrast(t[name], bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('on-primary text passes AA on primary', () => {
    expect(contrast(t['on-primary'], t.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('borders pass the 3:1 rule for UI components', () => {
    for (const bg of [t.background, t.surface]) {
      expect(contrast(t.border, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('typing tokens pass AA on surface', () => {
    expect(contrast(t['typing-pending'], t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['typing-correct'], t.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('typing character states', () => {
  it('keeps typed and untyped text apart (light 3.9:1, dark 2.9:1 at least)', () => {
    expect(contrast(light['typing-correct'], light['typing-pending'])).toBeGreaterThanOrEqual(3.9);
    expect(contrast(explicitDark['typing-correct'], explicitDark['typing-pending'])).toBeGreaterThanOrEqual(2.9);
  });

  it('primary stands out on dark surfaces (3:1)', () => {
    expect(contrast(explicitDark.primary, explicitDark.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(explicitDark.primary, explicitDark.surface)).toBeGreaterThanOrEqual(3);
  });

  it('documents the known light-mode exception: primary alone fails 3:1 on background', () => {
    // This is why primary-filled controls need a 2px on-primary border in light mode.
    expect(contrast(light.primary, light.background)).toBeLessThan(3);
  });
});

describe('card shadow', () => {
  it('is defined in the light block and both dark blocks', () => {
    expect(css.match(/--card-shadow:/g)).toHaveLength(3);
  });

  it('is a soft shadow in light mode and a 1px border in both dark blocks', () => {
    expect(css).toContain('--card-shadow: 0 0 5px');
    expect(css.match(/--card-shadow: 0 0 0 1px var\(--border\);/g)).toHaveLength(2);
  });
});
