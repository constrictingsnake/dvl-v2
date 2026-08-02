// Trim a raw eBay live-DOM capture down to what the adapter parses:
// keep the listing DOM + ld+json + the embedded item-state script (TimerModel/
// endTime/bidCount); drop all other scripts, styles, svg, base64 image data.
// Usage: node scripts/trim-fixture.mjs <path-to-fixture.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const file = process.argv[2];
if (!file) throw new Error('usage: trim-fixture.mjs <file>');
const raw = readFileSync(file, 'utf8');

const win = new Window({
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});
const inner = raw
  .replace(/^\s*<!doctype[^>]*>/i, '')
  .trim()
  .replace(/^<html[^>]*>/i, '')
  .replace(/<\/html>\s*$/i, '');
win.document.documentElement.innerHTML = inner;

const doc = win.document;
const keepScript = (s) =>
  s.getAttribute('type') === 'application/ld+json' ||
  /TimerModel|"endTime"|"endDate"|"bidCount"|maxDisplayValue/i.test(s.textContent || '');

let dropped = 0,
  keptState = 0,
  keptLd = 0;
for (const s of [...doc.querySelectorAll('script')]) {
  if (keepScript(s)) {
    if (s.getAttribute('type') === 'application/ld+json') keptLd++;
    else keptState++;
  } else {
    s.remove();
    dropped++;
  }
}
for (const e of [...doc.querySelectorAll('style, link, noscript, svg, iframe, template')])
  e.remove();
for (const e of [...doc.querySelectorAll('img, source')]) {
  for (const a of ['src', 'srcset', 'data-src']) {
    const v = e.getAttribute(a);
    if (v && v.startsWith('data:')) e.setAttribute(a, '');
  }
}

const out = '<!doctype html>\n<html>' + doc.documentElement.innerHTML + '</html>\n';
writeFileSync(file, out);
console.log(
  JSON.stringify({
    before: raw.length,
    after: out.length,
    scriptsDropped: dropped,
    stateScriptsKept: keptState,
    ldJsonKept: keptLd,
  }),
);
