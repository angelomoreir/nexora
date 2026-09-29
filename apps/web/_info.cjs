const fs = require('fs');
for (const n of ['pt-PT', 'en', 'fr', 'es', 'de']) {
  const s = fs.readFileSync('src/i18n/locales/' + n + '.ts', 'utf8');
  const strip = s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
  console.log(n, 'comments:', /\/\/|\/\*/.test(strip), 'BOM:', s.charCodeAt(0) === 0xFEFF, 'end:', JSON.stringify(s.slice(-50)));
}
