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
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'andreashogberg93@gmail.com'

  const servicesList = Array.isArray(services) ? services : (services ? [services] : [])

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
          services: servicesList,
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
    if (RESEND_API_KEY) {
      const emailBody =
`Ny hemsidebeställning inkommen!

Företag: ${company_name || '—'} (${industry || '—'})
Stad: ${city || '—'}
Kontakt: ${contact_name || '—'}, ${contact_phone || '—'}, ${contact_email || '—'}
Handymate-kund: ${handymate_customer ? 'Ja' : 'Nej'}
Befintlig sajt: ${existing_url || 'Ingen'}

---
CLAUDE DESIGN PROMPT — kopiera och klistra in direkt:

Bygg en professionell hemsida för ett hantverksföretag.

Företag: ${company_name || ''}
Bransch: ${industry || ''}
Stad: ${city || ''}
Primärfärg: ${primary_color || ''}
Stil: ${style || ''}
Tjänster: ${servicesList.join(', ')}
USP: ${usp || ''}
Om företaget: ${about || ''}
Öppettider: ${opening_hours || ''}

Kontakt på hemsidan:
Telefon: ${phone || ''}
Mail: ${email || ''}

Skapa en komplett hemsida med hero-sektion med företagsnamn
och USP, tjänster-sektion med kort beskrivning av varje tjänst,
om-oss-sektion, kontaktformulär och footer med kontaktinfo.
Professionell känsla anpassad för hantverksbranschen.
Använd ${primary_color || '(primärfärg)'} som primärfärg genomgående.
---
`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Handymate <noreply@handymate.se>',
          to: ADMIN_EMAIL,
          reply_to: contact_email || undefined,
          subject: `Ny hemsidebeställning — ${company_name || 'Okänt företag'}`,
          text: emailBody,
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
