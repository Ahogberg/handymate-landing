export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    company_name, org_number, industry, city,
    phone, email, existing_url,
    services, usp, about,
    style, primary_color,
    contact_name, contact_phone, contact_email,
    opening_hours,
    handymate_customer,
    scraped_data,
  } = req.body || {}

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/website_orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          company_name,
          org_number,
          industry,
          city,
          phone,
          email,
          existing_url,
          services: Array.isArray(services) ? services : (services ? [services] : []),
          usp,
          about,
          style,
          primary_color,
          contact_name,
          contact_phone,
          contact_email,
          opening_hours,
          handymate_customer: !!handymate_customer,
          scraped_data: scraped_data || null,
          status: 'new',
          created_at: new Date().toISOString(),
        }),
      })
    }
  } catch { /* non-blocking */ }

  try {
    if (ANTHROPIC_API_KEY) {
      await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
    }
  } catch { /* non-blocking */ }

  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/landing_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email: contact_email || email,
          company_name,
          source: 'hemsida_order',
          created_at: new Date().toISOString(),
        }),
      })
    }
  } catch { /* non-blocking */ }

  return res.status(200).json({ success: true })
}
