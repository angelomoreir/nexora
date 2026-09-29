const fs = require('fs');
function load(f) {
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/export const \w+\s*=\s*(\{[\s\S]*\});?\s*$/);
  return eval('(' + m[1] + ')');
}
function flat(o, p, out) { for (const k in o) { const kk = p ? p + '.' + k : k; if (o[k] && typeof o[k] === 'object') flat(o[k], kk, out); else out[kk] = o[k]; } return out; }
const pt = flat(load('src/i18n/locales/pt-PT.ts'), '', {});
const en = flat(load('src/i18n/locales/en.ts'), '', {});
const fr = flat(load('src/i18n/locales/fr.ts'), '', {});
const es = flat(load('src/i18n/locales/es.ts'), '', {});
const de = flat(load('src/i18n/locales/de.ts'), '', {});
const names = { en, fr, es, de };
const missingUnion = new Set();
for (const [n, o] of Object.entries(names)) for (const k of Object.keys(pt)) if (!(k in o)) missingUnion.add(k);
console.log('=== pt values for keys missing in other locales ===');
for (const k of [...missingUnion].sort()) console.log(k + ' :: ' + JSON.stringify(pt[k]));
