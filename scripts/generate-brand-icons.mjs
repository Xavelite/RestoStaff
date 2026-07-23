#!/usr/bin/env node
// Regenerates every brand icon the app ships from the two source logos in
// brand/ (kept out of static/, which is published verbatim, because the
// 1024px originals are ~300 KB each and nothing should download them).
// No image dependency is needed: an 8-bit RGBA PNG is just zlib
// plus a few chunks, and a box filter is all a clean downscale of flat artwork
// requires. Run it whenever the logo changes:
//
//   npm run generate:brand-icons

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG.');
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('Expected an 8-bit RGBA PNG.');
      if (data[12] !== 0) throw new Error('Interlaced PNG is not supported.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= 4 ? prior[x - 4] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

// Averaging happens on premultiplied colour so fully transparent source pixels
// cannot drag black into the soft edges of the mark.
function resize({ width, height, pixels }, size) {
  const out = Buffer.alloc(size * size * 4);
  const scaleX = width / size;
  const scaleY = height / size;

  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * width + sx) * 4;
          const alpha = pixels[i + 3] / 255;
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += pixels[i + 3];
          count += 1;
        }
      }
      const alpha = a / count;
      const restore = alpha > 0 ? 255 / alpha : 0;
      const i = (y * size + x) * 4;
      out[i] = Math.min(255, Math.round((r / count) * restore));
      out[i + 1] = Math.min(255, Math.round((g / count) * restore));
      out[i + 2] = Math.min(255, Math.round((b / count) * restore));
      out[i + 3] = Math.round(alpha);
    }
  }

  return { width: size, height: size, pixels: out };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encode({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1);
    raw[base] = 4; // Paeth suits flat artwork with soft anti-aliased edges.
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? row[x - 4] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= 4 ? prior[x - 4] : 0;
      raw[base + 1 + x] = (row[x] - paeth(a, b, c)) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const mark = decode(readFileSync(join(root, 'brand/restogogo-mark-source.png')));
const tile = decode(readFileSync(join(root, 'brand/restogogo-tile-source.png')));

// The transparent mark carries the in-app brand; the dark tile is what a phone
// home screen and browser tab need, where a bare glyph would vanish.
const targets = [
  [mark, 192, 'static/brand/restogogo-mark.png'],
  [mark, 96, 'static/icons/badge-96.png'],
  [tile, 192, 'static/icons/icon-192.png'],
  [tile, 512, 'static/icons/icon-512.png'],
  [tile, 180, 'static/icons/apple-touch-icon.png'],
  [tile, 64, 'static/brand/favicon.png']
];

for (const [image, size, target] of targets) {
  const file = encode(resize(image, size));
  writeFileSync(join(root, target), file);
  console.log(`${target.padEnd(40)} ${String(size).padStart(3)}px  ${(file.length / 1024).toFixed(1)} KB`);
}
