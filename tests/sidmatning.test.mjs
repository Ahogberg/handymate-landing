// Facit för sidmätningen (2026-09-17).
//
// VARFÖR DEN FINNS: landing_events hade noll rader någonsin, och bara
// foretagskollen.html anropade /api/event. Följden var att morgonrapporten
// varje dag sa "0 leads" utan att kunna säga om det betydde "ingen besöker
// sajten" eller "folk besöker men fyller inte i". En nolla utan sidvisningar
// är inget svar.
//
// Och rutten var TYST: `if (!URL || !KEY) return res.status(200).end()` —
// en deploy utan nycklar tappade varje händelse och svarade OK. Det är samma
// klass av blindhet som demons återställning låg i en månad.
//
// Beroendefritt, körs med:
//   node tests/sidmatning.test.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const las = p => readFileSync(join(ROOT, p), 'utf8')
const skript = las('sidmatning.js')
const rutt = las('api/event.js')
const sidor = readdirSync(ROOT).filter(f => f.endsWith('.html'))

let fel = 0
const kolla = (villkor, text) => {
  if (villkor) return
  console.error(`✗ ${text}`)
  fel++
}

// ── Varje sida mäts ────────────────────────────────────────────────────
kolla(sidor.length >= 17, `hittade bara ${sidor.length} sidor — förväntade minst 17`)
for (const sida of sidor) {
  const html = las(sida)
  kolla(html.includes('<script src="/sidmatning.js" defer></script>'), `${sida} saknar sidmätningen`)
  // Sist i body: sidans egna skript ska hinna köra först, och en mätning
  // får aldrig blockera renderingen.
  if (html.includes('sidmatning.js')) {
    kolla(html.indexOf('sidmatning.js') < html.lastIndexOf('</body>'), `${sida}: mätningen ligger utanför body`)
    kolla(html.includes('defer'), `${sida}: mätningen är inte defer`)
  }
}

// ── Rutten släpper in eventet ──────────────────────────────────────────
kolla(/TILLATNA_EVENT[\s\S]{0,400}'page_viewed'/.test(rutt), "'page_viewed' står inte i allowlisten")
kolla(skript.includes("event: 'page_viewed'"), 'skriptet skickar inte page_viewed')

// ── Tystnaden är stängd ────────────────────────────────────────────────
// Det här är själva lärdomen: en saknad nyckel måste ge ett fel som syns,
// inte ett 200 som ser ut som att allt fungerar.
const saknasBlock = rutt.slice(rutt.indexOf('if (!SUPABASE_URL || !SUPABASE_KEY)'))
kolla(!/if \(!SUPABASE_URL \|\| !SUPABASE_KEY\) return res\.status\(200\)/.test(rutt),
  'saknad nyckel svarar 200 igen — mätningen kan vara nere utan att någon ser det')
kolla(/if \(!SUPABASE_URL \|\| !SUPABASE_KEY\) \{[\s\S]{0,400}console\.error/.test(rutt),
  'saknad nyckel loggar inget')
kolla(/if \(!SUPABASE_URL \|\| !SUPABASE_KEY\) \{[\s\S]{0,400}status\(503\)/.test(rutt),
  'saknad nyckel svarar inte 503')
// En avvisad eller misslyckad skrivning ska också synas.
kolla(/svar\.ok[\s\S]{0,300}console\.error/.test(rutt), 'en avvisad skrivning loggas inte')
kolla((rutt.match(/status\(502\)/g) || []).length >= 2, 'nätfel och avvisad skrivning ger inte båda 502')

// ── Integritet ─────────────────────────────────────────────────────────
kolla(!/document\.cookie/.test(skript), 'skriptet rör cookies')
kolla(/sessionStorage/.test(skript) && !/localStorage/.test(skript),
  'sessions-id ska bo i sessionStorage, inte localStorage — det ska försvinna med fliken')
// Hela hänvisar-URL:en kan bära sökord och id:n. Bara värdnamnet sparas.
kolla(/new URL\(document\.referrer\)\.hostname/.test(skript), 'hänvisaren plockas inte ner till värdnamn')
kolla(!/referrer:\s*document\.referrer/.test(skript), 'hela hänvisar-URL:en skickas')
kolla(/host !== location\.hostname/.test(skript), 'intern navigering räknas som hänvisning')

// ── Mätning får aldrig märkas ──────────────────────────────────────────
kolla((skript.match(/catch \(e\)/g) || []).length >= 5, 'för få fällor — ett mätfel kan krascha sidan')
kolla(/navigator\.sendBeacon/.test(skript), 'skickar inte via sendBeacon')
kolla(/document\.prerendering/.test(skript), 'förrenderade sidor räknas som besök')

// ── Attribution ────────────────────────────────────────────────────────
for (const nyckel of ['ref', 'entry', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
  kolla(skript.includes(`'${nyckel}'`), `attributionsnyckeln ${nyckel} saknas`)
}
kolla(/if \(v && !attr\[/.test(skript), 'första källan vinner inte — en intern kampanjlänk skriver över partnern')

if (fel) {
  console.error(`\n${fel} fel i sidmätningens facit`)
  process.exit(1)
}
console.log('✓ sidmätningen: alla sidor mäts, rutten är inte tyst, integriteten håller')
