// Företagskollen — scoring-facit. Beroendefritt, körs med:
//   node tests/scoring.test.mjs
// Samma mönster som tests/ssrf.test.mjs: inga ramverk, process.exit(1) vid rött.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { score, VERSION } = require('../foretagskollen-scoring.js')

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
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': fick ' + JSON.stringify(a) + ', väntade ' + JSON.stringify(b))
}
function ok(v, msg) { if (!v) throw new Error(msg || 'ok: falskt värde') }

// Mockupens exempel-persona: VVS 5–9, röstbrevlåda, ~7 offerter med
// uppföljning "när någon kommer ihåg det", sen fakturering, ÄTA ok.
const MOCKUP_SVAR = {
  bransch: 'vvs', storlek: '5-9', samtal: 'rostbrevlada',
  offerter_man: '5-9', uppfoljning: 'nar_nagon_kommer_ihag',
  ata: 'direkt', fakturering: 'flera_veckor', agarberoende: 'jag_koordinerar',
}

const BASTA_SVAR = {
  bransch: 'el', storlek: '1-4', samtal: 'kontoret',
  offerter_man: 'nastan_inga', uppfoljning: 'nastan_alla',
  ata: 'direkt', fakturering: 'direkt', agarberoende: 'rullar',
}

const SAMSTA_SVAR = {
  bransch: 'bygg', storlek: '10-20', samtal: 'rostbrevlada',
  offerter_man: '10+', uppfoljning: 'kunden_aterkommer',
  ata: 'ofta_inte', fakturering: 'varierar', agarberoende: 'allt_genom_mig',
}

console.log('Företagskollen scoring v' + VERSION)

console.log('\nDeterminism:')
t('samma svar → exakt samma resultat', () => {
  eq(JSON.stringify(score(MOCKUP_SVAR)), JSON.stringify(score(MOCKUP_SVAR)))
})

console.log('\nKalibrering mot mockupen (frame 05):')
t('läckage: missade samtal ≈ 18 000 kr (2 förlorade jobb à 9 000)', () => {
  const r = score(MOCKUP_SVAR)
  const rad = r.leakage.rows.find(x => x.omrade === 'samtal')
  eq(rad.kr, 18000)
})
t('läckage: offerter utan uppföljning ≈ 9 000 kr', () => {
  const rad = score(MOCKUP_SVAR).leakage.rows.find(x => x.omrade === 'offert')
  eq(rad.kr, 9000)
})
t('läckage: sena betalningar ≈ 4 000 kr', () => {
  const rad = score(MOCKUP_SVAR).leakage.rows.find(x => x.omrade === 'faktura')
  eq(rad.kr, 4000)
})
t('läckage totalt = 31 000 kr', () => {
  eq(score(MOCKUP_SVAR).leakage.total, 31000)
})
t('admin: offertskrivande ≈ 10 tim, fakturor 6 tim, samtal 8 tim → 24 tim', () => {
  const r = score(MOCKUP_SVAR)
  const get = o => r.adminHours.rows.find(x => x.omrade === o).tim
  eq(get('offert'), 10); eq(get('faktura'), 6); eq(get('samtal'), 8)
  eq(r.adminHours.total, 24)
})
t('profil: "VVS-firma" + "5–9 anställda"', () => {
  const p = score(MOCKUP_SVAR).profil
  eq(p.bransch, 'VVS-firma'); eq(p.storlek, '5–9 anställda')
})

