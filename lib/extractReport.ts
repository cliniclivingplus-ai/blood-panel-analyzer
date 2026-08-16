// Client-side (browser) extraction — runs entirely in the DOM, so it needs
// no server-side rasterizer (poppler/node-canvas), unlike a scanned PDF
// rendered on the server would. Two paths:
//  1. Real text layer present (most native-generated lab PDFs) -> read it
//     directly with pdfjs-dist, same call MicrobiomeRX's own extractSpecies.ts
//     already makes.
//  2. No usable text layer (a scan) -> render each page to a real browser
//     <canvas> with pdfjs-dist's own page.render(), export each as a PNG
//     blob, and let the server OCR those with tesseract.js (same engine
//     clp-compass already uses for photo/screenshot report uploads).
// A single image upload (photo/screenshot) always takes the OCR path.

const MIN_TEXT_LAYER_CHARS = 200

export type ExtractResult =
  | { mode: 'text'; text: string }
  | { mode: 'ocr'; pageImages: Blob[] }

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
  return pdfjsLib
}

async function renderPageToPngBlob(page: import('pdfjs-dist').PDFPageProxy): Promise<Blob> {
  // Scale up from the PDF's native ~72dpi so small table text OCRs cleanly.
  const viewport = page.getViewport({ scale: 2.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported in this browser')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to export page image'))), 'image/png')
  })
}

export async function extractFromPdf(file: File): Promise<ExtractResult> {
  const pdfjsLib = await loadPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
  }

  if (fullText.trim().length >= MIN_TEXT_LAYER_CHARS) {
    return { mode: 'text', text: fullText }
  }

  // Scanned PDF — render every page to a PNG for server-side OCR.
  const pageImages: Blob[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    pageImages.push(await renderPageToPngBlob(page))
  }
  return { mode: 'ocr', pageImages }
}

export async function extractFromFile(file: File): Promise<ExtractResult> {
  if (file.type === 'application/pdf') return extractFromPdf(file)
  if (file.type.startsWith('image/')) return { mode: 'ocr', pageImages: [file] }
  throw new Error(`Unsupported file type: ${file.type}`)
}
