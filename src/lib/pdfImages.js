// Render pages to images in the browser for OCR/vision extraction. Used when a
// PDF has no text layer (scanned e-tickets, screenshots-to-PDF) or the upload is
// itself an image. pdfjs rasterises each page to a canvas; we downscale + JPEG-
// encode to keep the payload (and Claude's vision token cost) reasonable. Only
// images (never the raw file) leave the browser.
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Render up to maxPages of a PDF to JPEG data URLs.
export async function pdfToImages(file, { maxPages = 8, maxDim = 1600, quality = 0.8 } = {}) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const out = []
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxDim / Math.max(base.width, base.height), 3)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    out.push(canvas.toDataURL('image/jpeg', quality))
  }
  return out
}

// Downscale a raw image file (jpg/png/…) to a single JPEG data URL.
export async function imageFileToDataUrl(file, { maxDim = 1600, quality = 0.85 } = {}) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(maxDim / Math.max(img.width, img.height), 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
