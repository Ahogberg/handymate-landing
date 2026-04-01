export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    mode = 'web',
    company_name, org_number, phone, email: companyEmail,
    address, logo_base64, primary_color,
    quote_number, quote_date, valid_until, payment_terms,
    customer_name, customer_address, customer_email,
    title, items, rot_enabled, notes,
  } = req.body

  const color = primary_color || '#0F766E'

  const e = s => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const today = new Date().toLocaleDateString('sv-SE')
  const defaultValid = new Date(Date.now() + 30 * 86400000).toLocaleDateString('sv-SE')

  const displayDate = quote_date || today
  const displayValid = valid_until || defaultValid
  const displayNumber = quote_number || 'O-2026-001'

  const subtotal = (items || []).reduce((s, i) => s + ((+i.qty || 0) * (+i.price || 0)), 0)
  const vat = Math.round(subtotal * 0.25)
  const rot = rot_enabled ? Math.round(subtotal * 0.30) : 0
  const total = subtotal + vat - rot

  const fmtKr = n => n.toLocaleString('sv-SE') + ' kr'

  const logoHtml = logo_base64
    ? `<img src="${logo_base64}" style="max-height:56px;max-width:140px;object-fit:contain;filter:brightness(0) invert(1)" alt=""/>`
    : `<div style="font-size:20px;font-weight:700;color:white">${e(company_name) || 'Ditt Företag'}</div>`

  const itemRows = (items || []).filter(i => i.description).map(item => {
    const lineTotal = (+item.qty || 0) * (+item.price || 0)
    return `
    <tr>
      <td style="padding:11px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top">
        <div style="font-weight:500;color:#1e293b;font-size:13px">${e(item.description)}</div>
        ${item.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${e(item.note)}</div>` : ''}
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#64748b">${e(item.qty)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#64748b">${e(item.unit) || 'st'}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;color:#64748b">${fmtKr(+item.price || 0)}</td>
      <td style="padding:11px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:500;color:#1e293b">${fmtKr(lineTotal)}</td>
    </tr>`
  }).join('')

  const contactLine = [phone ? e(phone) : '', companyEmail ? e(companyEmail) : ''].filter(Boolean).join(' · ')

  const upsellHtml = mode === 'web' ? `
    <div style="background:#0f2e2a;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#5eead4;margin-bottom:12px">✦ Skapa ett konto för att låsa upp</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="font-size:12px;color:#e2e8f0;display:flex;gap:8px"><span style="color:#4ade80">✓</span> Skicka direkt till kund</div>
        <div style="font-size:12px;color:#e2e8f0;display:flex;gap:8px"><span style="color:#4ade80">✓</span> Digital signering</div>
        <div style="font-size:12px;color:#e2e8f0;display:flex;gap:8px"><span style="color:#4ade80">✓</span> Automatisk uppföljning</div>
        <div style="font-size:12px;color:#e2e8f0;display:flex;gap:8px"><span style="color:#4ade80">✓</span> Projekt skapas automatiskt</div>
        <div style="font-size:12px;color:#99d4cd;display:flex;gap:8px;opacity:0.6"><span>🔒</span> Matte svarar på kundfrågor</div>
        <div style="font-size:12px;color:#99d4cd;display:flex;gap:8px;opacity:0.6"><span>🔒</span> Fakturering med ett klick</div>
      </div>
      <a href="https://app.handymate.se/onboarding" style="display:block;width:100%;padding:11px;background:#14b8a6;color:white;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none;text-align:center">
        Prova Handymate gratis i 14 dagar →
      </a>
    </div>` : ''

  const signHtml = mode === 'web' ? `
    <div style="background:linear-gradient(135deg,#f0fdf9,#e0f7f4);border:1px solid #a7f3d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:600;color:#0f2e2a">Digital signering</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">Kunden signerar direkt — ingen utskrift krävs</div>
      </div>
      <div style="background:#0F766E;color:white;padding:9px 18px;border-radius:8px;font-size:12px;font-weight:600">
        Kräver Handymate-konto
      </div>
    </div>` : ''

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: #1e293b; }
@media print {
  body { padding: 0; }
  .no-print { display: none !important; }
}
</style>
</head>
<body style="padding:${mode === 'web' ? '0' : '32px'}">

  <!-- Branded header -->
  <div style="background:${color};padding:28px 40px;display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:16px">
      ${logoHtml}
      <div>
        <div style="color:white;font-size:16px;font-weight:600">${e(company_name) || 'Ditt Företag AB'}</div>
        <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px;line-height:1.7">
          ${contactLine}${address ? '<br>' + e(address) : ''}
        </div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:500">Offert</div>
      <div style="font-size:26px;font-weight:700;color:white;margin:4px 0 2px">${e(displayNumber)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.75);line-height:1.8">
        Datum: ${displayDate}<br>
        Giltig till: ${displayValid}
      </div>
    </div>
  </div>

  <!-- Accent-linje -->
  <div style="height:3px;background:linear-gradient(90deg,${color},rgba(0,0,0,0))"></div>

  <div style="padding:32px 40px">

    <!-- Meta-rad -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:28px">
      <div>
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:5px">Faktureras till</div>
        <div style="font-size:13px;color:#1e293b;line-height:1.7">${e(customer_name) || 'Kundnamn'}${customer_address ? '<br>' + e(customer_address) : ''}</div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:5px">Avser</div>
        <div style="font-size:13px;color:#1e293b">${e(title) || 'Offertens titel'}</div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:5px">Betalningsvillkor</div>
        <div style="font-size:13px;color:${color};font-weight:500">${e(payment_terms) || '30 dagar netto'}</div>
      </div>
    </div>

    <!-- Rader -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${color};padding:10px 12px;font-weight:500;border-bottom:2px solid ${color}">Beskrivning</th>
          <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${color};padding:10px 12px;font-weight:500;border-bottom:2px solid ${color}">Antal</th>
          <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${color};padding:10px 12px;font-weight:500;border-bottom:2px solid ${color}">Enhet</th>
          <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${color};padding:10px 12px;font-weight:500;border-bottom:2px solid ${color}">Pris/enhet</th>
          <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${color};padding:10px 12px;font-weight:500;border-bottom:2px solid ${color}">Summa</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Summor -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:28px">
      <div style="width:220px">
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#64748b">
          <span>Netto exkl. moms</span><span>${fmtKr(subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#64748b">
          <span>Moms 25%</span><span>${fmtKr(vat)}</span>
        </div>
        ${rot_enabled ? `
        <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:${color}">
          <span>ROT-avdrag 30%</span><span>−${fmtKr(rot)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:600;color:#1e293b;border-top:2px solid ${color};margin-top:8px">
          <span>Att betala</span><span>${fmtKr(total)}</span>
        </div>
      </div>
    </div>

    ${notes ? `
    <div style="background:#f8fafc;border-left:3px solid ${color};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:24px;font-size:13px;color:#64748b;line-height:1.6">
      ${e(notes)}
    </div>` : ''}

    ${signHtml}
    ${upsellHtml}

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0;padding-top:18px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
      <div>${e(company_name) || ''} ${org_number ? '· Org.nr ' + e(org_number) : ''} · F-skattsedel: Godkänd</div>
      <div>Genererad av <span style="color:${color};font-weight:500">Handymate</span></div>
    </div>

  </div>
</body>
</html>`

  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json({ html, total, subtotal, vat, rot })
}
