'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { signOut, getUser } from '@/lib/auth'
import { extractFromFile, type ExtractProgress } from '@/lib/extractReport'

type ReportRow = {
  id: string
  patient_id: string | null
  pdf_filename: string | null
  created_at: string
  markers: { test_name: string; abnormal: boolean }[] | null
}
type PatientRow = { id: string; name: string }

export default function DashboardPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [patients, setPatients] = useState<Record<string, PatientRow>>({})
  const [patientName, setPatientName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getUser().then((u) => {
      if (!u) { router.replace('/login'); return }
      setCheckingAuth(false)
      load()
    })
  }, [router])

  async function load() {
    const { data: reportRows } = await supabase
      .from('reports')
      .select('id, patient_id, pdf_filename, created_at, markers')
      .order('created_at', { ascending: false })
    setReports((reportRows as ReportRow[]) ?? [])

    const { data: patientRows } = await supabase.from('patients').select('id, name')
    const map: Record<string, PatientRow> = {}
    for (const p of (patientRows as PatientRow[]) ?? []) map[p.id] = p
    setPatients(map)
  }

  async function handleFile(file: File) {
    if (!patientName.trim()) { setError('Enter the patient\'s name first.'); return }
    setUploading(true)
    setError('')
    try {
      setProgress('Reading the report…')
      const onProgress = (p: ExtractProgress) => {
        if (p.stage === 'ocr') setProgress(`Scanned report detected — running OCR on page ${p.page} of ${p.totalPages}…`)
      }
      const extracted = await extractFromFile(file, onProgress)

      const form = new FormData()
      form.append('patient_name', patientName.trim())
      form.append('text', extracted.text)
      form.append('file', file)

      setProgress('Extracting markers…')
      const res = await fetch('/api/parse-report', { method: 'POST', body: form })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'Could not analyze this report.'); return }

      router.push(`/report/${j.report.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extraction failed.')
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  if (checkingAuth) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="font-light text-lg">Blood Panel Analyzer</span>
          </div>
          <button onClick={signOut} className="text-sm text-foreground-secondary hover:text-foreground">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <h2 className="text-sm font-mono uppercase tracking-widest text-foreground-muted mb-4">
            Analyze a new report
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Patient name"
              disabled={uploading}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-light transition"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-lg text-sm transition-all whitespace-nowrap"
            >
              {uploading ? 'Analyzing…' : 'Upload report'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
          {uploading && progress && <p className="text-xs text-foreground-secondary mt-3">{progress}</p>}
          {error && <p className="text-xs text-danger mt-3">{error}</p>}
          <p className="text-xs text-foreground-muted mt-3">
            Any lab, any layout — PDF or a photo/screenshot, up to 15MB. Scanned PDFs are OCR&apos;d automatically in your browser, so a long multi-page report can take a minute or two — keep this tab open while it runs.
          </p>
        </div>

        <h2 className="text-sm font-mono uppercase tracking-widest text-foreground-muted mb-3">Recent reports</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-foreground-secondary py-8 text-center">No reports analyzed yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => {
              const abnormalCount = (r.markers ?? []).filter((m) => m.abnormal).length
              return (
                <Link
                  key={r.id}
                  href={`/report/${r.id}`}
                  className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between hover:border-primary transition"
                >
                  <div>
                    <div className="text-sm font-medium">{patients[r.patient_id ?? '']?.name ?? 'Unknown patient'}</div>
                    <div className="text-xs text-foreground-muted mt-0.5">
                      {r.pdf_filename} · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {abnormalCount > 0 ? (
                    <span className="text-xs font-semibold text-danger bg-primary-light px-2.5 py-1 rounded-full">
                      {abnormalCount} out of range
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-success bg-secondary-light px-2.5 py-1 rounded-full">
                      All normal
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
