#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const startup = args.has('--startup');

const checks = [];

function addCheck(ok, title, detail) {
  checks.push({ ok, title, detail });
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getNodeMajor() {
  const major = Number(String(process.versions.node).split('.')[0]);
  return Number.isFinite(major) ? major : 0;
}

function checkNodeVersion() {
  const major = getNodeMajor();
  const ok = major === 20;
  addCheck(
    ok,
    'Node.js 20 LTS',
    `Atual: ${process.versions.node}. Esperado: 20.x para produção no DirectAdmin.`,
  );
}

function checkCoreJsCompat() {
  try {
    const resolved = require.resolve('babel-runtime/core-js/symbol/iterator');
    addCheck(true, 'Compatibilidade babel-runtime/core-js', `Resolvido: ${resolved}`);
  } catch (error) {
    addCheck(false, 'Compatibilidade babel-runtime/core-js', `Falha ao resolver: ${error?.message || error}`);
  }
}

function checkSyncMysql2() {
  try {
    const resolved = require.resolve('sync-mysql2');
    addCheck(true, 'sync-mysql2 resolvido', `Resolvido: ${resolved}`);
  } catch (error) {
    addCheck(false, 'sync-mysql2 resolvido', `Falha ao resolver: ${error?.message || error}`);
  }
}

function checkPackageJson() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = readJson(pkgPath);
  if (!pkg) {
    addCheck(false, 'package.json válido', 'Arquivo package.json não pôde ser lido.');
    return;
  }

  const hasBuild = Boolean(pkg?.scripts?.build);
  const hasServerBuild = Boolean(pkg?.scripts?.['build:server']);
  const hasStart = String(pkg?.scripts?.start || '').includes('dist/server.cjs');
  addCheck(hasBuild && hasServerBuild && hasStart, 'Scripts de build/start', `build=${hasBuild}, build:server=${hasServerBuild}, start->dist/server.cjs=${hasStart}`);
}

function checkStartupArtifacts() {
  const distDir = path.resolve(process.cwd(), 'dist');
  const startupFile = path.resolve(distDir, 'server.cjs');
  const serverJs = path.resolve(distDir, 'server.js');
  const ok = exists(startupFile) && exists(serverJs);
  addCheck(ok, 'Artefatos de startup', `dist/server.cjs=${exists(startupFile)}, dist/server.js=${exists(serverJs)}`);
}

function checkEnvEssentials() {
  const required = ['JWT_SECRET', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());
  addCheck(missing.length === 0, 'Variáveis essenciais', missing.length ? `Faltando: ${missing.join(', ')}` : 'Todas presentes');
}

function run() {
  checkNodeVersion();
  checkPackageJson();
  checkCoreJsCompat();
  checkSyncMysql2();

  if (startup) {
    checkStartupArtifacts();
    checkEnvEssentials();
  }

  const failCount = checks.filter((c) => !c.ok).length;
  const warnCount = failCount;

  for (const c of checks) {
    const icon = c.ok ? 'OK' : 'FALHA';
    // eslint-disable-next-line no-console
    console.log(`[${icon}] ${c.title} - ${c.detail}`);
  }

  // eslint-disable-next-line no-console
  console.log(`Resumo: ${checks.length} checks, ${warnCount} falhas.`);

  if (strict && failCount > 0) {
    process.exit(1);
  }
}

run();
