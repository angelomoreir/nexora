const s = require('fs').readFileSync('src/i18n/locales/pt-PT.ts', 'utf8');
const out = [];
const cur = [];
for (const line of s.split('\n')) {
  const open = line.match(/^\s*([a-zA-Z_0-9]+)\s*:\s*\{/);
  if (open) { cur.push(open[1]); continue; }
  const kv = line.match(/^\s*([a-zA-Z_0-9]+)\s*:\s*["']/);
  if (kv) out.push(cur.join('.') + '.' + kv[1]);
  let d = (line.match(/}/g) || []).length - (line.match(/\{/g) || []).length;
  while (d-- > 0) cur.pop();
}
const want = process.argv[2] ? process.argv[2].split(',') : ['common', 'documents', 'workflows', 'tasks', 'lists', 'forms', 'search', 'settings', 'admin', 'billing', 'approvals', 'ai', 'notifications', 'profile'];
for (const w of want) {
  console.log('=== ' + w);
  console.log(out.filter(k => k.startsWith(w + '.') && k.split('.').length <= 3).map(k => k.slice(w.length + 1)).join(', '));
}
