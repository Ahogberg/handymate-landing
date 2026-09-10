// Facit för navets inloggning och knappkontrast (2026-09-10).
//
// Två fynd samma dag, båda på index.html:
//
//   1. Sajten hade INGEN väg in för en befintlig kund. Enda länken till
//      appen var /signup ("Kom igång"). En hantverkare som redan betalar
//      fick leta upp app.handymate.se själv.
//
//   2. "Boka genomgång" i navet ritades med grå text på mörk teal.
//      Kontrastfixen från 2026-09-03 räknade på VIT text — men vit text
//      gällde aldrig: `.nav-links a{color:var(--muted)}` är (0,1,1) i
//      specificitet och slår `.btn-primary{color:#fff}` som är (0,1,0).
//      Resultatet var 1.59:1 i gradientens mörka ände och 1.15:1 i den
//      ljusa. AA kräver 4.5. 1.15:1 är i praktiken osynlig text.
//
// Fynd 2 är lärdomen värd att vakta: en kontraströrelse som bara mäter
// FÄRGVÄRDEN i en CSS-regel bevisar ingenting om regeln aldrig vinner.
// Därför räknar det här facit om kontrasten från de färger som faktiskt
// deklareras för knappen, och kräver dessutom att selektorn är mer
// specifik än nav-links-regeln.
//
// Beroendefritt, körs med:
//   node tests/nav-login.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

let fel = 0
const kolla = (villkor, text) => {
  if (villkor) return
  console.error(`✗ ${text}`)
  fel++
}

