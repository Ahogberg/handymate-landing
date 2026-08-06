/**
 * Facit för SSRF-skyddet i api/_lib/safe-fetch.js (2026-08-06).
 *
 * Körs utan testramverk, utan beroenden:
 *   node tests/ssrf.test.mjs
 *
 * ═══ VARFÖR TESTET SER UT SÅ HÄR ═══
 *
 * Varje rad motsvarar ett verkligt angreppssätt, inte en abstrakt regel. Det
 * är listan man skulle prova mot endpointen, och den ska därför kunna läsas
 * av någon som inte kan koden.
 *
 * En av raderna hittade ett verkligt hål när skyddet skrevs:
 * `https://[::ffff:169.254.169.254]/` — new URL() normaliserar den till
 * HEXFORMEN `::ffff:a9fe:a9fe`, som den första implementationens regex inte
 * matchade. Molnmetadata-adressen släpptes alltså igenom av ett skydd som såg
 * komplett ut. Utan den raden hade felet aldrig upptäckts.
 */
import { safeFetchExternalUrl, UnsafeUrlError } from '../api/_lib/safe-fetch.js'

const MUST_BLOCK = [
  ['http://localhost/', 'fel protokoll — http tillåter avlyssning och är vägen till interna adminytor utan TLS'],
  ['https://127.0.0.1/', 'loopback'],
  ['https://169.254.169.254/latest/meta-data/', 'molnleverantörens metadata-endpoint'],
  ['https://[::ffff:169.254.169.254]/', 'IPv4-mappad metadata — normaliseras till hexform av new URL()'],
  ['https://10.0.0.1/', 'RFC1918'],
  ['https://172.16.0.1/', 'RFC1918'],
  ['https://192.168.1.1/', 'RFC1918'],
  ['https://100.64.0.1/', 'CGNAT'],
  ['https://[::1]/', 'IPv6 loopback'],
  ['https://user:pass@example.com/', 'credentials i URL smugglar förbi naiv värdnamnsparsning'],
  ['file:///etc/passwd', 'fel protokoll'],
  ['ftp://example.com/', 'fel protokoll'],
  ['inte-en-url', 'skräpinput'],
]

let failed = 0

for (const [url, why] of MUST_BLOCK) {
  try {
    await safeFetchExternalUrl(url)
    console.error(`  FEL — släpptes igenom: ${url}  (${why})`)
    failed++
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      console.log(`  ok  ${url}  →  ${err.message}`)
    } else {
      console.error(`  FEL — fel feltyp för ${url}: ${err.constructor.name}. ` +
        `Att den kastar av annan anledning är inte samma sak som att den blockeras.`)
      failed++
    }
  }
}

// Skyddet är värdelöst om det också blockerar legitima sidor. Nätverksfel här
// (offline-körning) räknas inte som misslyckande — bara ett UnsafeUrlError gör.
try {
  const html = await safeFetchExternalUrl('https://example.com/')
  console.log(`  ok  https://example.com/  →  hämtade ${html.length} tecken`)
} catch (err) {
  if (err instanceof UnsafeUrlError) {
    console.error(`  FEL — legitim sida blockerades: ${err.message}`)
    failed++
  } else {
    console.log('  (hoppar över example.com — inget nät)')
  }
}

console.log(failed === 0 ? '\nAlla kontroller gröna.' : `\n${failed} MISSLYCKADES`)
// exitCode i stället för process.exit(): det senare river processen medan
// DNS-handles fortfarande stängs, vilket ger en libuv-assertion på Windows.
process.exitCode = failed === 0 ? 0 : 1
