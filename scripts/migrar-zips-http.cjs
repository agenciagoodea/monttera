/**
 * migrar-zips-http.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * Baixa os ZIPs de produtos diretamente pelas URLs públicas do WordPress.
 * Funciona mesmo quando SSH/SFTP não está acessível (ex: servidor com Cloudflare).
 *
 * Os arquivos woocommerce_uploads são PROTEGIDOS pelo WooCommerce, mas como
 * temos acesso direto ao servidor, podemos:
 *   1. Primeiro tentamos baixar diretamente (às vezes funciona)
 *   2. Se falhar, usamos o script PHP helper no servidor para servir o arquivo
 *
 * Uso:
 *   node scripts/migrar-zips-http.cjs              → modo teste
 *   node scripts/migrar-zips-http.cjs --copy       → download real
 *
 * Para download com autenticação básica (caso os arquivos sejam protegidos):
 *   $env:WP_USER = "usuario_wp"
 *   $env:WP_PASS = "senha_app_wp"
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const http       = require('http');
const { URL }    = require('url');

// ─── Config ───────────────────────────────────────────────────
const CSV_PATH    = 'C:\\Users\\Adriano Amorim\\Downloads\\produtos (2).csv';
const DEST_DIR    = path.resolve(__dirname, '..', 'uploads', 'arquivos');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const DO_COPY     = process.argv.includes('--copy');

// Credenciais WP (opcional, para woocommerce_uploads protegidos)
const WP_USER = process.env.WP_USER || '';
const WP_PASS = process.env.WP_PASS || '';

// ─── Parse CSV ────────────────────────────────────────────────
function parseCsv(text) {
  const rows = []; let header = null; let i = 0; const len = text.length;
  function readField() {
    if (i >= len) return '';
    if (text[i] === '"') {
      i++;
      let v = '';
      while (i < len) {
        if (text[i] === '"') { if (text[i+1] === '"') { v += '"'; i += 2; continue; } i++; break; }
        v += text[i++];
      }
      return v;
    }
    let v = '';
    while (i < len && text[i] !== ';' && text[i] !== '\n') v += text[i++];
    return v.replace(/\r$/, '');
  }
  function readLine() {
    const f = [];
    while (i < len) {
      f.push(readField());
      if (i >= len || text[i] === '\n') { i++; break; }
      if (text[i] === ';') i++;
    }
    return f;
  }
  while (i < len) {
    const f = readLine();
    if (!f.length || (f.length === 1 && f[0] === '')) continue;
    if (!header) {
      if (f[0].charCodeAt(0) === 0xFEFF) f[0] = f[0].slice(1);
      header = f.map(x => x.trim()); continue;
    }
    const o = {}; header.forEach((c, ix) => { o[c] = (f[ix] || '').trim(); }); rows.push(o);
  }
  return rows;
}

// ─── Download HTTP/HTTPS com redirect ─────────────────────────
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const proto  = parsed.protocol === 'https:' ? https : http;

    const opts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  {
        'User-Agent': 'Mozilla/5.0 DigitalBordados-Migrator/1.0',
        ...(WP_USER ? { 'Authorization': 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64') } : {})
      },
      timeout: 60000,
    };

    const req = proto.request(opts, (res) => {
      // Segue redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode === 403 || res.statusCode === 401) {
        return reject(new Error(`HTTP ${res.statusCode} - Acesso negado (arquivo protegido pelo WooCommerce)`));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} - ${res.statusMessage}`));
      }

      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => resolve());
      ws.on('error', (e) => { try { fs.unlinkSync(destPath); } catch(_) {} reject(e); });
      res.on('error', (e) => { try { fs.unlinkSync(destPath); } catch(_) {} reject(e); });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout (60s)')); });
    req.end();
  });
}

// ─── Lê CSV ───────────────────────────────────────────────────
console.log(`\n📄 Lendo CSV: ${CSV_PATH}`);
const csvText  = fs.readFileSync(CSV_PATH, 'utf8');
const produtos = parseCsv(csvText);
const lista    = produtos
  .filter(p => {
    const fp = (p['file_path'] || '').trim();
    return fp && fp.includes('woocommerce_uploads') && fp.endsWith('.zip');
  })
  .map(p => {
    const fp      = p['file_path'].trim();
    const zipNome = path.basename(fp.split('?')[0]);
    return {
      id:       p['ID'] || '',
      titulo:   p['post_title'] || '',
      zipNome,
      url:      fp,
      destPath: path.join(DEST_DIR, zipNome),
    };
  });

console.log(`   → ${produtos.length} linhas | ${lista.length} com ZIP\n`);

// ─── Modo Teste ───────────────────────────────────────────────
if (!DO_COPY) {
  const jaExistem = lista.filter(p => fs.existsSync(p.destPath));
  const pendentes = lista.filter(p => !fs.existsSync(p.destPath));

  const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function writeCsv(fp, hdr, rows) {
    fs.writeFileSync(fp, '\uFEFF' + [hdr.join(';'), ...rows.map(r => hdr.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(';'))].join('\n'), 'utf8');
  }

  writeCsv(path.join(REPORT_DIR, `pendentes_http_${ts}.csv`), ['id','titulo','zipNome','url','destPath'], pendentes);

  console.log('═'.repeat(65));
  console.log('  MODO: 🧪 TESTE (sem download)');
  console.log('═'.repeat(65));
  console.log(`  Total produtos com ZIP : ${lista.length}`);
  console.log(`  ✅ Já existem          : ${jaExistem.length}`);
  console.log(`  📥 Pendentes           : ${pendentes.length}`);
  console.log('═'.repeat(65));
  console.log('\n📋 Exemplos de URLs a baixar:');
  pendentes.slice(0, 5).forEach(p => console.log(`   ${p.url}`));

  console.log('\n💡 Para executar o download real:');
  console.log('   node scripts/migrar-zips-http.cjs --copy');
  console.log('\n✔ Concluído.\n');
  process.exit(0);
}

// ─── Modo Cópia ───────────────────────────────────────────────
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`📁 Pasta criada: ${DEST_DIR}`);
}

const pendentes  = lista.filter(p => !fs.existsSync(p.destPath));
const jaExistem  = lista.filter(p =>  fs.existsSync(p.destPath));
const resultOk   = [...jaExistem.map(p => ({...p, status: 'JÁ EXISTIA'}))];
const resultErro = [];
let baixados = 0, erros = 0;
const inicio = Date.now();

console.log('🚀 MODO DOWNLOAD REAL (HTTP direto das URLs do CSV)');
console.log(`   Paralelo : ${CONCURRENCY} | Já existem: ${jaExistem.length} | A baixar: ${pendentes.length}\n`);

function barra() {
  const done = baixados + erros;
  const tot  = pendentes.length;
  const pct  = tot === 0 ? 100 : Math.round((done / tot) * 100);
  const bar  = '█'.repeat(Math.floor(pct/5)) + '░'.repeat(20 - Math.floor(pct/5));
  const seg  = ((Date.now() - inicio) / 1000).toFixed(0);
  process.stdout.write(`\r  [${bar}] ${pct}% | ✅ ${baixados} | ❌ ${erros} | ⏱ ${seg}s`);
}

async function runPool(items, conc) {
  let idx = 0, ativo = 0;
  return new Promise((resolve) => {
    function next() {
      if (idx >= items.length && ativo === 0) { process.stdout.write('\n'); resolve(); return; }
      while (ativo < conc && idx < items.length) {
        const item = items[idx++]; ativo++;
        downloadFile(item.url, item.destPath)
          .then(() => { resultOk.push({...item, status: 'BAIXADO'}); baixados++; })
          .catch(e  => { try { fs.unlinkSync(item.destPath); } catch(_){} resultErro.push({...item, status: 'ERRO', erro: e.message}); erros++; })
          .finally(() => { ativo--; barra(); next(); });
      }
    }
    next(); barra();
  });
}

(async () => {
  await runPool(pendentes, CONCURRENCY);

  const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function writeCsv(fp, hdr, rows) {
    fs.writeFileSync(fp, '\uFEFF' + [hdr.join(';'), ...rows.map(r => hdr.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(';'))].join('\n'), 'utf8');
  }

  const fOk  = path.join(REPORT_DIR, `zips_ok_http_${ts}.csv`);
  const fErr = path.join(REPORT_DIR, `zips_erro_http_${ts}.csv`);
  writeCsv(fOk, ['id','titulo','zipNome','url','destPath','status'], resultOk);
  if (resultErro.length) writeCsv(fErr, ['id','titulo','zipNome','url','destPath','status','erro'], resultErro);

  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(65));
  console.log(`  Total : ${lista.length} | ✅ Baixados: ${baixados} | Já existiam: ${jaExistem.length} | ❌ Erros: ${erros}`);
  console.log(`  ⏱ Tempo: ${dur}s`);
  console.log('═'.repeat(65));
  console.log(`\n📊 Relatórios: ${REPORT_DIR}`);

  if (resultErro.length > 0) {
    console.log(`\n⚠️  ${erros} arquivos falharam (protegidos pelo WooCommerce).`);
    console.log('   Para baixar arquivos protegidos, precisamos de uma solução via servidor.');
    console.log('   Verifique: relatorios_migracao/' + path.basename(fErr));
  }

  console.log('\n✔ Concluído.\n');
})();
