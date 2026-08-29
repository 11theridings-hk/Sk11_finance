export type ClientAttachment = {
  url: string
  size: number
  note?: string
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
