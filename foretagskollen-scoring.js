/*
 * Företagskollen — deterministisk beräkningsmodell (V1, 2026-08-11).
 *
 * INGEN AI här. Svarskombinationer → försiktiga branschkonstanter →
 * indikativa intervall. Samma indata ger ALLTID samma utdata — det är
 * hela poängen (och testbart i tests/scoring.test.mjs).
 *
 * Ärlighetsregler (speglar dashboardens Värdekvitto-lag):
 *  - Uppskattade kronor framställs ALDRIG som bekräftat värde.
 *    Presentationen använder "≈" + källrad + disclaimer.
 *  - Bara svar som faktiskt indikerar läckage skapar en läckagerad —
 *    bra svar ger noll, inte ett påhittat minimum.
 *  - Allt clampas: inga omöjliga tal oavsett indata.
 *
 * Filen är UMD-lik: laddas av foretagskollen.html via <script src> OCH av
 * Node-testet via require(). Inga beroenden.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.ForetagskollenScoring = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  var VERSION = 1

  // ── Branschkonstanter ────────────────────────────────────────────────
  // marginal = försiktig snittmarginal per jobb (kr). Medvetet lågt satta —
  // "jag tar hellre i för lite än för mycket" (Mattes egen copy).
  var BRANSCH = {
    vvs:    { label: 'VVS-firma',          marginal: 9000 },
    el:     { label: 'Elfirma',            marginal: 8000 },
    bygg:   { label: 'Byggfirma',          marginal: 14000 },
    maleri: { label: 'Måleri & golv-firma', marginal: 7000 },
    annat:  { label: 'Hantverksfirma',     marginal: 8000 },
  }

  var STORLEK = {
    '1-4':   { label: '1–4 anställda',   faktor: 1.0, samtalTim: 5 },
    '5-9':   { label: '5–9 anställda',   faktor: 1.5, samtalTim: 8 },
    '10-20': { label: '10–20 anställda', faktor: 2.0, samtalTim: 12 },
  }

  // Förlorade jobb per månad till följd av samtalshanteringen (före
  // storleksfaktor). Bara dåliga svar läcker — den som svarar själv eller
  // har kontorsbemanning får ingen påhittad läckagerad.
  var SAMTAL_JOBB = { svarar_sjalv: 0, rostbrevlada: 1.33, kontoret: 0, ringer_tillbaka: 0.8 }

  // Offerter/mån: bandmitt.
  var OFFERT_MITT = { nastan_inga: 0, '1-4': 2.5, '5-9': 7, '10+': 12 }

  // Andel av offertvolymen som tappas p.g.a. bristande uppföljning.
  var UPPFOLJNING_TAPP = { nastan_alla: 0, de_storsta: 0.06, nar_nagon_kommer_ihag: 0.14, kunden_aterkommer: 0.2 }

  // ÄTA: andel av en jobbsmarginal som riskeras per månad (× storleksfaktor).
  var ATA_RISK = { direkt: 0, lapp: 0.35, slutfaktura: 0.5, ofta_inte: 0.8 }

  // Sena betalningar/jagande: andel av en jobbsmarginal per månad.
  var FAKTURA_LACKAGE = { direkt: 0, inom_veckan: 0.15, flera_veckor: 0.4, varierar: 0.55 }

  // Admin-timmar: fakturor & påminnelser per månad.
  var FAKTURA_TIM = { direkt: 2, inom_veckan: 4, flera_veckor: 6, varierar: 7 }

  var TIM_PER_OFFERT = 1.4

  // Severity 0–3 per område (styr fyndens ordning + temperatur).
  var SEV_SAMTAL = { svarar_sjalv: 1, rostbrevlada: 3, kontoret: 0, ringer_tillbaka: 2 }
  var SEV_UPPFOLJNING = { nastan_alla: 0, de_storsta: 1, nar_nagon_kommer_ihag: 2, kunden_aterkommer: 3 }
  var SEV_ATA = { direkt: 0, lapp: 2, slutfaktura: 2, ofta_inte: 3 }
  var SEV_FAKTURA = { direkt: 0, inom_veckan: 1, flera_veckor: 2, varierar: 3 }
  var SEV_AGARE = { rullar: 0, teamet_dagligt: 1, jag_koordinerar: 2, allt_genom_mig: 3 }

  // Tak — inga omöjliga tal oavsett indata.
  var MAX_LACKAGE = 120000
  var MAX_TIMMAR = 80

  // Svarsetiketter som citeras ordagrant i fynden ("uppföljning när det
  // hinns"-mönstret från mockupen).
  var SVARSCITAT = {
    samtal: {
      svarar_sjalv: 'jag svarar — även uppe på en stege',
      rostbrevlada: 'det går till röstbrevlådan',
      kontoret: 'någon på kontoret tar det',
      ringer_tillbaka: 'vi ringer tillbaka när vi hinner',
    },
    uppfoljning: {
      nastan_alla: 'vi följer upp nästan alla',
      de_storsta: 'vi följer upp de största',
      nar_nagon_kommer_ihag: 'det blir när någon kommer ihåg det',
      kunden_aterkommer: 'kunden får oftast återkomma själv',
    },
    ata: {
      direkt: 'skrivs upp direkt och kunden godkänner',
      lapp: 'noteras på lapp eller i huvudet',
      slutfaktura: 'tas med i slutfakturan om vi minns',
      ofta_inte: 'ofta blir det inte fakturerat',
    },
    fakturering: {
      direkt: 'fakturan går inom ett par dagar',
      inom_veckan: 'inom en vecka ungefär',
      flera_veckor: 'det kan dröja flera veckor',
      varierar: 'ärligt talat — det varierar',
    },
  }

  function avrunda1000(kr) { return Math.round(kr / 1000) * 1000 }

  function bransch(answers) {
    return BRANSCH[answers.bransch] || BRANSCH.annat
  }
  function storlek(answers) {
    return STORLEK[answers.storlek] || STORLEK['1-4']
  }

  // ── Huvudfunktionen ──────────────────────────────────────────────────
  // score(answers) → { profil, leakage, adminHours, findings, temperature }
  // Kastar aldrig; okända/saknade svar behandlas som "inget läckage känt".
  function score(answers) {
    answers = answers && typeof answers === 'object' ? answers : {}
    var br = bransch(answers)
    var st = storlek(answers)
    var m = br.marginal

    // — Läckage (kr/mån) —
    var leakRows = []

    var tappadeJobb = (SAMTAL_JOBB[answers.samtal] || 0) * st.faktor
    var samtalKr = avrunda1000(tappadeJobb * m)
    if (samtalKr > 0) {
      leakRows.push({
        omrade: 'samtal',
        label: 'Missade samtal — ca ' + Math.round(tappadeJobb) + ' förlorade jobb',
        kr: samtalKr,
      })
    }

    var offerter = OFFERT_MITT[answers.offerter_man] || 0
    var offertKr = avrunda1000(offerter * (UPPFOLJNING_TAPP[answers.uppfoljning] || 0) * m)
    if (offertKr > 0) {
      leakRows.push({ omrade: 'offert', label: 'Offerter som aldrig följs upp', kr: offertKr })
    }

    var ataKr = avrunda1000((ATA_RISK[answers.ata] || 0) * m * st.faktor)
    if (ataKr > 0) {
      leakRows.push({ omrade: 'ata', label: 'Extraarbete som inte fakturerats', kr: ataKr })
    }

    var fakturaKr = avrunda1000((FAKTURA_LACKAGE[answers.fakturering] || 0) * m)
    if (fakturaKr > 0) {
      leakRows.push({ omrade: 'faktura', label: 'Sena betalningar, jagande', kr: fakturaKr })
    }

    var leakTotal = 0
    for (var i = 0; i < leakRows.length; i++) leakTotal += leakRows[i].kr
    leakTotal = Math.min(leakTotal, MAX_LACKAGE)

    // — Admin-timmar (tim/mån) —
    var timRows = []
    var offertTim = Math.round(offerter * TIM_PER_OFFERT)
    if (offertTim > 0) timRows.push({ omrade: 'offert', label: 'Offertskrivande på kvällar', tim: offertTim })
    var faktTim = FAKTURA_TIM[answers.fakturering] || 0
    if (faktTim > 0) timRows.push({ omrade: 'faktura', label: 'Fakturor & påminnelser', tim: faktTim })
    timRows.push({ omrade: 'samtal', label: 'Samtal, bokningar, ombokningar', tim: st.samtalTim })

    var timTotal = 0
    for (var j = 0; j < timRows.length; j++) timTotal += timRows[j].tim
    timTotal = Math.min(timTotal, MAX_TIMMAR)

    // — Specialistfynd: topp-3 av fyra, sorterade på severity, stabil
    //   tie-break i fast ordning (lisa, daniel, karin, lars) —
    var offertSev = (answers.offerter_man === 'nastan_inga') ? 0
      : Math.min(3, (SEV_UPPFOLJNING[answers.uppfoljning] || 0) + (answers.offerter_man === '10+' ? 1 : 0))

    var kandidater = [
      {
        agent: 'lisa', namn: 'Lisa', roll: 'Kundservice',
        severity: SEV_SAMTAL[answers.samtal] || 0,
        fynd: fyndLisa(answers, samtalKr),
        atgard: 'Svara på varje samtal — även 06:45 när ni sitter i bilen — och boka platsbesök direkt i er kalender.',
        vardeKr: samtalKr, vardeTim: 0,
      },
      {
        agent: 'daniel', namn: 'Daniel', roll: 'Säljare',
        severity: offertSev,
        fynd: fyndDaniel(answers, offerter),
        atgard: 'Följa upp varje offert automatiskt — dag 3 och dag 7 — och flagga de som är på väg att kallna.',
        vardeKr: offertKr, vardeTim: offertTim,
      },
      {
        agent: 'karin', namn: 'Karin', roll: 'Ekonom',
        severity: SEV_FAKTURA[answers.fakturering] || 0,
        fynd: fyndKarin(answers),
        atgard: 'Skicka vänliga påminnelser automatiskt vid rätt tidpunkt. Ni ser bara att pengarna kommer in.',
        vardeKr: fakturaKr, vardeTim: faktTim,
      },
      {
        agent: 'lars', namn: 'Lars', roll: 'Projektledare',
        severity: SEV_ATA[answers.ata] || 0,
        fynd: fyndLars(answers, ataKr),
        atgard: 'Fånga varje extraarbete direkt när det dyker upp — dokumenterat, godkänt av kunden och med på fakturan.',
        vardeKr: ataKr, vardeTim: 0,
      },
    ]
    // Stabil sortering: severity fallande; vid lika behålls den fasta ordningen.
    var findings = kandidater
      .map(function (k, idx) { return { k: k, idx: idx } })
      .sort(function (a, b) { return (b.k.severity - a.k.severity) || (a.idx - b.idx) })
      .map(function (x) { return x.k })
      .slice(0, 3)

    // — Temperatur (speglar dashboardens Het/Varm/Kall-konvention) —
    var sevSum = (SEV_SAMTAL[answers.samtal] || 0) + offertSev +
      (SEV_FAKTURA[answers.fakturering] || 0) + (SEV_ATA[answers.ata] || 0) +
      (SEV_AGARE[answers.agarberoende] || 0) +
      (answers.storlek === '10-20' ? 1 : 0)
    var temperature = sevSum >= 8 ? 'het' : sevSum >= 4 ? 'varm' : 'kall'

    return {
      version: VERSION,
      profil: { bransch: br.label, storlek: st.label, marginal: m },
      leakage: { total: leakTotal, rows: leakRows },
      adminHours: { total: timTotal, rows: timRows },
      findings: findings,
      temperature: temperature,
    }
  }

  // ── Fyndtexter — citerar användarens svar ordagrant ──────────────────
  function fyndLisa(a, kr) {
    var citat = SVARSCITAT.samtal[a.samtal]
    if (a.samtal === 'rostbrevlada') {
      return '"' + versal(citat) + '", svarade du. Det är där jobb brukar försvinna — de flesta som söker hantverkare ringer bara nästa nummer i listan.'
    }
    if (a.samtal === 'ringer_tillbaka') {
      return '"' + versal(citat) + '" — och när ni väl hinner har en del redan bokat någon annan. Snabbheten avgör oftare än priset.'
    }
    if (a.samtal === 'svarar_sjalv') {
      return '"' + versal(citat) + '". Ni tappar inte samtalen — men de avbryter jobbet du fakturerar för, varje gång.'
    }
    return 'Ni har bemanning på samtalen — bra. Jag skulle mest avlasta utanför kontorstid.'
  }
  function fyndDaniel(a, offerter) {
    var citat = SVARSCITAT.uppfoljning[a.uppfoljning]
    if (!offerter) return 'Offertvolymen är låg idag — när den växer finns jag här.'
    var vol = Math.round(offerter) + ' offerter i månaden'
    if (citat && a.uppfoljning !== 'nastan_alla') {
      return vol + ' och uppföljning "' + citat + '". Offerter som följs upp inom tre dagar blir jobb betydligt oftare.'
    }
    return vol + ' och ni följer upp nästan alla — starkt. Jag skulle ta pappersarbetet så tiden läggs på de största.'
  }
  function fyndKarin(a) {
    var citat = SVARSCITAT.fakturering[a.fakturering]
    if (a.fakturering === 'direkt') {
      return 'Ni fakturerar snabbt — bra för kassaflödet. Jag skulle ta påminnelserna så ingen behöver jaga.'
    }
    return 'På frågan om fakturering svarade du "' + citat + '". Det är er kvällstid — och era pengar som ligger ute hos kunder.'
  }
  function fyndLars(a, kr) {
    var citat = SVARSCITAT.ata[a.ata]
    if (a.ata === 'direkt') {
      return 'Extraarbetet fångas direkt hos er — ovanligt bra. Jag skulle bara se till att inget faller mellan projekt och faktura.'
    }
    return 'Extraarbete som "' + citat + '" — det är arbete ni redan utfört som riskerar att aldrig bli pengar.'
  }
  function versal(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }

  // ── Demo-bryggans förifyllnad per bransch ────────────────────────────
  var DEMO_PREFILL = {
    vvs:    { kundSms: 'Hej! Vill ha offert på att byta blandare och rör i två badrum. Kan ni komma och titta?', jobb: 'två badrum' },
    el:     { kundSms: 'Hej! Vi behöver byta elcentral och få en laddbox installerad. Kan ni komma och titta?', jobb: 'elcentral + laddbox' },
    bygg:   { kundSms: 'Hej! Vill ha offert på en altan och byte av två fönster. Kan ni komma och titta?', jobb: 'altan + fönsterbyte' },
    maleri: { kundSms: 'Hej! Vill ha offert på att måla om hall och vardagsrum. Kan ni komma förbi och titta?', jobb: 'hall + vardagsrum' },
    annat:  { kundSms: 'Hej! Skulle vilja ha en offert på ett jobb hemma hos oss. Kan ni komma och titta?', jobb: 'jobbet' },
  }

  return {
    VERSION: VERSION,
    score: score,
    BRANSCH: BRANSCH,
    STORLEK: STORLEK,
    SVARSCITAT: SVARSCITAT,
    DEMO_PREFILL: DEMO_PREFILL,
  }
})
