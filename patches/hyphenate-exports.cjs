/**
 * Patch do @react-pdf/hyphenate (vendor não corrige o `exports` map).
 *
 * Node 22 com strict export validation recusa o wildcard `./.*` do vendor e
 * quebra o `require` interno do @react-pdf/textkit: `./en-us` não existe,
 * event-log drain fica OFF e o worker perde uma frente de processamento.
 *
 * Solução: adicionar entries EXPLÍCITOS para cada arquivo do pacote (locales
 * + .aff/.dic) no campo `exports` do package.json.
 *
 * pnpm mantém o hyphenate em DOIS lugares:
 *   - .pnpm/@react-pdf+hyphenate@*/node_modules/@react-pdf/hyphenate  (canônico)
 *   - .pnpm/@react-pdf+textkit@*/node_modules/@react-pdf/hyphenate    (symlink)
 *
 * Patch só em um deixa o outro falhando. Este script varre e patcha os dois.
 */
const fs = require('fs');
const path = require('path');

const root = process.argv[2] ?? '/app/node_modules';
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

let patched = 0;
for (const hyph of targets) {
  const pkgPath = hyph + '/package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const files = fs.readdirSync(hyph).filter((f) =>
    f.endsWith('.aff') || f.endsWith('.dic') || f.endsWith('.json')
    || /^[a-z]{2}(-[a-z0-9]+)?$/.test(f)
  );
  const newMap = { ...(pkg.exports || {}) };
  for (const f of files) if (!newMap['./' + f]) newMap['./' + f] = f;
  pkg.exports = newMap;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  patched += 1;
  console.log('patched', hyph, 'exports=' + files.length);
}

console.log('total_patched=' + patched);
