import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LORA_SUBSETS, loraSubsetFile } from './font-subsets';

const PACKAGE_DIR = resolve(process.cwd(), 'node_modules/@fontsource-variable/lora');

/** Reads `/* lora-<name>-wght-normal *\/ @font-face { ... unicode-range: ...; }` blocks of the package CSS. */
function readPackageRanges(): Map<string, string[]> {
  const css = readFileSync(resolve(PACKAGE_DIR, 'wght.css'), 'utf8');
  const ranges = new Map<string, string[]>();
  for (const match of css.matchAll(/\/\* lora-([a-z-]+)-wght-normal \*\/([\s\S]*?)\}/g)) {
    const range = /unicode-range:\s*([^;]+);/.exec(match[2]);
    if (range) ranges.set(match[1], range[1].split(',').map((part) => part.trim()));
  }
  return ranges;
}

describe('Lora subsets', () => {
  const packageRanges = readPackageRanges();

  it('start with latin, the only subset that is preloaded', () => {
    expect(LORA_SUBSETS[0].name).toBe('latin');
  });

  it('cover latin, latin-ext, vietnamese and both cyrillic subsets, once each', () => {
    const names = LORA_SUBSETS.map((subset) => subset.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese']);
  });

  it.each(LORA_SUBSETS.map((subset) => [subset.name, subset] as const))(
    '%s: the font file exists in the package',
    (name) => {
      const file = loraSubsetFile(name).replace('@fontsource-variable/lora/', '');
      expect(existsSync(resolve(PACKAGE_DIR, file))).toBe(true);
    },
  );

  it.each(LORA_SUBSETS.map((subset) => [subset.name, subset] as const))(
    '%s: the unicode-range equals the one in the installed package (update the list after an upgrade)',
    (name, subset) => {
      expect(subset.unicodeRange).toEqual(packageRanges.get(name));
    },
  );

  it('every range value looks like U+XXXX or U+XXXX-YYYY', () => {
    for (const subset of LORA_SUBSETS) {
      for (const value of subset.unicodeRange) expect(value).toMatch(/^U\+[0-9A-F]{1,6}(-[0-9A-F]{1,6})?$/);
    }
  });

  it('ASCII, the Vietnamese letters and basic Cyrillic each fall in some subset', () => {
    const covers = (codePoint: number) =>
      LORA_SUBSETS.some((subset) =>
        subset.unicodeRange.some((value) => {
          const [from, to = from] = value.slice(2).split('-').map((hex) => parseInt(hex, 16));
          return codePoint >= from && codePoint <= to;
        }),
      );
    for (const ch of ['a', 'Z', '~', '\u00E9', '\u01A1', '\u1EA1', '\u0416', '\u0471']) {
      expect(covers(ch.codePointAt(0)!)).toBe(true);
    }
    expect(covers(0x4e2d)).toBe(false); // CJK: needs a Noto Serif fallback
  });
});
