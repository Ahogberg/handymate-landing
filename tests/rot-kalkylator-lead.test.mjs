// Facit för väntelistan på /rot-kalkylator (2026-09-03). Beroendefritt:
//   node tests/rot-kalkylator-lead.test.mjs
//
// Sidan räknade ut ett ROT-avdrag åt besökaren och lät hen sedan gå utan
// spår — den enda av sajtens lead magnets som inte anropade något API alls.
// Facit vaktar de tre egenskaper som gör fångsten ärlig:
//   1. uträkningen är gratis och gatas aldrig av adressen
//   2. kvittot sätts först när servern svarat ok
//   3. källan är rot-kalkylator, så du ser vilken yta som faktiskt drar
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, '..', 'rot-kalkylator.html'), 'utf8')

let gröna = 0
const röda = []
function ok(namn, villkor) {
  if (villkor) { gröna++; console.log(`  ✓ ${namn}`) }
  else { röda.push(namn); console.log(`  ✗ ${namn}`) }
}

console.log('rot-kalkylator.html — fångar den adressen, och ärligt?')

ok('anropar /api/save-lead', src.includes("'/api/save-lead'"))
ok('källan är rot-kalkylator', src.includes("source: 'rot-kalkylator'"))
ok('väntelistan ligger EFTER resultatkortet i dokumentet',
  src.indexOf('id="resultAmount"') < src.indexOf('id="vantelista"'))
ok('resultatet gatas aldrig — inget i uträkningen kräver e-post',
  !/function calculate\(\)[\s\S]{0,600}vantelistaEpost/.test(src))

// Kärnan: kvittot får bara sättas i then-grenen efter res.ok.
ok('kvittot sätts efter res.ok, aldrig optimistiskt',
  /if \(!res\.ok\) throw/.test(src) &&
  /then\(function \(res\) \{[\s\S]{0,400}Tack!/.test(src))
ok('misslyckat anrop visar fel, aldrig ett tack',
  /catch\(function \(\) \{[\s\S]{0,300}gick inte att spara/.test(src) &&
  !/catch\(function \(\) \{[\s\S]{0,300}Tack!/.test(src))
ok('knappen återaktiveras vid fel så man kan försöka igen',
  /catch\(function \(\) \{[\s\S]{0,200}knapp\.disabled = false/.test(src))

ok('honeypot-fält finns och skickas med', src.includes('vantelistaWebsite') && src.includes('website: honeypot'))
// Bara SJÄLVA CSS-regeln får granskas. Ett tidigare, bredare uttryck
// matchade ända ner i markupen och fastnade på svarsradens legitima
// style="display:none;" — ett falskt rött.
const hpRegel = (src.match(/\.vantelista-hp\s*\{[^}]*\}/) || [''])[0]
ok('honeypot är dolt utan display:none (bottar hoppar över display:none)',
  hpRegel.includes('left: -9999px') && !/display:\s*none/.test(hpRegel))
ok('e-postregex på klienten', src.includes('[^\\s@]+@[^\\s@]+'))
ok('uträkningen följer med i payload — du ringer inte bara en adress',
  src.includes('arbetskostnad:') && src.includes('avdrag:'))
ok('telefon är frivillig', src.includes('Telefon (frivilligt)'))

// Datumtexten ska flippa av sig själv — ingen ska behöva minnas den 14:e.
ok('lanseringsdatumet står på ETT ställe', (src.match(/2026-09-14T09:00:00/g) || []).length === 1)
ok('texten byts automatiskt efter lanseringen', src.includes('foreLansering()'))

console.log(`\n${gröna} gröna, ${röda.length} röda`)
if (röda.length) { console.log('MISSLYCKADES:\n  ' + röda.join('\n  ')); process.exit(1) }
