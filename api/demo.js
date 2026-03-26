export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { scenario, input } = req.body
  if (!scenario || !input) {
    return res.status(400).json({ error: 'Saknar scenario eller input' })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nyckel saknas' })
  }

  const systemPrompts = {

    sms: `Du är Matte, AI-assistent för ett hantverksföretag i Sverige.
En kund har skickat ett SMS. Svara professionellt och naturligt på svenska.
Ditt svar ska:
- Vara kort (2-4 meningar), vänligt och professionellt
- Bekräfta kundens ärende konkret
- Föreslå ett tydligt nästa steg (tid för besök, offert, svar på fråga)
- Avslutas med "// Matte, Handymate"
Svara BARA med SMS-texten. Inget annat.`,

    invoice: `Du är Karin, ekonomiansvarig AI-assistent för ett hantverksföretag i Sverige.
Du ska skriva en artig men tydlig betalningspåminnelse på svenska.
Input-formatet: "Kund: [namn], Belopp: [kr], Förfallodatum: [datum], Fakturanr: [nr]"
Påminnelsen ska:
- Vara professionell och vänlig, inte hotfull
- Nämna fakturanummer och belopp
- Be kunden betala inom 5 dagar
- Erbjuda kontakt vid frågor
- Avslutas med "// Karin, Handymate"
Svara BARA med SMS-texten. Inget annat.`,

    brief: `Du är Matte, chefsassistent på Handymate.
Generera en realistisk morgonbriefing för ett litet VVS/bygg-företag i Stockholm.
Returnera BARA ett JSON-objekt, ingen annan text:
{
  "agents": [
    {
      "id": "karin",
      "name": "Karin",
      "role": "Ekonom",
      "quote": "kort citat max 50 tecken",
      "badge": "t.ex. 2 fakturor förfaller",
      "badgeType": "warning",
      "detail": "en konkret actionable insikt 1-2 meningar"
    },
    { "id": "daniel", "name": "Daniel", "role": "Säljare", "quote": "...", "badge": "...", "badgeType": "success", "detail": "..." },
    { "id": "lars", "name": "Lars", "role": "Projektledare", "quote": "...", "badge": "...", "badgeType": "neutral", "detail": "..." },
    { "id": "hanna", "name": "Hanna", "role": "Marknadschef", "quote": "...", "badge": "...", "badgeType": "success", "detail": "..." }
  ]
}
Gör det realistiskt och varierat. Minst en agent ska ha warning eller danger som badgeType.`
  }

  const systemPrompt = systemPrompts[scenario]
  if (!systemPrompt) {
    return res.status(400).json({ error: 'Okänt scenario' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return res.status(500).json({ error: err.error?.message || 'API-fel' })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    if (scenario === 'brief') {
      try {
        const clean = text.replace(/```json|```/g, '').trim()
        return res.status(200).json({ result: JSON.parse(clean) })
      } catch {
        return res.status(200).json({ result: null, raw: text })
      }
    }

    return res.status(200).json({ result: text })
  } catch (err) {
    console.error('[demo] Error:', err)
    return res.status(500).json({ error: 'Något gick fel' })
  }
}
