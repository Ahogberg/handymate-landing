import dns from 'dns/promises'
import net from 'net'

/**
 * Säker hämtning av en användarstyrd URL (SSRF-skydd, 2026-08-06).
 *
 * ═══ VARFÖR ═══
 *
 * api/hemsida-scrape.js tog emot en URL i request-bodyn och gjorde
 * `fetch(url)` med exakt en kontroll före: `if (!url)`. Endpointen är
 * oautentiserad och orataad. Angriparen styrde alltså fullt ut vad servern
 * hämtade.
 *
 * ═══ VAD SOM FAKTISKT VAR VÄRST HÄR ═══
 *
 * Det klassiska SSRF-scenariot — stjäl molnleverantörens instansuppgifter via
 * 169.254.169.254 — är dämpat i den här deploymenten: Vercels sandbox når inte
 * IMDS, det finns inget internt VPC-nät att pivotera i, och rå HTML når aldrig
 * klienten utan passerar Claude Haiku som extraherar tio fält.
 *
 * Den konkreta omedelbara risken var i stället två andra saker, och de fixas
 * båda här: `await res.text()` läste hela svarskroppen obegränsat i minnet
 * (en tillräckligt stor fil fäller funktionen), och varje anrop kostade
 * Anthropic-tokens på angriparens val av innehåll utan någon gräns alls.
 *
 * Skyddet byggs ändå fullt ut, eftersom antagandet "vi kör på Vercel utan
 * VPC" är sant i dag och inte nödvändigtvis i morgon.
 *
 * ═══ DNS OCH REBINDING — ETT MEDVETET AVSTEG ═══
 *
 * Värdnamnet slås upp och SAMTLIGA returnerade adresser valideras innan
 * hämtning. Det skyddar inte fullt ut mot DNS rebinding, där ett andra
 * uppslag ger en annan adress än det första.
 *
 * Den vanliga motmedicinen — hämta via den validerade IP-adressen med
 * Host-huvudet satt — FUNGERAR INTE över https. `fetch` exponerar ingen
 * SNI-override, så TLS-certifikatet skulle valideras mot IP-adressen i stället
 * för mot värdnamnet och avvisas för varje legitim sida. Ett skydd som
 * blockerar allt är värdelöst.
 *
 * Restrisken accepteras därför medvetet, och den är liten här: rebinding
 * kräver angreppskontrollerad DNS med mycket kort TTL och exakt tajmning, och
 * utbytet är ändå blint eftersom rå HTML aldrig når klienten utan passerar
 * Claude som extraherar tio namngivna fält. Vill man stänga även det kräver
 * det en egen undici-dispatcher med pinnad connect — noterat, inte byggt.
 */

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — mer än nog för en företagssida
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 10000

const ALLOWED_CONTENT = /^(text\/html|text\/plain|application\/xhtml\+xml)/i

/** Adresser som aldrig får hämtas, oavsett hur de nås. */
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    if (p[0] === 0) return true                                   // 0.0.0.0/8
    if (p[0] === 10) return true                                  // RFC1918
    if (p[0] === 127) return true                                 // loopback
    if (p[0] === 169 && p[1] === 254) return true                 // link-local + molnmetadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true     // RFC1918
    if (p[0] === 192 && p[1] === 168) return true                 // RFC1918
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true    // CGNAT
    if (p[0] >= 224) return true                                  // multicast + reserverat
    return false
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true                    // loopback / ospecificerad
    if (v.startsWith('fe80')) return true                         // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true     // unique local
    if (v.startsWith('ff')) return true                           // multicast

    // IPv4-mappade adresser måste valideras som den IPv4 de faktiskt är.
    // TVÅ former, och den andra är lätt att missa: new URL() normaliserar
    // "::ffff:169.254.169.254" till HEXFORMEN "::ffff:a9fe:a9fe". En regex
    // som bara letar efter punktnotation släpper alltså igenom molnmetadata-
    // adressen. Upptäckt av testet i tests/ssrf.test.mjs 2026-08-06.
    const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (dotted) return isBlockedIp(dotted[1])

    const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hex) {
      const a = parseInt(hex[1], 16)
      const b = parseInt(hex[2], 16)
      return isBlockedIp(`${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`)
    }
    return false
  }
  return true // okänt format → blockera
}

export class UnsafeUrlError extends Error {}

/** Validerar protokoll, credentials och samtliga IP-adresser värdnamnet pekar
    på. Returnerar den parsade URL:en att hämta på (värdnamnet, inte IP:t —
    se filhuvudet om varför). */
async function validate(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('Ogiltig URL')
  }

  // Endast https. http tillåter avlyssning och är dessutom den enklaste vägen
  // till interna adminytor som saknar TLS.
  if (parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('Endast https stöds')
  }
  // Credentials i URL:en (https://user:pass@host) används för att smuggla
  // förbi naiv värdnamnsparsning.
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('Inloggningsuppgifter i URL stöds inte')
  }

  // Är värden redan en IP-adress behövs inget uppslag.
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError('Adressen är inte tillåten')
    return { parsed, hostname: host, ip: host }
  }

  let records
  try {
    records = await dns.lookup(host, { all: true })
  } catch {
    throw new UnsafeUrlError('Värdnamnet kunde inte slås upp')
  }
  if (!records.length) throw new UnsafeUrlError('Värdnamnet kunde inte slås upp')

  // ALLA adresser måste vara tillåtna. Räcker det att en är det kan ett
  // värdnamn som pekar på både en publik och en privat adress passera.
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new UnsafeUrlError('Adressen är inte tillåten')
  }

  return { parsed, hostname: host, ip: records[0].address }
}

/**
 * Hämtar en extern sida säkert. Returnerar texten (max MAX_BYTES).
 * Kastar UnsafeUrlError för allt som inte får hämtas.
 */
export async function safeFetchExternalUrl(rawUrl) {
  let current = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { parsed } = await validate(current)

    // Hämtar på VÄRDNAMNET, inte på den validerade IP-adressen. Se filhuvudet:
    // IP + Host-huvud bryter TLS-certifikatvalideringen över https, eftersom
    // fetch inte exponerar någon SNI-override.
    const res = await fetch(parsed.toString(), {
      redirect: 'manual', // varje hopp valideras om, aldrig blint följt
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Handymate/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new UnsafeUrlError('Omdirigering utan mål')
      current = new URL(location, parsed).toString()
      continue
    }

    if (!res.ok) throw new UnsafeUrlError(`Sidan svarade ${res.status}`)

    const type = res.headers.get('content-type') || ''
    if (type && !ALLOWED_CONTENT.test(type)) {
      throw new UnsafeUrlError('Sidan är inte HTML')
    }

    // Storleksgränsen tillämpas på STRÖMMEN, inte efter nedladdning.
    // Tidigare läste `await res.text()` hela kroppen i minnet först — en
    // tillräckligt stor fil fällde funktionen innan någon gräns hann gälla.
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) throw new UnsafeUrlError('Sidan är för stor')

    if (!res.body) return ''
    const reader = res.body.getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_BYTES) {
        await reader.cancel()
        break // det vi hunnit läsa räcker gott för extraktionen
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  throw new UnsafeUrlError('För många omdirigeringar')
}
