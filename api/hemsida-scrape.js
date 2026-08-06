import { safeFetchExternalUrl, UnsafeUrlError } from './_lib/safe-fetch.js'

/**
 * Enkel takräknare per IP (2026-08-06). Endpointen är oautentiserad och varje
 * anrop kostar Anthropic-tokens — utan tak kan vem som helst bränna vår budget
 * eller använda domänen som anonym request-proxy.
 *
 * In-memory räcker inte i serverless (varje instans har sin egen karta), men
 * höjer tröskeln från "gratis och obegränsat" till "kräver distribuerade
 * anrop". Kartläggningens P1.3 föreslår en distribuerad lösning — den gäller
 * fler endpoints än den här och görs separat.
 */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear() // enkel takhållning på minnet
  return list.length > RATE_MAX
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body || {}
  if (!url) return res.status(400).json({ error: 'URL saknas' })

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'okänd'
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'För många försök — vänta en minut' })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nyckel saknas' })

  try {
    // Ersätter ett rått fetch(url) utan någon validering alls. Se
    // api/_lib/safe-fetch.js för vad som kontrolleras och varför.
    const html = await safeFetchExternalUrl(url)

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: 'Du är en dataextraktionsmotor. Svara ENDAST med valid JSON, inget annat. Inga förklaringar, inga backticks.',
        messages: [{
          role: 'user',
          content: `Extrahera följande från denna webbsidetext och svara med JSON:
{
  "company_name": "företagsnamn",
  "tagline": "slogan om finns",
  "description": "kort beskrivning av företaget, max 2 meningar",
  "services": ["tjänst 1", "tjänst 2", "tjänst 3"],
  "city": "stad/område",
  "phone": "telefonnummer om finns",
  "email": "mailadress om finns",
  "org_number": "org-nummer om finns",
  "brand_colors": ["#hexfärg1", "#hexfärg2"],
  "tone": "modern|professionell|vänlig|tuff"
}

Webbsidetext:
${text}`,
        }],
      }),
    })

    const claudeData = await claudeRes.json()
    const raw = claudeData.content?.[0]?.text || '{}'
    const clean = raw.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)

    return res.status(200).json({ success: true, data: extracted })
  } catch (err) {
    // Blockerad adress loggas som avvisad, inte som fel — det är skyddet som
    // fungerar, och skillnaden behövs för att kunna se missbruksmönster.
    if (err instanceof UnsafeUrlError) {
      console.warn(`[hemsida-scrape] avvisad URL från ${ip}: ${err.message}`)
    } else {
      console.error('[hemsida-scrape] Error:', err)
    }
    // Samma svar oavsett orsak: skillnader i felmeddelande eller statuskod
    // hade gjort endpointen till en portskanner via svarsanalys.
    return res.status(200).json({
      success: false,
      error: 'Kunde inte läsa sidan — fyll i manuellt',
      data: {},
    })
  }
}
