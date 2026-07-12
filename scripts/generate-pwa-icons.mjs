#!/usr/bin/env node
/**
 * generate-pwa-icons.mjs — writes the home-screen icons the web-app manifest
 * references, with zero image-library dependencies (raw PNG encoding via zlib).
 *
 * Output (all committed to public/icons/):
 *   icon-192.png          manifest icon (Chrome install minimum)
 *   icon-512.png          manifest icon (splash screen source)
 *   apple-touch-icon.png  180×180, iOS home-screen icon
 *
 * Design: solid near-black square with a centered white "H" mark. Full-bleed
 * background (no transparent corners) so the same file is safe for
 * purpose "any maskable" — launchers apply their own corner rounding.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

const BG = [0x11, 0x11, 0x13, 0xff]; // near-black
const FG = [0xff, 0xff, 0xff, 0xff]; // white glyph

// CRC32 (PNG chunk checksums) — small table-driven implementation.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // scanlines: filter byte 0 + row data
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draw the mark at a given size: full-bleed background + "H" built from three
 * bars, kept inside the central 50% so maskable cropping never clips it.
 */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bars = [
    // [x0, x1, y0, y1] as fractions of the canvas
    [0.3, 0.395, 0.27, 0.73], // left stem
    [0.605, 0.7, 0.27, 0.73], // right stem
    [0.3, 0.7, 0.455, 0.545], // crossbar
  ].map(([x0, x1, y0, y1]) => [x0 * size, x1 * size, y0 * size, y1 * size]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const inGlyph = bars.some(([x0, x1, y0, y1]) => cx >= x0 && cx < x1 && cy >= y0 && cy < y1);
      const [r, g, b, a] = inGlyph ? FG : BG;
      const i = (y * size + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return px;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const file = resolve(OUT_DIR, name);
  writeFileSync(file, encodePng(size, drawIcon(size)));
  console.log(`wrote ${file} (${size}×${size})`);
}
