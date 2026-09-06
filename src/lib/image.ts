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

export function compressImage(file: File, maxSizeKB: number = 200): Promise<ClientAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas ctx not found'))

        let { width, height } = img
        const maxDim = 1200
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        let quality = 0.9
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        let size = Math.round((dataUrl.length * 3) / 4)

        while (size > maxSizeKB * 1024 && quality > 0.1) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          size = Math.round((dataUrl.length * 3) / 4)
        }

        resolve({ url: dataUrl, size })
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}
