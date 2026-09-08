// Generates simple solid-color PWA icon PNGs with a centered rounded square,
// with no external dependencies (raw PNG encoder via zlib deflate).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makePng(size, draw) {
  const width = size
  const height = size
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    let rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filter type none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = draw(x, y, width, height)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Background: indigo-ish gradient-free solid (#4f46e5), a lighter rounded
// "card" square, and a simple diagonal split (reversi flip motif) in two tones.
function draw(x, y, w, h) {
  const bg = [79, 70, 229, 255] // indigo-600
  const cardLight = [238, 242, 255, 255] // indigo-50
  const cardDark = [199, 210, 254, 255] // indigo-200
  const pad = w * 0.16
  const r = w * 0.14
  const inCard = x > pad && x < w - pad && y > pad && y < h - pad
  if (!inCard) return bg
  // simple rounded-corner mask using distance to nearest corner center
  const corners = [
    [pad + r, pad + r],
    [w - pad - r, pad + r],
    [pad + r, h - pad - r],
    [w - pad - r, h - pad - r],
  ]
  for (const [cx, cy] of corners) {
    const nearX = x < cx ? -1 : x > cx ? 1 : 0
    const nearY = y < cy ? -1 : y > cy ? 1 : 0
    if (nearX !== 0 && nearY !== 0) {
      const inCornerBox =
        (nearX < 0 ? x < cx : x > cx) && (nearY < 0 ? y < cy : y > cy)
      if (inCornerBox) {
        const d = Math.hypot(x - cx, y - cy)
        if (d > r) return bg
      }
    }
  }
  // diagonal split for a subtle "flip" motif
  return x - pad + (y - pad) < w - pad * 2 ? cardLight : cardDark
}

mkdirSync(new URL('../public/icons', import.meta.url), { recursive: true })
for (const size of [192, 512]) {
  const png = makePng(size, draw)
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), png)
  console.log(`wrote icon-${size}.png`)
}
