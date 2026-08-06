/* Kirjoittaa index.html:ään UKK-osion sisällön ja FAQPage-rakennedatan.

   Lähde on _shared.js:n FAQ-taulukko — sitä muokataan, ei index.html:ää.
   Aja muutoksen jälkeen:  node _gen-faq.mjs

   Miksi tämä on olemassa: aiemmin FAQ rakennettiin kokonaan selaimessa,
   jolloin sivun paras sisältö puuttui raaka-HTML:stä. Googlen renderöinti
   ehtii perille lopulta, mutta kielimallien crawlerit eivät yleensä aja
   JavaScriptiä lainkaan, joten yhdeksän kysymystä vastauksineen jäi niiltä
   kokonaan näkemättä. _shared.js hydratoi nyt valmiin markupin.
*/
import { readFileSync, writeFileSync } from 'node:fs';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* FAQ-taulukko luetaan _shared.js:stä sellaisenaan. Tiedosto on selaimen
   skripti eikä moduuli, joten se ei ole importattavissa — poimitaan
   literaali ja evaluoidaan se. */
const shared = readFileSync('_shared.js', 'utf8');
const m = shared.match(/^const FAQ = (\[[\s\S]*?\n\]);$/m);
if (!m) throw new Error('_shared.js: FAQ-taulukkoa ei löytynyt');
const FAQ = eval(m[1]);

const CHEVRON =
  '<svg class="cv" width="20" height="20" viewBox="0 0 24 24" fill="none">' +
  '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

/* Markupin on vastattava _shared.js:n rakentamaa, jotta avaus/sulkeutuminen
   toimii samoin riippumatta siitä kumpi sen tuotti. */
const faqHtml = FAQ.map(
  ([q, a]) =>
    `    <div class="q"><button type="button">${esc(q)}${CHEVRON}</button>` +
    `<div class="a"><p>${esc(a)}</p></div></div>`,
).join('\n');

const schema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': 'https://tiiviskoti.fi/#faq',
  mainEntity: FAQ.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

let html = readFileSync('index.html', 'utf8');

/* Merkkirajan perässä saa olla selittävää tekstiä, ja rivinvaihto voi olla
   kumpaa tahansa lajia — kumpikin sallitaan tässä. */
const replaceBlock = (source, name, body) => {
  const re = new RegExp(
    `([ \\t]*<!-- ${name}:alku\\b[^>]*-->\\r?\\n)[\\s\\S]*?([ \\t]*<!-- ${name}:loppu\\b[^>]*-->)`,
  );
  if (!re.test(source)) throw new Error(`index.html: merkkejä ${name} ei löytynyt`);
  return source.replace(re, `$1${body}\n$2`);
};

html = replaceBlock(html, 'ukk', `  <div class="faq" id="faq">\n${faqHtml}\n  </div>`);
html = replaceBlock(
  html,
  'ukk-schema',
  `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`,
);

writeFileSync('index.html', html);
console.log(`index.html päivitetty: ${FAQ.length} kysymystä + FAQPage-schema`);
