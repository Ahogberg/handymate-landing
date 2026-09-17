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
  // Sidvisning på hela sajten (2026-09-17, sidmatning.js). Utan den gick en
  // tom lead-tabell inte att tolka: "ingen besöker" och "ingen fyller i" såg
  // exakt likadana ut.
  'page_viewed',
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

  // TYSTNADEN ÄR STÄNGD (2026-09-17). Raden här var tidigare
  // `if (!URL || !KEY) return res.status(200).end()` — en felkonfigurerad
  // deploy tappade alltså VARJE händelse och rapporterade 200 tillbaka.
  // Ingenting, någonstans, sa till. Tabellen var tom i en månad och vi läste
  // det som "ingen besöker sajten".
  //
  // Klienten bryr sig inte om statuskoden (sendBeacon läser inget svar), så
  // en felkod kostar ingenting i upplevelsen men syns i Vercels felstatistik
  // och i funktionsloggen. Ett mätfel ska vara högt, inte tyst.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[event] MÄTNINGEN ÄR NERE: NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_KEY saknas i denna deploy. Varje landningshändelse tappas.')
    return res.status(503).end()
  }

  try {
    const svar = await fetch(`${SUPABASE_URL}/rest/v1/landing_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event, session_id: sessionId, payload }),
    })
    if (!svar.ok) {
      const text = await svar.text().catch(() => '')
      console.error('[event] landing_events avvisade skrivningen:', svar.status, text.slice(0, 300))
      return res.status(502).end()
    }
  } catch (err) {
    // Nätfel mot Supabase. Får inte påverka klienten, men ska synas.
    console.error('[event] kunde inte nå landing_events:', err && err.message ? err.message : err)
    return res.status(502).end()
  }

  return res.status(200).end()
}
