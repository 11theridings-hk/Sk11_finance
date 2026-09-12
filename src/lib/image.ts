export type ClientAttachment = {
  url: string
  size: number
  note?: string
}

/** Open attachment in a new tab. data: URLs cannot be top-level navigated in modern browsers. */
export function openAttachment(fileUrl: string) {
  if (!fileUrl) return

  if (fileUrl.startsWith('data:')) {
    const comma = fileUrl.indexOf(',')
    if (comma < 0) return
    const header = fileUrl.slice(0, comma)
    const data = fileUrl.slice(comma + 1)
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
    const isBase64 = /;base64/i.test(header)
    const bytes = isBase64
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data))
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer')
    if (!opened) {
      const a = document.createElement('a')
      a.href = blobUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    return
  }

  window.open(fileUrl, '_blank', 'noopener,noreferrer')
}

const WEBP_MAX_DIM = 1600
const WEBP_TARGET_MAX_KB = 250
const WEBP_HARD_MAX_KB = 400

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  const dataUrl = canvas.toDataURL('image/webp', quality)
  if (!dataUrl.startsWith('data:image/webp')) {
    const jpeg = canvas.toDataURL('image/jpeg', quality)
    return {
      url: jpeg,
      size: Math.round((jpeg.length * 3) / 4),
    }
  }
  return {
    url: dataUrl,
    size: Math.round((dataUrl.length * 3) / 4),
  }
}

function drawImageToCanvas(img: CanvasImageSource & { width: number; height: number }, maxDim = WEBP_MAX_DIM) {
  let width = Number(img.width)
  let height = Number(img.height)
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas ctx not found')
  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

function encodeCanvasToTargetSize(canvas: HTMLCanvasElement): ClientAttachment {
  let quality = 0.82
  let best = canvasToWebp(canvas, quality)

  while (best.size > WEBP_TARGET_MAX_KB * 1024 && quality > 0.45) {
    quality -= 0.07
    best = canvasToWebp(canvas, quality)
  }
  while (best.size > WEBP_HARD_MAX_KB * 1024 && quality > 0.2) {
    quality -= 0.08
    best = canvasToWebp(canvas, quality)
  }
  return { url: best.url, size: best.size }
}

/** Compress an image File to WebP (~1600px long edge, ~150–250KB). */
export function compressImage(file: File, _maxSizeKB: number = 200): Promise<ClientAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        try {
          const canvas = drawImageToCanvas(img)
          resolve(encodeCanvasToTargetSize(canvas))
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}

async function renderPdfFirstPageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas ctx not found')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

  const bitmap = await createImageBitmap(canvas)
  try {
    return drawImageToCanvas(bitmap as any)
  } finally {
    bitmap.close()
  }
}

/** Prepare image or PDF attachment: always store processed WebP data URL. */
export async function prepareAttachment(file: File): Promise<ClientAttachment> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    const canvas = await renderPdfFirstPageToCanvas(file)
    return encodeCanvasToTargetSize(canvas)
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported attachment type')
  }
  return compressImage(file)
}

export const compressImageOrPdf = prepareAttachment
