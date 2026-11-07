/** One image of an ICO file: a square PNG of `size` pixels. */
export interface IcoImage {
  size: number;
  png: Uint8Array;
}

/**
 * Packs square PNG images into one `.ico` file (PNG-compressed entries, supported by every
 * current browser and by Windows since Vista). Sizes must be 1 to 256 pixels.
 */
export function buildIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error('An ICO file needs at least one image.');
  const headerSize = 6 + 16 * images.length;
  const total = images.reduce((sum, image) => sum + image.png.length, headerSize);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type 1 = icon
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((image, index) => {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > 256) {
      throw new Error(`Invalid icon size: ${image.size}`);
    }
    const entry = 6 + 16 * index;
    // A size of 256 is written as 0.
    out[entry] = image.size === 256 ? 0 : image.size;
    out[entry + 1] = image.size === 256 ? 0 : image.size;
    out[entry + 2] = 0; // no palette
    out[entry + 3] = 0; // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(image.png, offset);
    offset += image.png.length;
  });
  return out;
}
