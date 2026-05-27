#!/usr/bin/env node
/**
 * Script: check-db-structure.cjs
 * Verificar estrutura das tabelas products e product_files (via SSH + Node lendo .env)
 */

const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

// Script que carrega o .env via fs diretamente (sem depender do shell)
const REMOTE_SCRIPT = `
const fs = require('fs');
const path = require('path');

// Carregar .env manualmente
const envPath = path.resolve('/home/digitalbordados/digitalbordados/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.substring(0, eqIdx).trim();
  let val = trimmed.substring(eqIdx + 1).trim();
  // Remover aspas ao redor do valor
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10)
  });
  console.log('Conectado ao banco!');

  // Colunas da tabela products
  const [cols] = await conn.execute('DESCRIBE products');
  console.log('=== COLUNAS DE products ===');
  for (const c of cols) {
    console.log(' -', c.Field, '|', c.Type);
  }

  // Colunas da tabela product_files
  const [cols2] = await conn.execute('DESCRIBE product_files');
  console.log('');
  console.log('=== COLUNAS DE product_files ===');
  for (const c of cols2) {
    console.log(' -', c.Field, '|', c.Type);
  }

  const [[cnt]] = await conn.execute('SELECT COUNT(*) as total FROM products');
  console.log('');
  console.log('Total de produtos:', cnt.total);

  const [[cnt2]] = await conn.execute('SELECT COUNT(*) as total FROM product_files');
  console.log('Total de product_files:', cnt2.total);

  const [[cnt3]] = await conn.execute('SELECT COUNT(DISTINCT product_id) as total FROM product_files');
  console.log('Produtos distintos com product_files:', cnt3.total);

  const [sample] = await conn.execute('SELECT * FROM product_files LIMIT 3');
  console.log('');
  console.log('=== AMOSTRA product_files ===');
  for (const r of sample) console.log(JSON.stringify(r));

  const [sampleP] = await conn.execute('SELECT * FROM products LIMIT 2');
  console.log('');
  console.log('=== AMOSTRA products ===');
  for (const r of sampleP) console.log(JSON.stringify(r));

  await conn.end();
}
run().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
`;

function runSSHCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (d) => { output += d.toString(); process.stdout.write(d.toString()); });
      stream.stderr.on('data', (d) => { process.stderr.write(d.toString()); });
      stream.on('close', (code) => resolve({ code, output }));
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('SSH conectado.\n');
  try {
    const rp = '/home/digitalbordados/digitalbordados/scripts/_struct_temp.cjs';
    // Usar base64 para evitar problemas de escape
    const b64 = Buffer.from(REMOTE_SCRIPT).toString('base64');
    await runSSHCommand(conn, `echo '${b64}' | base64 -d > ${rp}`);
    await runSSHCommand(conn, `cd /home/digitalbordados/digitalbordados && node ${rp} 2>&1`);
    await runSSHCommand(conn, `rm -f ${rp}`);
  } catch(e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
