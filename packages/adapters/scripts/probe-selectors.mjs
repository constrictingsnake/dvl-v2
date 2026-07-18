// Discovery: dump eBay buybox elements (class + trimmed text) so selectors are
// derived from the real fixture DOM, not guessed. Usage: node scripts/probe-selectors.mjs <file>
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const raw = readFileSync(process.argv[2], 'utf8');
const win = new Window({
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});
win.document.documentElement.innerHTML = raw
  .replace(/^\s*<!doctype[^>]*>/i, '')
  .trim()
  .replace(/^<html[^>]*>/i, '')
  .replace(/<\/html>\s*$/i, '');
const doc = win.document;

const show = (label, el) => {
  if (!el) return console.log(`  ${label}: <none>`);
  const cls = (el.getAttribute('class') || '').slice(0, 60);
  const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  console.log(`  ${label}: <${el.tagName.toLowerCase()} class="${cls}"> "${txt}"`);
};

console.log('# TITLE');
show('h1', doc.querySelector('h1'));

console.log('# elements with x-* classes carrying price/bid/time/title text');
const seen = new Set();
for (const el of [...doc.querySelectorAll('[class*="x-"]')]) {
  const cls = el.getAttribute('class') || '';
  const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
  if (!/x-(price|bid|title|time|buybox|bin|quantity)/.test(cls)) continue;
  if (el.children.length > 3) continue; // leaf-ish only
  const key = cls.split(' ')[0] + '|' + txt.slice(0, 20);
  if (seen.has(key)) continue;
  seen.add(key);
  if (txt.length > 80 || txt.length === 0) continue;
  console.log(`  .${cls.split(' ').join('.').slice(0, 55)}  ::  "${txt.slice(0, 55)}"`);
}

console.log('# data-testid candidates');
for (const el of [...doc.querySelectorAll('[data-testid]')].slice(0, 40)) {
  const t = el.getAttribute('data-testid');
  if (/bid|price|time|title|watch|buy/i.test(t)) console.log(`  [data-testid="${t}"]`);
}
