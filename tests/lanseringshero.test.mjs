// Facit för nedräkningsheroet på index.html (2026-09-03). Beroendefritt:
//   node tests/lanseringshero.test.mjs
//
// Heroet flippar av sig själv till live-läget vid lanseringen. Facit vaktar
// de egenskaper som gör det ärligt och underhållsfritt:
//   1. datumet står på ETT ställe — ingen ska behöva minnas den 14:e
//   2. inget utskrivet klockslag i heroet (Andreas: timern räcker)
//   3. kvittot sätts först när servern svarat ok
//   4. copyn påstår aldrig att en agent gör något den inte gör
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
// Bara heroet — sidans tidslinje längre ner har en legitim post "06:00
// Morgonrapport skickad" som inte har med lanseringen att göra.
const hero = src.slice(src.indexOf('<section class="lansering"'), src.indexOf('</section>', src.indexOf('<section class="lansering"')))
// Det ORDINARIE heroet ska vara orört — panelen ligger ovanpå, den ersätter
// ingenting. Det är hela poängen: den 14 september raderas panelen och sidan
// är exakt som förut.
const ordinarieHero = src.slice(src.indexOf('<header class="hero">'), src.indexOf('</header>') + 9)

let gröna = 0
const röda = []
function ok(namn, villkor) {
  if (villkor) { gröna++; console.log(`  ✓ ${namn}`) }
  else { röda.push(namn); console.log(`  ✗ ${namn}`) }
}

console.log('index.html — nedräkningsheroet')

ok('lanseringsdatumet står på ETT ställe i filen',
  (src.match(/2026-09-14T09:00:00\+02:00/g) || []).length === 1)
ok('inget utskrivet klockslag i heroet — timern räcker', !/\d{2}:\d{2}/.test(hero))
ok('ingen "LANSERING ·"-rad kvar', !hero.includes('LANSERING ·'))
ok('inget utskrivet lanseringsdatum i heroet', !/14 september/i.test(hero))

ok('nedräkningen har alla fyra enheter',
  ['ndDagar', 'ndTimmar', 'ndMinuter', 'ndSekunder'].every(id => hero.includes(id)))
ok('primär CTA går till Företagskollen, inte en ny kalkyl', hero.includes('href="/foretagskollen"'))
ok('panelen tar bort SIG SJÄLV vid lanseringen, ersätter ingenting',
  src.includes('function doljPanelen()') && src.includes('panel.remove()'))
ok('det ordinarie heroet finns kvar och är orört', ordinarieHero.includes('id="missionCard"'))
ok('uppdragskortet lever', src.includes('id="missionBar"'))
ok('teamet är gråskalat i panelen', src.includes('filter:grayscale(1)'))
ok('panelen fyller första skärmen med svh, inte bara vh',
  src.includes('min-height:calc(100svh - 73px)'))
ok('skrollpil pekar vidare ner i sidan', hero.includes('lansering-vidare'))

// Väntelistan
ok('väntelistan skickar source nedrakning', hero.includes('id="vantelistaEpost"') && src.includes("source: 'nedrakning'"))
ok('kvittot sätts efter res.ok, aldrig optimistiskt',
  /if \(!res\.ok\) throw/.test(src) && /then\(function \(res\) \{[\s\S]{0,300}Tack!/.test(src))
ok('misslyckat anrop visar fel, aldrig ett tack',
  /catch\(function \(\) \{[\s\S]{0,300}gick inte att spara/.test(src) &&
  !/catch\(function \(\) \{[\s\S]{0,300}Tack!/.test(src))
ok('honeypot finns och är dolt med offset, inte display:none',
  hero.includes('vantelistaWebsite') &&
  /\.vantelista-hp\{[^}]*left:-9999px/.test(src) &&
  !/\.vantelista-hp\{[^}]*display:\s*none/.test(src))

// Ärligheten i copyn — samma regel som i produkten.
ok('Lisa fångar, hon svarar inte i telefon',
  hero.includes('Fångar samtalen du missar') &&
  !/svarar i telefon|ringer tillbaka|pratar med kunden/i.test(hero))
ok('inget löfte om autonom kundkontakt i panelen',
  !/sköter allt åt dig|utan att du behöver göra något|svarar åt dig/i.test(hero))

// Det cta.test.mjs kräver ska överleva heroets omskrivning.
// Antalet frågor i heroets hint måste stämma med Företagskollen. Jag
// skrev först "Sju" på ren gissning — facit läser nu det faktiska antalet
// ur foretagskollen.html så påståendet inte kan glida från källan.
const fragorSrc = readFileSync(join(__dirname, '..', 'foretagskollen.html'), 'utf8')
const fragorBlock = fragorSrc.slice(fragorSrc.indexOf('var FRAGOR = ['), fragorSrc.indexOf('var FRAGOR = [') + 9000)
const antalFragor = (fragorBlock.match(/\bid:\s*'[a-z_]+'/g) || []).length
const raknord = { 7: 'Sju', 8: 'Åtta', 9: 'Nio', 10: 'Tio' }[antalFragor]
ok(`heroet säger rätt antal frågor (${antalFragor} = ${raknord})`,
  !!raknord && hero.includes(`${raknord} frågor`))

// ── Tillgänglighet och hierarki (2026-09-03, Andreas granskning) ──
// Vit text på gradientens ljusa ände gav 2.49:1 i navet. WCAG AA kräver
// 4.5 för normal text; knappen är 15px/500 och får inte den lägre
// 3.0-gränsen för stor text.
ok('navets knapp har egen, mörkare gradient som klarar AA',
  src.includes('.nav .btn-primary{background:linear-gradient(135deg,#115E59,#0f766e)}'))

// .hero-grid sitter på samma element som .container och skrev över hela
// padding-shorthanden, inklusive .container{padding:0 24px}. Innehållet gick
// kant i kant. Långsidorna måste sättas var för sig.
ok('heroets sidpadding överlever — ingen padding-shorthand i .hero-grid',
  !/\.hero-grid\{[^}]*[^-]padding:/.test(src) &&
  src.includes('.hero-grid{display:grid;grid-template-columns:1.05fr 0.95fr;gap:72px;align-items:center;padding-top:96px'))
ok('samma sak i 1024px-brytpunkten',
  !/@media \(max-width:1024px\)\{\.hero-grid\{[^}]*[^-]padding:/.test(src))

// EN primär åtgärd. Väntelisteknappen hade samma teal-gradient, höjd och
// vikt som primärknappen — två likadana knappar läses som jämbördiga val.
ok('väntelisteknappen är en dämpad kontur, inte en andra primärknapp',
  /\.vantelista-rad button\{[^}]*background:rgba\(255,255,255,0\.08\)/.test(src) &&
  !/\.vantelista-rad button\{[^}]*linear-gradient/.test(src))
ok('väntelistan har en egen inledning som ramar in den som alternativet',
  hero.includes('Hinner du inte nu?'))

ok('bokningslänken finns kvar på sidan', src.includes('Boka en genomgång'))
ok('signup-länken finns kvar på sidan', src.includes('https://app.handymate.se/signup'))

console.log(`\n${gröna} gröna, ${röda.length} röda`)
if (röda.length) { console.log('MISSLYCKADES:\n  ' + röda.join('\n  ')); process.exit(1) }
