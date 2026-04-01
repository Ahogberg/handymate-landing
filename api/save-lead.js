export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, company_name, source } = req.body
  if (!email) return res.status(400).json({ error: 'Email saknas' })

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/landing_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email,
        company_name,
        source: source || 'offertmall',
        created_at: new Date().toISOString(),
      }),
    })
  } catch { /* non-blocking */ }

  return res.status(200).json({ success: true })
}
