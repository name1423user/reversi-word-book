// Generates the PWA icons with no external dependencies (raw PNG encoder via
// zlib deflate). The mark: two stacked cards — a tilted back card and a front
// card bearing a "反" glyph block — on an indigo gradient, echoing the
// flip-both-sides idea the app is built around.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
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

function makePng(size, sample) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = sample(x, y, size)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255]

/** Signed distance to a rounded rectangle, in the rect's own space. */
function roundedRectSdf(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius)
  const dy = Math.abs(py - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

/** Rotate a point around a centre by -angle (i.e. into the shape's space). */
function unrotate(px, py, cx, cy, angle) {
  const s = Math.sin(-angle)
  const c = Math.cos(-angle)
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * c - dy * s, cy + dx * s + dy * c]
}

// Palette (matches the app's indigo accent)
const BG_TOP = [99, 91, 255]
const BG_BOTTOM = [67, 56, 202]
const BACK_CARD = [165, 180, 252]
const FRONT_CARD = [255, 255, 255]
const GLYPH = [79, 70, 229]
const SHADOW = [49, 46, 129]

function sample(x, y, size) {
  const u = (x + 0.5) / size
  const v = (y + 0.5) / size
  // Anti-aliasing width in normalized units.
  const aa = 1.2 / size

  let color = mix(BG_TOP, BG_BOTTOM, (u + v) / 2)

  const blend = (base, layer, sdf, softness = aa) => {
    const coverage = 1 - Math.min(1, Math.max(0, sdf / softness + 0.5))
    if (coverage <= 0) return base
    return [
      lerp(base[0], layer[0], coverage),
      lerp(base[1], layer[1], coverage),
      lerp(base[2], layer[2], coverage),
      255,
    ]
  }

  // Back card: tilted, peeking out behind the front one.
  const backAngle = -0.20
  const [bx, by] = unrotate(u, v, 0.46, 0.5, backAngle)
  const backSdf = roundedRectSdf(bx, by, 0.46, 0.5, 0.235, 0.30, 0.055)
  color = blend(color, SHADOW, backSdf - 0.012, aa * 3) // soft drop shadow
  color = blend(color, BACK_CARD, backSdf)

  // Front card: upright, slightly offset the other way.
  const frontAngle = 0.06
  const [fx, fy] = unrotate(u, v, 0.55, 0.52, frontAngle)
  const frontSdf = roundedRectSdf(fx, fy, 0.55, 0.52, 0.235, 0.30, 0.055)
  color = blend(color, SHADOW, frontSdf - 0.010, aa * 3)
  color = blend(color, FRONT_CARD, frontSdf)

  // Glyph on the front card: three stacked bars reading as text lines, with
  // the middle one shorter — legible even at 32px.
  if (frontSdf < 0) {
    const bars = [
      { cy: 0.42, halfW: 0.135 },
      { cy: 0.52, halfW: 0.095 },
      { cy: 0.62, halfW: 0.135 },
    ]
    for (const bar of bars) {
      const sdf = roundedRectSdf(fx, fy, 0.55, bar.cy, bar.halfW, 0.026, 0.026)
      color = blend(color, GLYPH, sdf)
    }
  }

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), 255]
}

mkdirSync(new URL('../public/icons', import.meta.url), { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(
    new URL(`../public/icons/icon-${size}.png`, import.meta.url),
    makePng(size, sample),
  )
  console.log(`wrote icon-${size}.png`)
}
