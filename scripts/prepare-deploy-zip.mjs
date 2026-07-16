import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const ROOT = process.cwd();
const BUNDLE_NAME = 'deploy-bundle.zip';

console.log('\n🔍 Verificando artefatos de build para ZIP...');

const required = [
  'dist/server.cjs',
  'dist/server.js',
  'dist/package.json',
  'package.json',
  'package-lock.json',
  'index.html',
  'app.js',
  '.htaccess'
];

for (const file of required) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.error(`❌ FALHA: ${file} não encontrado!`);
    process.exit(1);
  }
  console.log(`  ✅ ${file} existe`);
}

console.log('\n📦 Criando bundle de deploy ZIP...');

const zip = new AdmZip();

// Lista de arquivos/pastas para incluir no bundle
const includes = [
  'dist',
  'package.json',
  'package-lock.json',
  '.npmrc',
  'index.html',
  'app.js',
  '.htaccess',
  'scripts',
  '.env.example',
];

for (const item of includes) {
  const p = path.join(ROOT, item);
  if (!fs.existsSync(p)) continue;
  
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    zip.addLocalFolder(p, item);
    console.log(`  ➕ Adicionado diretório: ${item}`);
  } else {
    zip.addLocalFile(p);
    console.log(`  ➕ Adicionado arquivo: ${item}`);
  }
}

zip.writeZip(path.join(ROOT, BUNDLE_NAME));

const bundleSize = fs.statSync(path.join(ROOT, BUNDLE_NAME)).size;
const sizeMB = (bundleSize / (1024 * 1024)).toFixed(2);

console.log(`\n✅ ${BUNDLE_NAME} criado com sucesso (${sizeMB} MB)!\n`);
