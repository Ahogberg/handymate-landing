# Vardagsbilder på startsidan

Bas: main 973e46d4323f73d802d1338648bddeb04d1fc4ff.

Två AI-genererade, fiktiva vardagssituationer. Inte verkliga kunder eller kundbevis. Befintligt namngivet kundcitat är oförändrat; dess äkthet och tillstånd har inte granskats i denna ändring.

- `img/workday-evening-{640,1200}.webp`: egen sektion före jämförelsen, administration vid köksbordet efter jobbet.
- `img/workday-onsite-{640,1200}.webp`: egen sektion före footern, avstämning på arbetsplatsen.

## Revidering 2026-09-12

Efter granskning:

- **Footern är återställd bit för bit till `973e46d`.** Boknings- och registreringsknapparna ligger kvar i sin ursprungliga centrerade rad; ingen CTA är flyttad eller dubblerad.
- **Scenerna är egna sektioner** (`section.workday-section`) i stället för att dela rubrikplats med blocket under. Det ger varje scen ett eget band med `clamp(80px,9vw,128px)` vertikal luft — rättar att "Känner du igen dig?" låg för tätt mot sektionerna runtom. Kvällsscenen har `--bg` som botten för en tonskillnad mot de vita sektionerna på båda sidor; arbetsplatsscenen behåller mörkt `#0a231f` och flyter ihop med footern nedanför.
- **Jämförelsens egen rubrik är tillbaka** (`Jämförelse` / `Vad AI:n gör medan du jobbar`). Utan den stod utan/med-korten utan etikett.
- **Båda scenerna har `reveal`** så de animeras in som allt annat på sidan.
- **`tests/workday-images.test.mjs` ingår nu i `npm test`.** Tidigare kördes den bara manuellt.
- Klasserna `.workday-intro`, `.workday-close` och `.workday-actions` är borta och ersatta av `.workday-scene` + `.workday-section` + `.workday-dark`.
- Bilderna har synlig AI-märkning, beskrivande alt-text, reserverade dimensioner, responsivt srcset och lazy loading. Cirka 39 kB tillsammans i mindre storlek, 88 kB i större. Inga nya beroenden, externa bildvärdar eller spårningsanrop.
- Hero, produktdemonstration, prissättning, formulär och kundcitat lämnas oförändrade. Ingen uppmätt konverteringsökning påstås.

## Bildproduktion

Två enskilda bilder genererade med inbyggda image_gen, inga varianter eller omtag. Optimerade till WebP efter visuell inspektion av originalen. Originalstorlek 1536 × 1024.

### Prompt: kväll

Use case: photorealistic-natural. Asset type: standalone landscape 3:2 photograph for a Swedish tradespeople landing page, illustrative fictional scenario. Primary request: a fictional Swedish tradesperson aged about 40 in a charcoal work shirt at an ordinary kitchen table after work, checking paperwork beside a closed toolbag and laptop. Scene: authentic lived-in Nordic home. Style: candid editorial photography, real skin and material texture. Composition: landscape 3:2, natural medium framing with human hands and papers as a focus. Lighting: natural dusk window light. Palette: restrained cool neutrals with subtle teal. Expression: thoughtful, not exaggerated or distressed. Constraints: believable hands; no readable text, logos, watermarks, fake UI, overlays, captions, collage, or testimonials. Clean standalone photo.

### Prompt: arbetsplats

Use case: photorealistic-natural. Asset type: standalone landscape 3:2 photograph for a Swedish tradespeople landing page, illustrative fictional scenario. Primary request: a fictional female tradesperson aged about 35 in credible dark workwear standing safely inside a Swedish house renovation site, checking her smartphone with a relaxed, focused expression. Scene: tidy renovation area, tools put away, no active hazardous work. Style: candid natural editorial photography with authentic real skin and material texture, restrained campaign feel. Composition: landscape 3:2, natural medium framing, believable hands holding phone. Lighting: natural daylight. Palette: restrained cool neutrals with subtle teal. Constraints: no logos, no readable screen text, no readable text elsewhere, no watermarks, fake UI, overlays, captions, collage, or testimonials. Clean standalone photo.

## Verifiering

Kör lokalt utan externa anrop:

```
node tests/workday-images.test.mjs
node tests/cta.test.mjs
node tests/lanseringshero.test.mjs
node tests/nav-login.test.mjs
git diff --check
```

Den fullständiga `npm test`-körningen stoppades av en nätverksbehörighetsfråga. Ingen full grön svit eller webbläsargranskning påstås. Bilderna har inspekterats separat, inte som renderad sida. Före produktionspublicering återstår visuell kontroll i mobil och desktop. Ingen ändring av produktionssajten ingår i denna leverans.
