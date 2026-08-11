/**
 * POST /api/event — funnel-analytics för landningssajten (2026-08-11).
 *
 * Sajten hade NOLL mätning; det här är den minsta möjliga egna lösningen
 * (inga tredjeparter, ingen cookie, GDPR-enkel). Klienten skickar
 * fire-and-forget via sendBeacon; svaret spelar ingen roll för UX:et.
 *
 * Skrivningar går ENBART härifrån med service-nyckeln till landing_events
 * (service_role-only per v116 — anon-nyckeln kan varken läsa eller skriva).
 *
 * Skydd: event-allowlist (skräp avvisas), payload-tak ~2 kB, in-memory
 * rate limit per IP (sajtens etablerade mönster, se hemsida-scrape.js).
 */

const TILLATNA_EVENT = new Set([
  'assessment_viewed',
  'assessment_started',
  'question_completed',
  'assessment_completed',
  'diagnosis_viewed',
  'report_requested',
  'demo_bridge_viewed',
  'booking_cta_clicked',
])

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60 // en hel genomklickning är ~15 event; 60/min är generöst för en människa
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > RATE_MAX
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'okänd'
  if (rateLimited(ip)) return res.status(429).end()

  // sendBeacon skickar Blob → body kan vara sträng eller redan parsad.
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).end() }
  }
  if (!body || typeof body !== 'object') return res.status(400).end()

  const event = typeof body.event === 'string' ? body.event : ''
  if (!TILLATNA_EVENT.has(event)) return res.status(400).end()

  const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : null
  let payload = body.payload && typeof body.payload === 'object' ? body.payload : null
  if (payload && JSON.stringify(payload).length > 2000) payload = null

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(200).end()

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/landing_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event, session_id: sessionId, payload }),
    })
  } catch { /* mätfel får aldrig påverka klienten */ }

  return res.status(200).end()
}
