#!/usr/bin/env node
/**
 * Script de preparação de deploy para DirectAdmin / Passenger.
 *
 * Uso:
 *   node scripts/prepare-deploy.mjs
 *
 * O que faz:
 *   1. Valida que o build foi gerado corretamente
 *   2. Cria um arquivo deploy-bundle.tar.gz contendo APENAS os arquivos necessários
 *   3. Mostra os comandos para enviar ao servidor
 *
 * Arquivos incluídos no bundle:
 *   - dist/           (build completo)
 *   - package.json
 *   - package-lock.json
 *   - .npmrc
 *   - index.html
 *   - scripts/
 *   - .env.example
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BUNDLE_NAME = 'deploy-bundle.tar.gz';

function check(condition, message) {
  if (!condition) {
    console.error(`\n❌ FALHA: ${message}\n`);
    process.exit(1);
  }
  console.log(`  ✅ ${message}`);
}

console.log('\n🔍 Verificando artefatos de build...\n');

check(fs.existsSync(path.join(ROOT, 'dist', 'server.cjs')), 'dist/server.cjs existe');
check(fs.existsSync(path.join(ROOT, 'dist', 'server.js')), 'dist/server.js existe');
check(fs.existsSync(path.join(ROOT, 'dist', 'package.json')), 'dist/package.json existe');
check(fs.existsSync(path.join(ROOT, 'package.json')), 'package.json existe');
check(fs.existsSync(path.join(ROOT, 'package-lock.json')), 'package-lock.json existe');
check(fs.existsSync(path.join(ROOT, 'index.html')), 'index.html existe');

// Verifica se dist/package.json tem type=commonjs
const distPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'package.json'), 'utf8'));
check(distPkg.type === 'commonjs', 'dist/package.json tem type=commonjs');

// Verifica se existem assets do frontend
const distFiles = fs.readdirSync(path.join(ROOT, 'dist'));
const hasAssets = distFiles.some(f => f === 'assets' || f === 'index.html' || f.endsWith('.html'));
check(hasAssets, 'dist/ contém assets do frontend');

console.log('\n📦 Criando bundle de deploy...\n');

// Lista de arquivos/pastas para incluir no bundle
const includes = [
  'dist',
  'package.json',
  'package-lock.json',
  '.npmrc',
  'index.html',
  'scripts',
  '.env.example',
].filter(f => fs.existsSync(path.join(ROOT, f)));

try {
  // Tenta usar tar (disponível no Windows 10+ e Linux/Mac)
  const fileList = includes.join(' ');
  execSync(`tar -czf ${BUNDLE_NAME} ${fileList}`, { cwd: ROOT, stdio: 'pipe' });
} catch (error) {
  console.error('⚠️  tar não disponível. Crie o arquivo manualmente ou use 7-Zip.');
  console.log('\nArquivos para enviar manualmente:');
  includes.forEach(f => console.log(`  📁 ${f}`));
  process.exit(0);
}

const bundleSize = fs.statSync(path.join(ROOT, BUNDLE_NAME)).size;
const sizeMB = (bundleSize / (1024 * 1024)).toFixed(2);

console.log(`  ✅ ${BUNDLE_NAME} criado (${sizeMB} MB)`);

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📤 PRÓXIMOS PASSOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Envie o bundle para o servidor:

   scp ${BUNDLE_NAME} usuario@digitalbordados.com.br:~/

2. Acesse o servidor via SSH:

   ssh usuario@digitalbordados.com.br

3. Extraia o bundle na pasta da aplicação:

   cd ~/digitalbordados
   tar -xzf ~/${BUNDLE_NAME}

4. Se o package.json mudou, instale dependências:

   npm install --omit=dev --no-audit --no-fund

5. Reinicie a aplicação pelo painel DirectAdmin.

6. Verifique:

   curl -I https://digitalbordados.com.br/api/health

7. Limpe o bundle (opcional):

   rm ~/${BUNDLE_NAME}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
