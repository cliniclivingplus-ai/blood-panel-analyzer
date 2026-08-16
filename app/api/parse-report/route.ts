import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { createSupabaseAdmin } from '@/lib/supabaseServer'
import { ocrPages } from '@/lib/ocr'
import { extractMarkers } from '@/lib/extractMarkers'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const patientName = form.get('patient_name')
    const mode = form.get('mode')
    const file = form.get('file')

    if (typeof patientName !== 'string' || !patientName.trim()) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }
    if (mode !== 'text' && mode !== 'ocr') {
      return NextResponse.json({ error: 'Invalid extraction mode' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    let rawText = ''
    if (mode === 'text') {
      const text = form.get('text')
      if (typeof text !== 'string' || !text.trim()) {
        return NextResponse.json({ error: 'No text extracted from this PDF' }, { status: 400 })
      }
      rawText = text
    } else {
      const pageImages = form.getAll('page_images').filter((f): f is File => f instanceof File)
      if (pageImages.length === 0) {
        return NextResponse.json({ error: 'No page images to OCR' }, { status: 400 })
      }
      const buffers = await Promise.all(pageImages.map((f) => f.arrayBuffer()))
      rawText = await ocrPages(buffers)
      if (rawText.trim().length < 20) {
        return NextResponse.json({ error: 'Could not read this scan — try a clearer photo or a higher-resolution PDF.' }, { status: 422 })
      }
    }

    const admin = createSupabaseAdmin()

    // Find-or-create patient by name — same simplicity as MicrobiomeRX's
    // own patients table, which also has no email/phone/clinic id to
    // dedupe on more precisely.
    const { data: existing } = await admin
      .from('patients')
      .select('id')
      .ilike('name', patientName.trim())
      .maybeSingle()
    let patientId = existing?.id as string | undefined
    if (!patientId) {
      const { data: created, error: createError } = await admin
        .from('patients')
        .insert({ name: patientName.trim() })
        .select('id')
        .single()
      if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
      patientId = created.id
    }

    // Store the original file (best-effort — a storage failure shouldn't
    // block the analysis itself).
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${patientId}/${Date.now()}.${ext}`
    const fileBuffer = await file.arrayBuffer()
    const { error: storageError } = await admin.storage.from('blood-reports').upload(path, fileBuffer, { contentType: file.type, upsert: false })
    const pdfPath = storageError ? null : path

    const markers = await extractMarkers(rawText)
    if (markers.length === 0) {
      return NextResponse.json({ error: 'No test results could be extracted from this report.' }, { status: 422 })
    }

    const { data: report, error: insertError } = await admin
      .from('reports')
      .insert({
        patient_id: patientId,
        pdf_filename: file.name,
        pdf_path: pdfPath,
        raw_text: rawText,
        markers,
      })
      .select()
      .single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ report })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Extraction failed' }, { status: 500 })
  }
}