// ── WCAG-kontrast, ren matematik ───────────────────────────────────────
function luminans(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h
  const kanaler = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
  const [r, g, b] = kanaler.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function kontrast(a, b) {
  const [x, y] = [luminans(a), luminans(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
// Självprov på matematiken: svart mot vitt är 21:1. Utan detta kan en
// trasig formel få allt nedan att passera.
kolla(Math.abs(kontrast('#000000', '#ffffff') - 21) < 0.01, 'kontrastformeln är fel — svart/vitt gav inte 21:1')

// ── 1. Vägen in ────────────────────────────────────────────────────────
const nav = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>'))
kolla(nav.length > 0, 'hittade inget <nav> i index.html')
kolla(
  /href="https:\/\/app\.handymate\.se\/login"/.test(nav),
  'navet saknar en inloggningslänk till app.handymate.se/login — en befintlig kund har ingen väg in',
)
kolla(/>\s*Logga in\s*</.test(nav), 'inloggningslänken heter inte "Logga in"')

// Mobilregeln döljer allt i navet utom knappen. Undantas inte
// inloggningen är den osynlig på varje telefon — alltså borta för just
// den grupp som behöver den mest.
const doljregel = html.match(/\.nav-links a:not\(([^)]*)\)(:not\(([^)]*)\))?\{display:none\}/)
kolla(doljregel !== null, 'hittade inte mobilregeln som döljer navlänkar')
if (doljregel) {
  kolla(
    doljregel[0].includes('.nav-login'),
    'mobilregeln döljer .nav-login — inloggningen försvinner på telefon',
  )
}
kolla(/class="nav-login"/.test(nav), 'inloggningslänken bär inte klassen .nav-login som mobilregeln undantar')

// Mätt i Chromium: utan den här trimningen gav 375px 18px sidoskroll.
kolla(
  /@media \(max-width:640px\)\{[^}]*\.nav-inner\{[^}]*padding:14px 16px/.test(html.replace(/\s*\n\s*/g, '')),
  'mobiltrimningen av navet saknas — navet blir bredare än skärmen på 375px',
)
kolla(
  /\.nav \.btn-primary\{white-space:nowrap\}/.test(html),
  'navknappen saknar white-space:nowrap och radbryts inuti knappen på telefon',
)

// ── 2. Kontrasten, uträknad från de deklarerade färgerna ───────────────
// Textfärgen måste sättas av en selektor med MINST två klasser, annars
// vinner `.nav-links a` (0,1,1) och hela mätningen är meningslös.
const textregel = html.match(/(\.nav \.btn-primary[^{]*)\{color:(#[0-9a-fA-F]{3,6})\}/)
kolla(
  textregel !== null,
  'ingen regel med både .nav och .btn-primary sätter color — då slår .nav-links a{color:var(--muted)} igenom',
)
if (textregel) {
  const selektor = textregel[1]
  const textfarg = textregel[2]
  kolla(selektor.includes(':hover'), 'hovertillståndet täcks inte — .nav-links a:hover slår tillbaka svart text på mörk teal')

  const gradient = html.match(/\.nav \.btn-primary\{background:linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\)\}/)
  kolla(gradient !== null, 'hittade inte navknappens gradient')
  if (gradient) {
    for (const stopp of [gradient[1], gradient[2]]) {
      const v = kontrast(textfarg, stopp)
      kolla(
        v >= 4.5,
        `navknappen: ${textfarg} mot ${stopp} ger ${v.toFixed(2)}:1 — WCAG AA kräver 4.5 för 15px/500-text`,
      )
    }
  }
}

// Inloggningslänken står på navets egen botten, inte på knappen.
const loginregel = html.match(/\.nav-login\{color:(#[0-9a-fA-F]{6})/)
kolla(loginregel !== null, 'hittade ingen färgregel för .nav-login')
if (loginregel) {
  const v = kontrast(loginregel[1], '#f8fafc')
  kolla(v >= 4.5, `inloggningslänken: ${loginregel[1]} mot navets #f8fafc ger ${v.toFixed(2)}:1 — AA kräver 4.5`)
}

// ── 3. Vägen in ska finnas på VARJE sida, inte bara startsidan ────────
//
// 2026-09-10, andra passet. Tre olika navfamiljer, tre olika lägen:
//
//   demo-familjen (demo, foretagskollen, hemsida, offertgenerator,
//     rot-kalkylator) hade redan "Logga in" — inline på desktop och i
//     hamburgermenyn på telefon. Rörda: inte alls.
//   ai-team-familjen (ai-team, daniel, hanna, karin, lars, lisa, matte,
//     support, integritet) hade ingen inloggning alls, OCH på 375px var det
//     enda synliga i navet logotypen: både .nav-links och .nav-cta är
//     display:none under 768px och det finns ingen hamburgermeny. Noll vägar
//     vidare från headern på telefon, på nio sidor.
//   jamfor.html hade inget nav alls, och hero-knappen pekade tillbaka på
//     startsidan i stället för till appen.
//
// Provet är avsiktligt en LISTA över alla sidor med ett nav, inte de sidor
// som råkar ha en inloggning i dag. En ny sida utan väg in ska falla här.
const ALLA_MED_NAV = [
  'index.html',
  // demo-familjen — inline + hamburgermeny
  'demo.html', 'foretagskollen.html', 'hemsida.html', 'offertgenerator.html', 'rot-kalkylator.html',
  // ai-team-familjen — .nav-actions med login + CTA i alla bredder
  'ai-team.html', 'daniel.html', 'hanna.html', 'karin.html', 'lars.html',
  'lisa.html', 'matte.html', 'support.html', 'integritet.html',
  // egen header, egna hm-prefix
  'jamfor.html',
]

for (const sida of ALLA_MED_NAV) {
  const src = readFileSync(join(ROOT, sida), 'utf8')
  kolla(
    src.includes('https://app.handymate.se/login'),
    `${sida}: ingen inloggningslänk — en befintlig kund som landar här har ingen väg in`,
  )
  kolla(/>\s*Logga in\s*</.test(src), `${sida}: inloggningslänken heter inte "Logga in"`)
}

// partners.html är medvetet utanför: dess nav vänder sig till säljpartners
// och bär Partner-login mot /partners/login. En kundinloggning där skulle
// vara fel målgrupp, inte en saknad väg in.
kolla(
  readFileSync(join(ROOT, 'partners.html'), 'utf8').includes('/partners/login'),
  'partners.html har tappat sin Partner-login',
)

// ── 4. ai-team-familjen: både login OCH CTA måste synas på telefon ────
// Det var inte inloggningen som saknades värst där, utan allt. Regeln som
// gömde CTA:n under 768px är borttagen; kommer den tillbaka är headern tom
// på telefon igen.
const AI_FAMILJEN = ['ai-team.html', 'daniel.html', 'hanna.html', 'karin.html', 'lars.html',
  'lisa.html', 'matte.html', 'support.html', 'integritet.html']
for (const sida of AI_FAMILJEN) {
  const src = readFileSync(join(ROOT, sida), 'utf8')
  kolla(
    !/\.nav-cta \{ display: none/.test(src),
    `${sida}: .nav-cta är display:none igen — headern blir tom på telefon`,
  )
  kolla(
    /\.nav-actions \{ display: flex/.test(src),
    `${sida}: saknar .nav-actions-gruppen som håller login + CTA`,
  )
  // Ljus text på det mörka navet: #cbd5e1 mot #0f172a ger 12.02:1.
  const m = src.match(/\.nav-login \{ color: (#[0-9a-fA-F]{6})/)
  kolla(m !== null, `${sida}: .nav-login saknar en uttrycklig färg`)
  if (m) {
    const v = kontrast(m[1], '#0f172a')
    kolla(v >= 4.5, `${sida}: .nav-login ${m[1]} mot mörka navet ger ${v.toFixed(2)}:1 — AA kräver 4.5`)
  }
}

// ── 5. Inga länkar som leder tillbaka till sig själva ─────────────────
// jamfors hero-knapp sa "Kom igång med Handymate" och pekade på
// https://handymate.se — alltså tillbaka till startsidan, inte till appen.
// En CTA utan mål är värre än ingen CTA.
for (const sida of ALLA_MED_NAV) {
  const src = readFileSync(join(ROOT, sida), 'utf8')
  const doda = [...src.matchAll(/<a[^>]*href="https:\/\/handymate\.se\/?"[^>]*>([^<]*)<\/a>/g)]
    .map(m => m[1].trim())
    .filter(t => /kom ig|logga in|prova|skapa konto/i.test(t))
  kolla(
    doda.length === 0,
    `${sida}: CTA:n "${doda[0]}" pekar på handymate.se i stället för appen`,
  )
}

if (fel > 0) {
  console.error(`\n${fel} fel`)
  process.exit(1)
}
console.log(`✓ nav-login: vägen in finns på ${ALLA_MED_NAV.length} sidor, syns på telefon, och knappen klarar AA`)
