// patches/hyphenate-exports.cjs
// Patch do @react-pdf/hyphenate (vendor nao corrige o exports map).
// Node 22 strict export validation recusa o wildcard ./* e quebra
// o require interno do textkit: ./en-us nao existe.
const fs = require('fs');
const path = require('path');
const root = '/app/node_modules';
const targets = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'hyphenate' && p.includes('@react-pdf')) targets.push(p);
      else walk(p);
    }
  }
}
walk(root);
let n = 0;
for (const hyph of targets) {
  const pkgPath = hyph + '/package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const files = fs.readdirSync(hyph).filter(f =>
    f.endsWith('.aff') || f.endsWith('.dic') || f.endsWith('.json')
    || /^[a-z]{2}(-[a-z0-9]+)?$/.test(f)
  );
  const m = { ...(pkg.exports || {}) };
  for (const f of files) if (!m['./' + f]) m['./' + f] = f;
  pkg.exports = m;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('patched', hyph, files.length);
  n += 1;
}
console.log('total=' + n);
