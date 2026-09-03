/**
 * POST /api/save-lead — sparar en lead i landing_leads.
 *
 * Används av /offertgenerator (och är avsedd för fler ytor).
 *
 * FIXAT 2026-09-03: den tidigare versionen svalde varje fel —
 *
 *   try { await fetch(...) } catch { }
 *   return res.status(200).json({ success: true })
 *
 * — och läste aldrig svarsstatusen. Supabase kunde svara 401, 400 eller 404
 * och rutten returnerade ändå success. En trasig skrivning gick alltså inte
 * att skilja från en lyckad, varken för besökaren eller i loggen. Det är
 * samma klass av fel som en kvittotext utan täckning: vi sa "sparat" om
 * något vi inte visste hade sparats.
 *
 * Skyddet följer nu api/foretagskollen-report.js, sajtens etablerade mönster:
 *  - honeypot-fältet "website" (bottar fyller i det, människor ser det inte)
 *  - in-memory rate limit per IP (opålitlig i serverless, men höjer tröskeln)
 *  - e-postregex och längdtak på allt som persisteras
 *  - RIKTIG status: en misslyckad insert ger 500, aldrig ett tyst success
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
const TILLATNA_KALLOR = ['offertmall', 'offertgenerator', 'rot-kalkylator', 'nedrakning', 'skanner', 'jamfor', 'partners']

function klipp(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'okänd'
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'För många försök — vänta en minut' })
  }

  const body = req.body || {}

  // Honeypot: låtsas lyckas så botten inte får någon signal, men rör inget.
  if (body.website) return res.status(200).json({ success: true })

  const email = klipp(body.email, 200)
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Ogiltig e-postadress' })
  }
  const company = klipp(body.company_name, 120)
  const phone = klipp(body.phone, 40)

  // Källan säger vilken yta leaden kom från — den avgör hur du följer upp,
  // så en okänd sträng får inte tyst bli 'offertmall' och förorena statistiken.
  const onskadKalla = klipp(body.source, 40) || 'offertmall'
  const source = TILLATNA_KALLOR.includes(onskadKalla) ? onskadKalla : 'okand'

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : null
  if (payload && JSON.stringify(payload).length > 20_000) {
    return res.status(400).json({ error: 'För stor förfrågan' })
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

  // Saknas nycklarna kan vi inte spara. Säg det — svara ALDRIG success.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[save-lead] SUPABASE_URL eller SUPABASE_SERVICE_KEY saknas i miljön')
    return res.status(500).json({ error: 'Kunde inte spara — prova igen om en stund' })
  }

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
        phone,
        source,
        ...(payload ? { payload } : {}),
        created_at: new Date().toISOString(),
      }),
    })
    if (!dbRes.ok) {
      console.error('[save-lead] insert misslyckades:', dbRes.status, await dbRes.text().catch(() => ''))
      return res.status(500).json({ error: 'Kunde inte spara — prova igen om en stund' })
    }
  } catch (e) {
    console.error('[save-lead] insert kastade:', e)
    return res.status(500).json({ error: 'Kunde inte spara — prova igen om en stund' })
  }

  return res.status(200).json({ success: true })
}
