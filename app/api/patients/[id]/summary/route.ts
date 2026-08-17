import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import Groq from 'groq-sdk'
import { createSupabaseAdmin } from '@/lib/supabaseServer'
import { buildMarkerTrends } from '@/lib/patientTrends'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

const NO_TREND_MESSAGE = 'Not enough history yet. Upload another report for this patient to start seeing a trend summary.'

// Same cache-unless-regenerate pattern as /api/recommendations. The prompt
// only ever gets the patient's own real historical values (date -> value
// per marker) and is explicitly barred from claiming a trend that isn't
// actually in that data — the same anti-fabrication rule the per-report
// recommendations already follow, just applied to a timeline instead of a
// single reading.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const regenerate = body?.regenerate === true

    const admin = createSupabaseAdmin()

    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, name, progress_summary')
      .eq('id', id)
      .single()
    if (patientError || !patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    if (!regenerate && patient.progress_summary) {
      return NextResponse.json({ source: 'cache', summary: patient.progress_summary })
    }

    const { data: reports } = await admin
      .from('reports')
      .select('created_at, markers')
      .eq('patient_id', id)
      .order('created_at', { ascending: true })

    const trends = buildMarkerTrends((reports ?? []).map((r) => ({ created_at: r.created_at, markers: r.markers })))
    const withHistory = trends.filter((t) => t.points.length >= 2)

    if (withHistory.length === 0) {
      return NextResponse.json({ source: 'generated', summary: NO_TREND_MESSAGE })
    }

    const trendText = withHistory
      .map((t) => {
        const points = t.points
          .map((p) => `${new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}: ${p.value}${t.unit ? ' ' + t.unit : ''}${p.abnormal ? ' (out of range)' : ''}`)
          .join(', ')
        return `${t.displayName} (reference range: ${t.refRange || 'not printed'}): ${points}`
      })
      .join('\n')

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      max_tokens: 300,
      temperature: 0.25,
      reasoning_effort: 'low',
      messages: [
        {
          role: 'system',
          content: [
            'You write a short plain-language progress summary for a coach reviewing a patient\'s blood test history across multiple reports.',
            'RULES:',
            '- Only describe trends that are actually present in the data given — never claim a marker improved, worsened, or stayed stable unless the numbers given show that',
            '- Reference the real values and dates given',
            '- Group related findings together in plain language rather than listing every marker mechanically',
            '- State things plainly and confidently where the data supports it; do not hedge with "may/might/could/possibly"',
            '- 3-5 sentences, or short bullet points if that reads more clearly for several markers',
            '- Never use an em dash (—); use a comma, period, or "and" instead',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Patient: ${patient.name}\n\nMarker history (only markers with 2+ readings are included):\n${trendText}\n\nWrite the progress summary.`,
        },
      ],
    })

    const summary = completion.choices[0]?.message?.content?.trim() || NO_TREND_MESSAGE
    await admin.from('patients').update({ progress_summary: summary }).eq('id', id)

    return NextResponse.json({ source: 'generated', summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate summary' }, { status: 500 })
  }
}
