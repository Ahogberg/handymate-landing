export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    company_name,
    org_number,
    phone,
    email,
    address,
    logo_base64,
    primary_color,
    customer_name,
    customer_address,
    title,
    items,
    valid_days,
    rot_enabled,
    notes,
  } = req.body

  const color = primary_color || '#0F766E'
  const today = new Date().toLocaleDateString('sv-SE')
  const validUntil = new Date(Date.now() + (valid_days || 30) * 86400000)
    .toLocaleDateString('sv-SE')

  // Beräkna summor
  const subtotal = (items || []).reduce((s, i) => s + (i.qty * i.price), 0)
  const vat = Math.round(subtotal * 0.25)
  const rot = rot_enabled ? Math.round(subtotal * 0.30) : 0
  const total = subtotal + vat - rot

  const itemRows = (items || []).map(item => {
    const desc = escapeHtml(item.description || '')
    const unit = escapeHtml(item.unit || 'st')
    const lineTotal = (item.qty || 0) * (item.price || 0)
    return `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b">${desc}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right">${item.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right">${unit}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right">${(item.price || 0).toLocaleString('sv-SE')} kr</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:right;font-weight:500">${lineTotal.toLocaleString('sv-SE')} kr</td>
    </tr>`
  }).join('')

  const safeCompany = escapeHtml(company_name || 'Företagsnamn')
  const safeOrgNr = escapeHtml(org_number || '')
  const safePhone = escapeHtml(phone || '')
  const safeEmail = escapeHtml(email || '')
  const safeAddress = escapeHtml(address || '')
  const safeCustomerName = escapeHtml(customer_name || 'Kundnamn')
  const safeCustomerAddress = escapeHtml(customer_address || '')
  const safeTitle = escapeHtml(title || 'Offertens titel')
  const safeNotes = escapeHtml(notes || '')

  const logoHtml = logo_base64
    ? `<img src="${logo_base64}" style="max-height:60px;max-width:160px;object-fit:contain" alt="Logo"/>`
    : `<div style="font-size:22px;font-weight:700;color:${color}">${safeCompany}</div>`

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; padding: 40px; color: #1e293b; font-size: 14px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div>
      ${logoHtml}
      <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.8">
        ${safeOrgNr ? `Org.nr: ${safeOrgNr}<br>` : ''}
        ${safePhone ? `${safePhone}<br>` : ''}
        ${safeEmail ? `${safeEmail}<br>` : ''}
        ${safeAddress ? `${safeAddress}` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${color};font-weight:600">Offert</div>
      <div style="font-size:24px;font-weight:700;color:#0f2e2a;margin:4px 0">O-2026-001</div>
      <div style="font-size:12px;color:#64748b;line-height:1.8">
        Datum: ${today}<br>
        Giltig till: ${validUntil}
      </div>
    </div>
  </div>

  <!-- Teal-linje -->
  <div style="height:2px;background:${color};margin-bottom:28px;opacity:0.3"></div>

  <!-- Kund + avser -->
  <div style="display:flex;gap:48px;margin-bottom:32px">
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:6px">Faktureras till</div>
      <div style="font-size:14px;color:#1e293b;line-height:1.7">${safeCustomerName}<br>${safeCustomerAddress}</div>
    </div>
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:6px">Avser</div>
      <div style="font-size:14px;color:#1e293b">${safeTitle}</div>
    </div>
  </div>

  <!-- Rader -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <thead>
      <tr style="border-bottom:2px solid #e2e8f0">
        <th style="text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;padding:0 8px 10px;font-weight:400">Beskrivning</th>
        <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;padding:0 8px 10px;font-weight:400">Antal</th>
        <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;padding:0 8px 10px;font-weight:400">Enhet</th>
        <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;padding:0 8px 10px;font-weight:400">Pris/enhet</th>
        <th style="text-align:right;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;padding:0 8px 10px;font-weight:400">Summa</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Summor -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <div style="width:240px">
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#64748b">
        <span>Netto exkl. moms</span><span>${subtotal.toLocaleString('sv-SE')} kr</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#64748b">
        <span>Moms 25%</span><span>${vat.toLocaleString('sv-SE')} kr</span>
      </div>
      ${rot_enabled ? `
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:${color}">
        <span>ROT-avdrag 30%</span><span>−${rot.toLocaleString('sv-SE')} kr</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:600;color:#1e293b;border-top:1px solid #e2e8f0;margin-top:8px">
        <span>Att betala</span><span>${total.toLocaleString('sv-SE')} kr</span>
      </div>
    </div>
  </div>

  ${safeNotes ? `
  <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px;color:#64748b;line-height:1.6">
    ${safeNotes}
  </div>` : ''}

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;gap:48px">
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:4px">Org.nr</div>
      <div style="font-size:12px;color:#64748b">${safeOrgNr || '—'}</div>
    </div>
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:4px">F-skattsedel</div>
      <div style="font-size:12px;color:#64748b">Godkänd</div>
    </div>
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#cbd5e1;margin-bottom:4px">Genererad av</div>
      <div style="font-size:12px;color:${color};font-weight:500">Handymate</div>
    </div>
  </div>

</body>
</html>`

  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json({ html, total, subtotal, vat, rot })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
