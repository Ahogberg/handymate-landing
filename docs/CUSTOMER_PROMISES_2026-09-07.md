# Kundupplevelse: sanna löften före lansering

Bas: c557d37e03dabf6d257958cc01dd4cadf835bf74. 7 september 2026.

## Ändrat

13 HTML-sidor får avgränsade textändringar: index, ai-team, daniel, demo, foretagskollen, hanna, jamfor, karin, lars, lisa, matte, offertgenerator och partners.

- Guidad start med kundens firma ersätter löften om färdig installation på 15 minuter.
- Telefon/SMS-beskrivningar villkoras av aktivering och verifiering. Webbplatsen ska inte utlova en verifierad samtalskedja bara för att en tjänst är vald.
- Grundarkundsgarantin synkas till 90 dagar när erbjudandet gäller; standardgarantin är fortsatt 30 dagar. Första 20 betalande och aktuell tillgänglighet vid aktivering framgår.
- Grundarkundsremsan och startgriden bryter korrekt på mobil. Ingen horisontell overflow vid 375 px efter ändringen.

Produktfacit: Ahogberg/handymate-dashboard main 7e3ef33468065331dbe5cfc6ac39189a985c4888, särskilt lib/billing/founders-offer.ts, lib/feature-gates.ts och befintliga launch-löftesunderlag. Direkt hämtning av handymate.se gav HTTP 200 och bekräftade de tidigare start-/grundarkundstexterna. Äldre sökcache användes inte som facit. Detta är inte en garanti att varje historisk produkt- eller avtalsformulering är avstämd.

## Verifiering

124 kontroller passerar i scoring, CTA, save-lead, ROT och lanseringshero. Hero-filens 26 kontroller kördes även efter CSS-ändringen. Fulla npm test stoppas i SSRF-svitens tillåtna DNS-fall av miljöns namnuppslagning; full svit är därför inte grön. Inga säkerhetskontroller ändrades.

Riktig lokal HTML/CSS granskades i Chromium vid 375 och 1280 px, med externa anrop blockerade och utan formulärinlämning. Ingen horisontell overflow eller JavaScript-fel. Ingen produktionsändring eller verklig lead skapades. Ingen separat lint-/build-script finns i package.json.

Kundstartsmallar och full rapport levereras i dashboardens docs/customer-start/KUNDSTART_2026-09-07.md och docs/handoffs/CUSTOMER_EXPERIENCE_2026-09-07.md. Befintliga lanseringsgrindar gäller fortsatt; native-/telefonprov är inte genomförda här.
