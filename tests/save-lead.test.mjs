// Facit för api/save-lead.js (2026-09-03). Beroendefritt, körs med:
//   node tests/save-lead.test.mjs
// Samma mönster som tests/cta.test.mjs och tests/scoring.test.mjs.
//
// Bakgrunden: den tidigare versionen svalde varje fel och returnerade alltid
// success. Supabase kunde svara 401 och besökaren fick ändå ett kvitto — en
// trasig skrivning gick inte att skilja från en lyckad. landing_leads var tom
// och ingen kunde säga om det berodde på uteblivna besökare eller på att varje
// adress försvunnit. Det här facit finns för att svaret aldrig ska bli oklart
// igen.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const src = readFileSync(join(ROOT, 'api', 'save-lead.js'), 'utf8')
// Filens toppkommentar CITERAR den gamla trasiga koden ("catch { }") som
// dokumentation av vad som lagades. Den ska stå kvar — så kodkontroller
// nedan körs mot källan UTAN kommentarer, annars fäller dokumentationen
// testet den finns för att förklara.
const kod = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

let gröna = 0
const röda = []
function ok(namn, villkor) {
  if (villkor) { gröna++; console.log(`  ✓ ${namn}`) }
  else { röda.push(namn); console.log(`  ✗ ${namn}`) }
}

console.log('api/save-lead.js — sparar den, eller ljuger den?')

ok('läser svarsstatusen från Supabase', src.includes('dbRes.ok'))
ok('en misslyckad insert ger 500, inte success', /if \(!dbRes\.ok\)[\s\S]{0,200}status\(500\)/.test(src))
ok('ett kastat fel ger 500, inte ett tyst success', /catch[\s\S]{0,200}status\(500\)/.test(src))
ok('saknade miljövariabler ger 500 — vi låtsas aldrig ha sparat',
  /if \(!SUPABASE_URL \|\| !SUPABASE_KEY\)[\s\S]{0,200}status\(500\)/.test(src))
ok('inget tomt catch-block sväljer felet',
  !/catch\s*(\([^)]*\))?\s*\{\s*(\/\*[\s\S]*?\*\/)?\s*\}/.test(kod))

ok('honeypot-fältet website finns', src.includes('body.website'))
ok('honeypot returnerar innan någon skrivning',
  src.indexOf('body.website') < src.indexOf('rest/v1/landing_leads'))
ok('rate limit per IP', src.includes('rateLimited(') && src.includes('status(429)'))
ok('e-postregex, inte includes(\'@\')', src.includes('EMAIL_RE') && !src.includes("includes('@')"))
ok('ogiltig e-post ger 400', /EMAIL_RE\.test\(email\)[\s\S]{0,120}status\(400\)/.test(src))
ok('längdtak på det som persisteras', src.includes('klipp('))
ok('payload storleksbegränsas', src.includes('20_000') || src.includes('20000'))
ok('okänd source blir "okand", inte tyst standardvärde',
  src.includes('TILLATNA_KALLOR') && src.includes("'okand'"))
ok('skriver till landing_leads', src.includes('rest/v1/landing_leads'))
ok('service-nyckeln används, aldrig en publik nyckel',
  src.includes('SUPABASE_SERVICE_KEY') && !src.includes('ANON_KEY'))

console.log(`\n${gröna} gröna, ${röda.length} röda`)
if (röda.length) { console.log('MISSLYCKADES:\n  ' + röda.join('\n  ')); process.exit(1) }
