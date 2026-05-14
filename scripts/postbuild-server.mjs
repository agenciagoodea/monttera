import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const serverJsPath = path.join(distDir, 'server.js');
const serverCjsPath = path.join(distDir, 'server.cjs');
const distPkgPath = path.join(distDir, 'package.json');

if (!fs.existsSync(distDir)) {
  throw new Error('Diretorio dist nao encontrado apos build.');
}

if (!fs.existsSync(serverJsPath)) {
  throw new Error('Arquivo dist/server.js nao encontrado apos compilacao do servidor.');
}

// Wrapper de startup para ambientes Node Selector (DirectAdmin/cPanel)
// que exigem startup file fixo em dist/server.cjs.
fs.writeFileSync(
  serverCjsPath,
  "require('./server.js');\n",
  'utf8',
);

// Garante que arquivos .js dentro de dist sejam tratados como CommonJS
// mesmo com o package raiz em \"type\": \"module\".
fs.writeFileSync(
  distPkgPath,
  JSON.stringify({ type: 'commonjs' }, null, 2),
  'utf8',
);

console.log('Build server finalizado: dist/server.cjs pronto para startup.');
