// Image intake helpers: pull an image out of a drop/paste event, and encode
// a cropped region to a compressed WebP data URL.

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

export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** Downscale (if needed) and encode a full image to WebP without cropping. */
export async function toWebp(src: string, quality = WEBP_QUALITY): Promise<string> {
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
  return canvas.toDataURL('image/webp', quality)
}

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

/** Crop `src` to the pixel-space `area`, downscale if huge, encode to WebP. */
export async function cropToWebp(
  src: string,
  area: CropArea,
  quality = WEBP_QUALITY,
): Promise<string> {
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
  return canvas.toDataURL('image/webp', quality)
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}
