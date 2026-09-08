// Image intake helpers: pull an image out of a drop/paste event, and encode
// a cropped region to a compressed WebP blob (never base64 — see imageStore.ts
// for why blobs are stored out-of-line from card rows).

const MAX_DIMENSION = 1600
const WEBP_QUALITY = 0.82

export function fileFromDrop(e: React.DragEvent): File | null {
  const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
    f.type.startsWith('image/'),
  )
  return file ?? null
}

export function fileFromPaste(e: ClipboardEvent | React.ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('webp encode failed'))),
      'image/webp',
      quality,
    )
  })
}

/** Downscale (if needed) and encode a full image to WebP without cropping. */
export async function toWebpBlob(src: string, quality = WEBP_QUALITY): Promise<Blob> {
  const img = await loadImage(src)
  let { width, height } = img
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  width = Math.round(width * scale)
  height = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return canvasToWebpBlob(canvas, quality)
}

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

/** Crop `src` to the pixel-space `area`, downscale if huge, encode to WebP. */
export async function cropToWebpBlob(
  src: string,
  area: CropArea,
  quality = WEBP_QUALITY,
): Promise<Blob> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, MAX_DIMENSION / Math.max(area.width, area.height))
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvasToWebpBlob(canvas, quality)
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}
