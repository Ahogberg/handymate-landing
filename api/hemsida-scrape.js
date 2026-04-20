export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body || {}
  if (!url) return res.status(400).json({ error: 'URL saknas' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API-nyckel saknas' })

  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Handymate/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await pageRes.text()

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
    console.error('[hemsida-scrape] Error:', err)
    return res.status(200).json({
      success: false,
      error: 'Kunde inte läsa sidan — fyll i manuellt',
      data: {},
    })
  }
}
