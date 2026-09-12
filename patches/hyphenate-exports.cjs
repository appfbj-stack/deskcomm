// patches/hyphenate-exports.cjs
// Patch do @react-pdf/hyphenate (vendor nao corrige o exports map).
// Node 22 strict export validation rejeita o wildcard ./* e quebra
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
  // As locales ficam em ./lib/*.js — o wildcard do vendor (./* -> ./lib/*.{d.ts,js})
  // é o que Node 22 rejeita. Listamos todos os arquivos .js/.d.ts do ./lib e
  // adicionamos entries explícitos ./<sem-extensao> -> ./lib/<arquivo>.
  const libDir = path.join(hyph, 'lib');
  const files = fs.existsSync(libDir) ? fs.readdirSync(libDir) : [];
  const m = { ...(pkg.exports || {}) };
  // Preserva o entry raiz
  if (!m['.']) m['.'] = { types: './lib/index.d.ts', import: './lib/index.js' };
  m['./package.json'] = './package.json';
  for (const f of files) {
    if (!f.endsWith('.js') && !f.endsWith('.d.ts')) continue;
    const key = './' + f.replace(/\.(js|d\.ts)$/, '');
    if (!m[key]) {
      m[key] = f.endsWith('.d.ts')
        ? { types: './lib/' + f, import: './lib/' + f.replace(/\.d\.ts$/, '.js') }
        : './lib/' + f;
    }
  }
  pkg.exports = m;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('patched', hyph, 'entries=' + Object.keys(m).length);
  n += 1;
}
console.log('total=' + n);
