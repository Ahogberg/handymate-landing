import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { Script } from 'node:vm'

const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
const images = [...html.matchAll(/<img\b[^>]*src="\/img\/workday-[^>]+>/g)]
assert.equal(images.length, 2, 'Exactly two illustrative scenes')
for (const [image] of images) {
  assert.match(image, /loading="lazy"/)
  assert.match(image, /decoding="async"/)
  assert.match(image, /width="1200" height="800"/)
  assert.match(image, /alt="[^"]+"/)
  assert.match(image, /sizes="[^"]+"/)
  const candidates = [...image.matchAll(/\/img\/workday-[\w-]+\.webp/g)]
  for (const [path] of candidates) {
    const url = new URL(path.slice(1), root)
    const bytes = readFileSync(url)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.ok(statSync(url).size < 65000, `${path}: exceeds image budget`)
  }
}
assert.equal((html.match(/<figcaption>AI-genererad illustration av en vardagssituation\.<\/figcaption>/g) || []).length, 2)
// RÖTT PÅ MAIN SEDAN 2026-09-12, rättat 2026-09-17.
//
// Raden krävde `assert.ok(testimonial, 'Existing testimonial remains')` — att
// kundcitatet FANNS. Sedan tog 8b6603e bort det, med motiveringen "det var
// inte en kunds röst": citatet var påhittat och tillskrivet en namngiven
// person på ett riktigt företag. Borttagningen var rätt; testet hade
// därefter fel, och main har varit röd i fem dagar utan att någon läste det.
//
// Avsikten bevaras och skärps. Den var "generated people must not
// impersonate the customer". Nu: inget påhittat kundcitat ska finnas, och
// om ett ÄKTA citat läggs in får det aldrig illustreras med våra genererade
// personbilder.
const testimonial = html.match(/<div class="testimonial reveal">[\s\S]*?<\/section>/)?.[0]
assert.ok(!testimonial || !/Christoffer Lindqvist|Bee Service/.test(testimonial),
  'Det borttagna, påhittade kundcitatet är tillbaka (se 8b6603e)')
if (testimonial) {
  assert.doesNotMatch(testimonial, /workday-|<img/, 'Generated people must not impersonate the customer')
}
assert.match(html, /@media\(max-width:760px\)/)
for (const [, attrs, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (attrs.includes('application/ld+json')) JSON.parse(content)
  else if (!attrs.includes('src=')) new Script(content)
}
console.log('✓ workday images: assets, budget, responsive markup, disclosures, testimonial separation and inline JS syntax')
