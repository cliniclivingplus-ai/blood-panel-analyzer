import { createWorker } from 'tesseract.js'

// Same call clp-compass's src/lib/reports/extractText.ts already makes for
// photo/screenshot report uploads — one worker per image, torn down after.
export async function ocrImage(buffer: ArrayBuffer): Promise<string> {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(Buffer.from(buffer))
    return data.text.replace(/\s+/g, ' ').trim()
  } finally {
    await worker.terminate()
  }
}

export async function ocrPages(buffers: ArrayBuffer[]): Promise<string> {
  const texts = await Promise.all(buffers.map((b) => ocrImage(b)))
  return texts.join('\n\n')
}
