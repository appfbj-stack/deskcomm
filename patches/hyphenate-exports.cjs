// patches/hyphenate-exports.cjs
// Patch do @react-pdf/hyphenate.
//
// O vendor tem "type": "module" e o exports map é ESM-only (só campo
// `import`). CommonJS (o textkit importa como CJS) cai em
// ERR_PACKAGE_PATH_NOT_EXPORTED para qualquer subpath. O wildcard
// ./* que existia no vendor também é rejeitado por Node 22 strict
// validation. A correção é dupla:
//
//   1) Substituir ./* por entries explícitos ./<locale> para cada
//      arquivo de ./lib/. Sem isso, mesmo o import ESM tomava 404
//      em alguns subpaths sob validação estrita.
//   2) Adicionar campo `require` em cada entry, apontando para o
//      mesmo ./lib/<locale>.js. Sem isso, require() em CJS quebra.
//      É o mesmo arquivo: o módulo é ESM-only no .js, mas o Node
//      aceita o caminho `require` desde que o destino resolva.
//
// pnpm guarda hyphenate em dois lugares (.pnpm/@react-pdf+hyphenate@*/
// e .pnpm/@react-pdf+textkit@*/node_modules/@react-pdf/hyphenate).
// Patch cobre os dois via recursão.

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
  const libDir = path.join(hyph, 'lib');
  const files = fs.existsSync(libDir) ? fs.readdirSync(libDir) : [];

  const m = {};
  m['.'] = { types: './lib/index.d.ts', import: './lib/index.js', require: './lib/index.js' };
  m['./package.json'] = './package.json';

  for (const f of files) {
    if (!f.endsWith('.js') && !f.endsWith('.d.ts')) continue;
    const key = './' + f.replace(/\.(js|d\.ts)$/, '');
    if (key === './index') continue; // já coberto pelo '.'
    const jsPath = './lib/' + (f.endsWith('.js') ? f : f.replace(/\.d\.ts$/, '.js'));
    const dtsPath = './lib/' + (f.endsWith('.d.ts') ? f : f.replace(/\.js$/, '.d.ts'));
    m[key] = { types: dtsPath, import: jsPath, require: jsPath };
  }
  pkg.exports = m;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('patched', hyph, 'entries=' + Object.keys(m).length);
  n += 1;
}
console.log('total=' + n);
