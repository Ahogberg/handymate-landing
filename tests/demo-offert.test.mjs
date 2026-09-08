// Facit för demo-offerten på startsidan (yta 9, 2026-09-08). Beroendefritt:
//   node tests/demo-offert.test.mjs
//
// Blocket "Skicka en offert till dig själv" skickar ett RIKTIGT SMS via
// app.handymate.se. Det här facit låser det som inte får glida:
//  - kvittot "Kolla mobilen" sätts först när servern svarat OK
//  - leaden sparas bara med kryssrutan i, och aldrig som villkor för kvittot
//  - pollningen är var femte sekund i tio minuter, inte tätare
//  - siffrorna i telefonattrappen är samma som i dashboardens demo-quote-data
//  - CTA:n i efteråt-vyn är den kanoniska bokningslänken (tests/cta.test.mjs)
//  - api/save-lead.js godtar e-postlösa leads BARA från 'demo-offert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const saveLead = readFileSync(join(ROOT, 'api', 'save-lead.js'), 'utf8')

const BOOKING_HREF = 'mailto:andreas@handymate.se?subject=Boka%20en%20genomg%C3%A5ng%20av%20Handymate&body=Hej!%0D%0A%0D%0AJag%20vill%20boka%20en%2020-minuters%20genomg%C3%A5ng.%0D%0A%0D%0AF%C3%B6retag%3A%20%0D%0ATelefon%3A%20%0D%0AF%C3%B6rslag%20p%C3%A5%20tider%3A%20'

let gröna = 0
const röda = []
function ok(namn, villkor) {
  if (villkor) { gröna++; console.log(`  ✓ ${namn}`) }
  else { röda.push(namn); console.log(`  ✗ ${namn}`) }
}

// Blocket och dess skript
const sektionStart = html.indexOf('<section id="demo-offert"')
const sektionSlut = html.indexOf('</section>', sektionStart)
const sektion = html.slice(sektionStart, sektionSlut)
const skriptStart = html.indexOf('// ══ Demo-offerten')
const skript = html.slice(skriptStart, html.indexOf('</script>', skriptStart))

console.log('index.html — demo-offerten')
ok('sektionen #demo-offert finns', sektionStart > 0)
ok('ligger före "Så räknar vi" (blocket ÄR beviset)', sektionStart < html.indexOf('<section id="bevis"'))
ok('rubrik och ingress ur designen',
  sektion.includes('Skicka en offert till dig själv.') &&
  sektion.includes('Du får den som din kund får den — i mobilen, med ROT-avdraget uträknat och en knapp.'))
ok('mikrotexten lovar inget mer än ett SMS',
  sektion.includes('Ett SMS, ingen uppföljning. Offerten är på låtsas — knappen är på riktigt.'))
ok('tre fält: namn, mobil, firma (valfritt)',
  sektion.includes('id="demoNamn"') && sektion.includes('id="demoTelefon"') && sektion.includes('id="demoFirma"') &&
  sektion.includes('(valfritt)'))
ok('kryssrutan är av som standard', /<input type="checkbox" id="demoRing">/.test(sektion))
ok('knappen är avstängd tills fälten är giltiga', /id="demoKnapp" disabled/.test(sektion))
ok('honeypot-fältet finns', sektion.includes('id="demoWebsite"') && sektion.includes('vantelista-hp'))
ok('kvittot säger var SMS:et kom ifrån',
  sektion.includes('Kolla mobilen.') &&
  sektion.includes('SMS:et kom från Ekström Bygg AB, inte från oss — det är så din kund får det.'))
ok('"Skicka igen · N kvar i dag" finns', sektion.includes('id="demoIgen"') && skript.includes("' kvar i dag'"))
ok('telefonens siffror = demo-quote-data (62 000 / 15 500 / 77 500 / −13 500 / 64 000)',
  ['62 000 kr', '15 500 kr', '77 500 kr', '−13 500 kr', '64 000 kr', '8 000 kr', '18 000 kr', '26 000 kr', '10 000 kr']
    .every(s => sektion.includes(s)))
