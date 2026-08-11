/**
 * POST /api/foretagskollen-report — Företagskollens mjuka gate (2026-08-11).
 *
 * Tar emot e-post + assessment-svar + deterministisk scoring från
 * /foretagskollen, och:
 *   1. sparar leaden i landing_leads (service-nyckel, samma tabell som
 *      save-lead.js/hemsida-order.js — payload-kolumnen kom i v116)
 *   2. mejlar rapporten till prospektet via Resend
 *   3. mejlar en prospect brief till ADMIN_EMAIL (säljunderlag)
 *
 * Till skillnad från api/save-lead.js returnerar den RIKTIG status —
 * en misslyckad lead-insert ska synas under lansering, inte sväljas.
 * Mejlfel efter lyckad insert rapporteras dock som success (leaden är
 * räddad; rapporten kan skickas manuellt).
 *
 * Skydd (sajtens etablerade mönster, se hemsida-scrape.js):
 *  - in-memory rate limit per IP (opålitligt i serverless men höjer tröskeln)
 *  - honeypot-fält ("website") — bottar fyller i det, människor ser det inte
 *  - e-postregex + längdtak på allt som persisteras
 */

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > RATE_MAX
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function klipp(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

function krFmt(n) {
  return typeof n === 'number' ? n.toLocaleString('sv-SE') : '0'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'okänd'
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'För många försök — vänta en minut' })
  }

  const body = req.body || {}

  // Honeypot: ett ifyllt "website"-fält = bot. Låtsas lyckas (ge inte
  // botten någon signal), men rör varken databas eller mejl.
  if (body.website) return res.status(200).json({ success: true })

  const email = klipp(body.email, 200)
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Ogiltig e-postadress' })
  }
  const company = klipp(body.company, 120)

  // Payload persisteras som helhet men storleksbegränsas — svar+scoring
  // från den riktiga sidan är ~2-3 kB; allt större är inte vår klient.
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const scoring = body.scoring && typeof body.scoring === 'object' ? body.scoring : null
  const attribution = body.attribution && typeof body.attribution === 'object' ? body.attribution : {}
  const payload = { answers, scoring, attribution, session_id: klipp(body.session_id, 64) }
  if (JSON.stringify(payload).length > 20_000) {
    return res.status(400).json({ error: 'För stor förfrågan' })
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'andreashogberg93@gmail.com'

  // 1. Leaden först — den får inte gå förlorad för att ett mejl strular.
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/landing_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email,
          company_name: company,
          source: 'foretagskollen',
          payload,
          created_at: new Date().toISOString(),
        }),
      })
      if (!dbRes.ok) {
        console.error('[foretagskollen-report] lead-insert misslyckades:', dbRes.status, await dbRes.text().catch(() => ''))
        return res.status(500).json({ error: 'Kunde inte spara — prova igen om en stund' })
      }
    } catch (e) {
      console.error('[foretagskollen-report] lead-insert kastade:', e)
      return res.status(500).json({ error: 'Kunde inte spara — prova igen om en stund' })
    }
  }

  // 2 + 3. Mejlen (icke-blockerande efter lyckad insert).
  if (RESEND_API_KEY && scoring) {
    const p = scoring.profil || {}
    const leak = scoring.leakage || { total: 0, rows: [] }
    const tim = scoring.adminHours || { total: 0, rows: [] }
    const findings = Array.isArray(scoring.findings) ? scoring.findings : []

    const leakRader = (leak.rows || [])
      .map(r => `  • ${r.label}: ≈ ${krFmt(r.kr)} kr/mån`)
      .join('\n') || '  • Inget tydligt intäktsläckage utifrån svaren — starkt.'
    const timRader = (tim.rows || [])
      .map(r => `  • ${r.label}: ≈ ${r.tim} tim/mån`)
      .join('\n')
    const fyndText = findings
      .map((f, i) => `${i + 1}. ${f.namn} (${f.roll}):\n   ${f.fynd}\n   Vad ${f.namn} skulle göra: ${f.atgard}`)
      .join('\n\n')

    const rapport =
`Hej!

Här är din genomgång från Företagskollen — ${p.bransch || 'er firma'}, ${p.storlek || ''}.

INTÄKTER SOM LÄCKER: ≈ ${krFmt(leak.total)} kr/mån
${leakRader}

ADMIN UTANFÖR ARBETSTID: ≈ ${tim.total} tim/mån
${timRader}

TRE SAKER TEAMET FASTNADE PÅ

${fyndText}

SÅ RÄKNADE VI
Allt bygger på dina egna svar + försiktiga snitt för ${(p.bransch || 'hantverksfirmor').toLowerCase()} i er storlek (snittjobb ~${krFmt(p.marginal)} kr i marginal). Siffrorna är indikativa — de visar områden att undersöka, inte verifierad eller garanterad intäkt.

Vill du se hur teamet tar över det här på riktigt, i er vardag?
Boka en demo: svara på det här mejlet eller skriv till hej@handymate.se — vi utgår från din diagnos.

/Matte och teamet på Handymate
https://handymate.se`

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Matte på Handymate <noreply@handymate.se>',
          to: email,
          subject: `Din Företagskoll — ${p.bransch || 'er firma'}${company ? ` (${company})` : ''}`,
          text: rapport,
        }),
      })
    } catch (e) {
      console.error('[foretagskollen-report] rapportmejl misslyckades:', e)
    }

    // Prospect brief till admin — säljunderlag, inte kundkommunikation.
    const attrRad = Object.entries(attribution).map(([k, v]) => `${k}=${v}`).join(', ') || 'ingen'
    const svarRader = Object.entries(answers).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    const brief =
`Ny Företagskollen-lead${company ? ` — ${company.toUpperCase()}` : ''}

E-post: ${email}
Profil: ${p.bransch || '?'}, ${p.storlek || '?'}
Temperatur: ${(scoring.temperature || 'okänd').toUpperCase()}
Indikativt läckage: ≈ ${krFmt(leak.total)} kr/mån · Admin: ≈ ${tim.total} tim/mån

Topp-3 fynd (ordning = prioritet):
${findings.map((f, i) => `  ${i + 1}. ${f.namn}/${f.roll} (severity ${f.severity})`).join('\n')}

Självrapporterade svar:
${svarRader}

Attribution: ${attrRad}`

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Företagskollen <noreply@handymate.se>',
          to: ADMIN_EMAIL,
          reply_to: email,
          subject: `Företagskollen-lead: ${company || email} — ${(scoring.temperature || '?').toUpperCase()}`,
          text: brief,
        }),
      })
    } catch (e) {
      console.error('[foretagskollen-report] admin-brief misslyckades:', e)
    }
  }

  return res.status(200).json({ success: true })
}
