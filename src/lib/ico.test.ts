import { describe, expect, it } from 'vitest';
import { buildIco } from './ico';

const png = (length: number, fill: number) => new Uint8Array(length).fill(fill);

describe('buildIco', () => {
  it('writes the header, one entry per image and the image data at the right offsets', () => {
    const ico = buildIco([
      { size: 16, png: png(10, 1) },
      { size: 48, png: png(20, 2) },
    ]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);

    const dataStart = 6 + 16 * 2;
    expect([ico[6], ico[7]]).toEqual([16, 16]);
    expect(view.getUint32(6 + 8, true)).toBe(10);
    expect(view.getUint32(6 + 12, true)).toBe(dataStart);
    expect([ico[22], ico[23]]).toEqual([48, 48]);
    expect(view.getUint32(22 + 8, true)).toBe(20);
    expect(view.getUint32(22 + 12, true)).toBe(dataStart + 10);

    expect(ico.length).toBe(dataStart + 30);
    expect(ico[dataStart]).toBe(1);
    expect(ico[dataStart + 10]).toBe(2);
  });

  it('writes a size of 256 as 0', () => {
    const ico = buildIco([{ size: 256, png: png(4, 9) }]);
    expect([ico[6], ico[7]]).toEqual([0, 0]);
  });

  it('rejects an empty list and invalid sizes', () => {
    expect(() => buildIco([])).toThrow();
    expect(() => buildIco([{ size: 0, png: png(1, 0) }])).toThrow();
    expect(() => buildIco([{ size: 300, png: png(1, 0) }])).toThrow();
    expect(() => buildIco([{ size: 16.5, png: png(1, 0) }])).toThrow();
  });
});
