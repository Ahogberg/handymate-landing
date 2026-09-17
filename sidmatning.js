/**
 * Sidmätning för landningssajten (2026-09-17).
 *
 * VARFÖR: landing_events hade noll rader någonsin, och bara
 * foretagskollen.html anropade /api/event. Följden var att en tom
 * lead-tabell inte gick att tolka — vi kunde inte skilja "ingen besöker
 * sajten" från "folk besöker men fyller inte i formuläret". Morgonrapporten
 * rapporterade noll leads varje dag utan att kunna säga vilket.
 *
 * Ett event per sidvisning: `page_viewed`. Inget mer. Klick och scroll är
 * nästa fråga, inte den här.
 *
 * INTEGRITET: ingen cookie, ingen tredjepart, inget personuppgiftsfält.
 * Sessions-id är slumpat per flik och bor i sessionStorage (försvinner när
 * fliken stängs). Av hänvisaren sparas BARA värdnamnet — en full URL kan
 * bära sökord och id:n vi inte har något att göra med. Rutten lagrar ingen
 * IP; den använder den bara i minnet för sin hastighetsgräns.
 *
 * Fire-and-forget via sendBeacon: svaret spelar ingen roll, och ett mätfel
 * får aldrig märkas av besökaren.
 */
(function () {
  'use strict'

  var NYCKEL_SESSION = 'hm_session'
  var NYCKEL_ATTR = 'hm_attr'
  var ATTRIBUT = ['ref', 'entry', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']

  function las(nyckel) {
    try { return sessionStorage.getItem(nyckel) } catch (e) { return null }
  }
  function skriv(nyckel, varde) {
    try { sessionStorage.setItem(nyckel, varde) } catch (e) { /* privat läge */ }
  }

  // Samma form som foretagskollen.html redan använder, så de två mätningarna
  // går att koppla ihop per besökare utan att någon behöver veta vem det är.
  var sessionId = (function () {
    var s = las(NYCKEL_SESSION)
    if (s) return s
    s = 'hm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
    skriv(NYCKEL_SESSION, s)
    return s
  })()

  // Attributionen sätts på den FÖRSTA sidan i besöket och följer med vidare.
  // Utan det tillskrivs varje intern klick "ingen källa", och en partnerlänk
  // som leder till ett formulär tre sidor senare ser ut som direkttrafik.
  var attribution = (function () {
    var attr = {}
    try {
      var sparad = las(NYCKEL_ATTR)
      if (sparad) attr = JSON.parse(sparad) || {}
    } catch (e) { attr = {} }
    try {
      var p = new URLSearchParams(location.search)
      for (var i = 0; i < ATTRIBUT.length; i++) {
        var v = p.get(ATTRIBUT[i])
        // Första källan vinner: kommer besökaren via en partnerlänk och sedan
        // klickar en egen kampanjlänk är det partnern som hänvisade.
        if (v && !attr[ATTRIBUT[i]]) attr[ATTRIBUT[i]] = String(v).slice(0, 120)
      }
      skriv(NYCKEL_ATTR, JSON.stringify(attr))
    } catch (e) { /* mätning får aldrig krascha sidan */ }
    return attr
  })()

  function hanvisarVard() {
    try {
      if (!document.referrer) return null
      var host = new URL(document.referrer).hostname
      // Intern navigering är inte en hänvisning.
      return host && host !== location.hostname ? host : null
    } catch (e) { return null }
  }

  function skicka() {
    try {
      var payload = {
        path: location.pathname,
        referrer_host: hanvisarVard(),
        viewport: window.innerWidth <= 767 ? 'mobil' : 'desktop',
      }
      for (var k in attribution) if (Object.prototype.hasOwnProperty.call(attribution, k)) payload[k] = attribution[k]
      var body = JSON.stringify({ event: 'page_viewed', session_id: sessionId, payload: payload })
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {})
      }
    } catch (e) { /* mätning får aldrig krascha sidan */ }
  }

  // Förrenderade sidor (Chrome prerender, Safari-prefetch) ska inte räknas som
  // besök förrän de faktiskt visas — annars mäter vi webbläsarens gissningar.
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', skicka, { once: true })
  } else {
    skicka()
  }
})()
