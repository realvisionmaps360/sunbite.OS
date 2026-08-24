/**
 * Gera os icones do PWA sem depender de biblioteca de imagem.
 * Desenho: fundo vermelho da marca, sol creme, mordida vermelha no canto —
 * o "sun bite". Trocar pelo logo oficial e so substituir os PNGs em public/.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BRAND = [0x84, 0x14, 0x12];
const CREAM = [0xf5, 0xe6, 0xc8];

function crc32(buf) {
  let c,
    table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** @param scale fracao do lado ocupada pelo sol — menor = mais margem (maskable) */
function draw(scale) {
  return (x, y, size) => {
    const c = size / 2;
    const rSun = size * scale;
    const dSun = Math.hypot(x - c, y - c);
    // mordida: circulo vermelho deslocado para o canto superior direito
    const bx = c + rSun * 0.72;
    const by = c - rSun * 0.72;
    const dBite = Math.hypot(x - bx, y - by);
    const inSun = dSun <= rSun && dBite > rSun * 0.62;
    return inSun ? CREAM : BRAND;
  };
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", png(192, draw(0.36)));
writeFileSync("public/icon-512.png", png(512, draw(0.36)));
writeFileSync("public/icon-maskable.png", png(512, draw(0.28)));
console.log("icones gerados em public/");
