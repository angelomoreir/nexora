const fs = require('fs'), path = require('path');
function walk(d, out) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(f)) out.push(p); } return out; }
const files = walk('src', []);
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes(String.fromCharCode(0xFFFD))) continue;
  const lines = c.split('\n');
  const hits = [];
  lines.forEach((l, i) => { if (l.includes(String.fromCharCode(0xFFFD))) hits.push(i + 1); });
  console.log('FFFD:', f, 'lines', hits.slice(0, 8).join(','), hits.length > 8 ? `(+${hits.length - 8})` : '');
}
console.log('---done---');