ok('ROT står som preliminärt', sektion.includes('preliminärt'))
ok('telefonen bär Ekströms färg, inte teal', html.includes('.demo-biz{') && /\.demo-biz\{[^}]*#F59E0B/.test(html))
ok('efteråt-vyn: raderna byggs bara när tidsstämpeln finns',
  /if \(s\.accepted_at\) eventLista\.appendChild/.test(skript) &&
  /if \(s\.project_created_at\) eventLista\.appendChild/.test(skript) &&
  /if \(s\.deal_won_at\) eventLista\.appendChild/.test(skript))
ok('efteråt-vyns avslut ur designen', sektion.includes('Det här är vad din arbetsledare slipper göra på kvällen.'))
ok('"Boka en genomgång" är den kanoniska bokningslänken', sektion.includes(`href="${BOOKING_HREF}">Boka en genomgång`))
ok('"Se priserna" pekar på #pris', /href="#pris">Se priserna/.test(sektion))
ok('inga emojis som ikoner', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sektion))
ok('ingen BankID-text', !/bankid/i.test(sektion))

console.log('\nskriptet — riktigt SMS, riktigt kvitto')
ok('POST:ar till app.handymate.se/api/public/demo-quote',
  skript.includes("'https://app.handymate.se'") && skript.includes("'/api/public/demo-quote'"))
ok('läser statusen: kvittot sätts först när servern svarat OK med token',
  /if \(!r\.res\.ok \|\| !json\.ok \|\| !json\.token\)[\s\S]{0,900}return;\s*\}\s*token = json\.token/.test(skript))
ok('serverns feltext visas ordagrant (error + field)',
  skript.includes('json.error') && skript.includes("json.field === 'phone'"))
ok('nätverksfel ger designens text, inte ett kvitto',
  skript.includes('Vi kunde inte skicka just nu. Prova igen om en stund eller Boka en genomgång.'))
ok('pollning var 5:e sekund i max 10 minuter',
  skript.includes('POLL_MS = 5000') && skript.includes('POLL_MAX_MS = 600000'))
ok('statusen hämtas från /status', skript.includes("'/status'"))
ok('?demo=TOKEN öppnar efteråt-vyn', skript.includes(".get('demo')") && skript.includes('visaEfterat(s)'))
ok('leaden sparas bara med kryssrutan i', /if \(!omskick && ring\.checked\) sparaLead\(data\)/.test(skript))
ok('leaden sparas efter kvittot och utan att kunna fälla det',
  skript.indexOf('visaSkickat();') < skript.indexOf('sparaLead(data)') &&
  /fetch\('\/api\/save-lead'[\s\S]{0,400}\.catch\(function \(\) \{\}\)/.test(skript))
ok("lead-källan är 'demo-offert' och skickar namn + mobil, ingen e-post",
  /source: 'demo-offert'/.test(skript) && /name: data\.name/.test(skript) && !/email:/.test(skript))
ok('honeypot skickas med leaden', /website: honeypot\.value/.test(skript))

console.log('\napi/save-lead.js — e-postlös lead bara från demo-offerten')
ok("'demo-offert' är en tillåten källa", /TILLATNA_KALLOR = \[[^\]]*'demo-offert'/.test(saveLead))
ok('e-postlösa leads bara från KALLOR_UTAN_EPOST', /KALLOR_UTAN_EPOST = \['demo-offert'\]/.test(saveLead))
ok('utan e-post krävs mobilnummer', /if \(!email && !\(KALLOR_UTAN_EPOST\.includes\(source\) && harMobil\)\)/.test(saveLead))
ok('angiven e-post valideras fortfarande', /if \(email && !EMAIL_RE\.test\(email\)\)/.test(saveLead))
ok('namnet persisteras', /body: JSON\.stringify\(\{\s*email,\s*name,/.test(saveLead))

console.log(`\n${gröna} gröna, ${röda.length} röda`)
if (röda.length) { console.log('MISSLYCKADES:\n  ' + röda.join('\n  ')); process.exit(1) }
