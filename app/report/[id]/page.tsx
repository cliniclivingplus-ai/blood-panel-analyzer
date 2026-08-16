'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import type { ExtractedMarker, MarkerRecommendation } from '@/lib/types'

type ReportData = {
  id: string
  pdf_filename: string | null
  markers: ExtractedMarker[] | null
  recommendations: MarkerRecommendation[] | null
  created_at: string
}
type Patient = { id: string; name: string }

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report, setReport] = useState<ReportData | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<MarkerRecommendation[] | null>(null)
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/reports/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j.error) { setError(j.error); return }
        setReport(j.report)
        setPatient(j.patient)
        setFileUrl(j.fileUrl)
        if (j.report.recommendations) setRecommendations(j.report.recommendations)
      })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!report || recommendations !== null) return
    const abnormalCount = (report.markers ?? []).filter((m) => m.abnormal).length
    if (abnormalCount === 0) { setRecommendations([]); return }
    setLoadingRecs(true)
    fetch('/api/recommendations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: id }),
    })
      .then((r) => r.json())
      .then((j) => { if (j.recommendations) setRecommendations(j.recommendations) })
      .finally(() => setLoadingRecs(false))
  }, [report, recommendations, id])

  if (error) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-danger">{error}</div>
  }
  if (!report) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-foreground-secondary">Loading…</div>
  }

  const markers = report.markers ?? []
  const abnormalMarkers = markers.filter((m) => m.abnormal)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground">
            ← Dashboard
          </Link>
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
              View original file →
            </a>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-light mb-1">{patient?.name ?? 'Unknown patient'}</h1>
        <p className="text-sm text-foreground-muted mb-8">
          {report.pdf_filename} · {new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <section className="mb-10">
          <h2 className="text-sm font-mono uppercase tracking-widest text-foreground-muted mb-3">
            Findings ({markers.length} test{markers.length === 1 ? '' : 's'}, {abnormalMarkers.length} out of range)
          </h2>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-wider text-foreground-muted border-b border-border">
                  <th className="px-4 py-3">Test</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Reference range</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((m, i) => (
                  <tr key={i} className={`border-b border-border-light last:border-0 ${m.abnormal ? 'bg-primary-light/40' : ''}`}>
                    <td className="px-4 py-3 font-medium">{m.test_name}</td>
                    <td className={`px-4 py-3 ${m.abnormal ? 'text-danger font-semibold' : ''}`}>
                      {m.result} {m.unit} {m.flag && <span className="ml-1 text-xs">({m.flag})</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground-secondary">{m.ref_range || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-foreground-muted mb-3">Recommendations</h2>
          {abnormalMarkers.length === 0 ? (
            <p className="text-sm text-foreground-secondary">Every extracted value is within range.</p>
          ) : loadingRecs ? (
            <p className="text-sm text-foreground-secondary">Writing recommendations…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {(recommendations ?? []).map((rec, i) => (
                <div key={i} className="bg-card border border-border rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-sm font-semibold">{rec.test_name} — {rec.result}</div>
                    {rec.condition_label && (
                      <span className="text-xs font-medium text-primary bg-primary-light px-2 py-0.5 rounded-full">
                        {rec.condition_label}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${rec.matched ? 'text-foreground-secondary' : 'text-warning'}`}>{rec.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