console.log('\nGränsfall:')
t('bästa svaren → noll läckage, inga påhittade rader', () => {
  const r = score(BASTA_SVAR)
  eq(r.leakage.total, 0)
  eq(r.leakage.rows.length, 0)
})
t('bästa svaren → temperatur kall', () => {
  eq(score(BASTA_SVAR).temperature, 'kall')
})
t('sämsta svaren → clampat under taken (≤120 000 kr, ≤80 tim)', () => {
  const r = score(SAMSTA_SVAR)
  ok(r.leakage.total <= 120000, 'läckage över tak: ' + r.leakage.total)
  ok(r.adminHours.total <= 80, 'timmar över tak: ' + r.adminHours.total)
  ok(r.leakage.total > 0, 'sämsta svaren borde läcka')
})
t('sämsta svaren → temperatur het', () => {
  eq(score(SAMSTA_SVAR).temperature, 'het')
})
t('inga negativa värden någonstans', () => {
  for (const svar of [MOCKUP_SVAR, BASTA_SVAR, SAMSTA_SVAR]) {
    const r = score(svar)
    for (const rad of r.leakage.rows) ok(rad.kr >= 0)
    for (const rad of r.adminHours.rows) ok(rad.tim >= 0)
  }
})

console.log('\nRobusthet (kastar aldrig):')
t('tomt objekt', () => { ok(score({}).leakage.total === 0) })
t('null/undefined/skräp', () => {
  ok(score(null)); ok(score(undefined)); ok(score('skräp')); ok(score(42))
})
t('okända svarsnycklar ignoreras', () => {
  const r = score({ bransch: 'rymdskepp', samtal: 'telepati', ata: 'xyz' })
  eq(r.leakage.total, 0)
  eq(r.profil.bransch, 'Hantverksfirma') // fallback annat
})

console.log('\nPersonalisering (fyndens ordning):')
t('offerttungt → Daniel först', () => {
  const r = score({ ...BASTA_SVAR, offerter_man: '10+', uppfoljning: 'kunden_aterkommer' })
  eq(r.findings[0].agent, 'daniel')
})
t('fakturatungt → Karin först', () => {
  const r = score({ ...BASTA_SVAR, fakturering: 'varierar' })
  eq(r.findings[0].agent, 'karin')
})
t('samtalstungt → Lisa först', () => {
  const r = score({ ...BASTA_SVAR, samtal: 'rostbrevlada' })
  eq(r.findings[0].agent, 'lisa')
})
t('ÄTA-tungt → Lars först', () => {
  const r = score({ ...BASTA_SVAR, ata: 'ofta_inte' })
  eq(r.findings[0].agent, 'lars')
})
t('alltid exakt 3 fynd', () => {
  for (const svar of [MOCKUP_SVAR, BASTA_SVAR, SAMSTA_SVAR, {}]) {
    eq(score(svar).findings.length, 3)
  }
})
t('tie-break är stabil: allt lika → fast ordning lisa, daniel, karin, lars', () => {
  const r = score(SAMSTA_SVAR) // lisa 3, daniel 3 (capped), karin 3, lars 3
  eq(r.findings.map(f => f.agent).join(','), 'lisa,daniel,karin,lars'.split(',').slice(0, 3).join(','))
})
t('"nästan inga offerter" nollar Daniel oavsett uppföljningssvar', () => {
  const r = score({ ...BASTA_SVAR, offerter_man: 'nastan_inga', uppfoljning: 'kunden_aterkommer' })
  const daniel = [...r.findings].find(f => f.agent === 'daniel')
  if (daniel) eq(daniel.severity, 0)
})

console.log('\nFyndtexter citerar svaren:')
t('röstbrevlåde-svaret citeras i Lisas fynd', () => {
  const r = score(MOCKUP_SVAR)
  const lisa = r.findings.find(f => f.agent === 'lisa')
  ok(lisa.fynd.indexOf('röstbrevlådan') !== -1, 'citat saknas: ' + lisa.fynd)
})
t('uppföljningssvaret citeras i Daniels fynd', () => {
  const r = score(MOCKUP_SVAR)
  const d = r.findings.find(f => f.agent === 'daniel')
  ok(d.fynd.indexOf('när någon kommer ihåg det') !== -1, 'citat saknas: ' + d.fynd)
})

console.log('\n' + pass + ' gröna, ' + fail + ' röda')
if (fail > 0) process.exit(1)
