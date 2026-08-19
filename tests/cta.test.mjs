// CTA-omläggningens facit (2026-08-19) — demo-först, self-serve kvar.
// Beroendefritt, körs med:
//   node tests/cta.test.mjs
// Samma mönster som tests/scoring.test.mjs och tests/ssrf.test.mjs: inga
// ramverk, process.exit(1) vid rött.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ═══ Facit-låst sträng — EXAKT denna, se index.html-heroets Calendly-
// bytesprocedur (HTML-kommentar) om den någonsin ska ersättas. ═══
const BOOKING_HREF =
  'mailto:andreas@handymate.se?subject=Boka%20en%20genomg%C3%A5ng%20av%20Handymate&body=Hej!%0D%0A%0D%0AJag%20vill%20boka%20en%2020-minuters%20genomg%C3%A5ng.%0D%0A%0D%0AF%C3%B6retag%3A%20%0D%0ATelefon%3A%20%0D%0AF%C3%B6rslag%20p%C3%A5%20tider%3A%20'

// Sidorna som ska ha bokningslänken (index + alla syskonsidor som fick en
// boknings-CTA i etappen). integritet.html och partners.html är medvetet
// utanför — de har ingen boknings-CTA.
const PAGES_WITH_BOOKING = [
  'index.html',
  'foretagskollen.html',
  'jamfor.html',
  'demo.html',
  'offertgenerator.html',
  'rot-kalkylator.html',
  'hemsida.html',
  'ai-team.html',
  'matte.html',
  'lisa.html',
  'karin.html',
  'daniel.html',
  'hanna.html',
  'lars.html',
]

let pass = 0
let fail = 0
function t(namn, fn) {
  try {
    fn()
    pass++
    console.log('  ✓ ' + namn)
  } catch (e) {
    fail++
    console.error('  ✗ ' + namn + '\n    ' + e.message)
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'ok: falskt värde') }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': fick ' + JSON.stringify(a) + ', väntade ' + JSON.stringify(b))
}

const allHtmlFiles = readdirSync(ROOT).filter(f => f.endsWith('.html'))
const contents = {}
for (const f of allHtmlFiles) contents[f] = readFileSync(join(ROOT, f), 'utf8')

console.log('CTA-facit — ' + allHtmlFiles.length + ' HTML-filer hittade i repo-roten')

console.log('\nKanoniska bokningslänken förekommer där den ska:')
for (const page of PAGES_WITH_BOOKING) {
  t(page + ' innehåller den kanoniska bokningshrefen minst 1 gång', () => {
    ok(contents[page] !== undefined, 'filen saknas: ' + page)
    const count = contents[page].split(BOOKING_HREF).length - 1
    ok(count >= 1, 'hittade ' + count + ' träffar, väntade ≥1')
  })
}

console.log('\n"Boka en genomgång" syns som text på varje sida med hrefen:')
for (const page of PAGES_WITH_BOOKING) {
  t(page + ' innehåller texten "Boka en genomgång"', () => {
    ok(contents[page].indexOf('Boka en genomgång') !== -1, 'texten saknas i ' + page)
  })
}

console.log('\nEn-sträng-principen — ingen annan mailto-variant med "genomg" i subject:')
for (const file of allHtmlFiles) {
  t(file + ' har inga avvikande genomgång-mailto-varianter', () => {
    const html = contents[file]
    // Fångar både href="mailto:..." (HTML-attribut, dubbelfnutt) och
    // JS-strängar med enkelfnutt (foretagskollen.html sätter BOOKING_URL
    // via en JS-variabel) — stoppar vid vilken fnutt/tagg som helst.
    const matches = html.match(/mailto:[^"'<>]+/g) || []
    for (const m of matches) {
      if (m.toLowerCase().includes('genomg')) {
        eq(m, BOOKING_HREF, 'avvikande genomgång-mailto i ' + file)
      }
    }
  })
}

console.log('\nSelf-serve lever kvar:')
t('index.html länkar fortfarande till https://app.handymate.se/signup', () => {
  ok(contents['index.html'].indexOf('https://app.handymate.se/signup') !== -1, 'signup-länken saknas på index.html')
})

console.log('\n' + pass + ' gröna, ' + fail + ' röda')
if (fail > 0) process.exit(1)
