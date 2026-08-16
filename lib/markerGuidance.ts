// Normalizes a marker/test name for matching across labs that print the
// same test under different names (e.g. "Hb" vs "Haemoglobin" vs
// "Hemoglobin (Hb)") — strip everything but letters/digits, lowercase.
export function normalizeMarkerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export type MarkerGuidanceRow = {
  id: string
  marker_name: string
  synonyms: string[]
  direction: 'low' | 'high'
  condition_label: string
  explanation: string
  recommended_actions: string
}

// A guidance row matches a marker's own name OR any of its synonyms —
// direction isn't checked here (the caller already knows whether the
// marker came back abnormal; direction in the table is metadata for a
// human reading the seed data, not a second gate).
export function findGuidanceMatch(testName: string, rows: MarkerGuidanceRow[]): MarkerGuidanceRow | null {
  const target = normalizeMarkerName(testName)
  if (!target) return null
  for (const row of rows) {
    const candidates = [row.marker_name, ...row.synonyms]
    if (candidates.some((c) => normalizeMarkerName(c) === target)) return row
  }
  return null
}
