/**
 * migrar-zips-sftp.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * Baixa os 929 ZIPs de produtos do servidor remoto via SFTP (ssh2).
 * Suporta autenticação por USUÁRIO + SENHA.
 * Downloads em paralelo (configurável) para máxima velocidade.
 *
 * MODO TESTE  (padrão): mapeia e valida tudo, NÃO baixa nada.
 * MODO CÓPIA  (--copy): executa os downloads reais.
 *
 * Uso:
 *   node scripts/migrar-zips-sftp.cjs              → modo teste
 *   node scripts/migrar-zips-sftp.cjs --copy       → download real
 *
 * Credenciais: defina as variáveis de ambiente antes de rodar:
 *   $env:SSH_HOST     = "novo.digitalbordados.com.br"
 *   $env:SSH_USER     = "digitalbordados"
 *   $env:SSH_PASS     = "sua_senha_aqui"
 *   $env:SSH_PORT     = "22"   (opcional, padrão 22)
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const { Client } = require('ssh2');

// ──────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ──────────────────────────────────────────────────────────────

const SSH_HOST    = process.env.SSH_HOST || 'novo.digitalbordados.com.br';
const SSH_USER    = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS    = process.env.SSH_PASS || '';      // OBRIGATÓRIO em modo --copy
const SSH_PORT    = parseInt(process.env.SSH_PORT || '22', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10); // downloads simultâneos

// Pasta remota base
const REMOTE_BASE = '/home/digitalbordados/domains/novo.digitalbordados.com.br/public_html/wp-content/uploads/woocommerce_uploads';

// Destino local
const DEST_DIR = path.resolve(__dirname, '..', 'uploads', 'arquivos');

// CSV de produtos
const CSV_PATH = 'C:\\Users\\Adriano Amorim\\Downloads\\produtos (2).csv';

// Modo
const DO_COPY = process.argv.includes('--copy');

// ──────────────────────────────────────────────────────────────
// PARSE CSV
// ──────────────────────────────────────────────────────────────

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

function urlToRemotePath(filePathUrl) {
  const m = filePathUrl.match(/woocommerce_uploads(\/.*\.zip)/i);
  return m ? REMOTE_BASE + m[1] : null;
}

// ──────────────────────────────────────────────────────────────
// LÊ CSV
// ──────────────────────────────────────────────────────────────

console.log(`\n📄 Lendo CSV: ${CSV_PATH}`);
const csvText  = fs.readFileSync(CSV_PATH, 'utf8');
const produtos = parseCsv(csvText);
const lista    = produtos
  .filter(p => { const fp = (p['file_path']||'').trim(); return fp && fp.includes('woocommerce_uploads') && fp.endsWith('.zip'); })
  .map(p => {
    const fp        = p['file_path'].trim();
    const zipNome   = path.basename(fp.split('?')[0]);
    const remotePath = urlToRemotePath(fp);
    const destPath  = path.join(DEST_DIR, zipNome);
    return { id: p['ID']||'', titulo: p['post_title']||'', zipNome, remotePath, destPath, fp };
  });

console.log(`   → ${produtos.length} linhas | ${lista.length} com ZIP\n`);

// ──────────────────────────────────────────────────────────────
// MODO TESTE
// ──────────────────────────────────────────────────────────────

if (!DO_COPY) {
  // Separa em: já existem no destino / pendentes / inválidos
  const jaExistem = lista.filter(p => fs.existsSync(p.destPath));
  const pendentes  = lista.filter(p => !fs.existsSync(p.destPath) && p.remotePath);
  const invalidos  = lista.filter(p => !p.remotePath);

  const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function writeCsv(fp, headers, rows) {
    const lines = [headers.join(';')];
    for (const r of rows) lines.push(headers.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(';'));
    fs.writeFileSync(fp, '\uFEFF' + lines.join('\n'), 'utf8');
  }

  const fOk  = path.join(REPORT_DIR, `relatorio_ja_existentes_${ts}.csv`);
  const fPend = path.join(REPORT_DIR, `relatorio_pendentes_download_${ts}.csv`);

  writeCsv(fOk,   ['id','titulo','zipNome','destPath'], jaExistem);
  writeCsv(fPend, ['id','titulo','zipNome','remotePath','destPath'], pendentes);

  console.log('═'.repeat(65));
  console.log('  MODO: 🧪 TESTE (sem download)');
  console.log('═'.repeat(65));
  console.log(`  Total de produtos com ZIP     : ${lista.length}`);
  console.log(`  ✅ Já existem no destino      : ${jaExistem.length}`);
  console.log(`  📥 Pendentes (precisam baixar): ${pendentes.length}`);
  console.log(`  ❌ URL inválida               : ${invalidos.length}`);
  console.log('═'.repeat(65));
  console.log(`\n📊 Relatórios em: ${REPORT_DIR}`);
  console.log(`   → ${path.basename(fOk)}`);
  console.log(`   → ${path.basename(fPend)}`);

  // Exibe os primeiros 5 remotes como exemplo
  if (pendentes.length > 0) {
    console.log('\n📋 Exemplos de caminhos remotos a baixar:');
    pendentes.slice(0, 5).forEach(p => console.log(`   ${p.remotePath}`));
    if (pendentes.length > 5) console.log(`   ... e mais ${pendentes.length - 5}`);
  }

  console.log('\n💡 Para executar o download real, configure e rode:');
  console.log('   $env:SSH_PASS = "sua_senha"');
  console.log('   node scripts/migrar-zips-sftp.cjs --copy');
  console.log('\n✔ Concluído.\n');
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────
// MODO CÓPIA — DOWNLOAD VIA SFTP
// ──────────────────────────────────────────────────────────────

if (!SSH_PASS) {
  console.error('\n❌ ERRO: Defina a senha SSH antes de rodar:');
  console.error('   $env:SSH_PASS = "sua_senha_aqui"');
  console.error('   node scripts/migrar-zips-sftp.cjs --copy\n');
  process.exit(1);
}

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`📁 Pasta de destino criada: ${DEST_DIR}`);
}

// Separa pendentes (não existem ainda)
const pendentes = lista.filter(p => !fs.existsSync(p.destPath) && p.remotePath);
const jaExistem = lista.filter(p => fs.existsSync(p.destPath));

console.log(`🚀 MODO CÓPIA REAL (SFTP)`);
console.log(`   Servidor : ${SSH_HOST}:${SSH_PORT}`);
console.log(`   Usuário  : ${SSH_USER}`);
console.log(`   Paralelo : ${CONCURRENCY} conexões simultâneas`);
console.log(`   Já existem: ${jaExistem.length} | A baixar: ${pendentes.length}\n`);

const resultOk    = [...jaExistem.map(p => ({...p, status: 'JÁ EXISTIA'}))];
const resultErros = [];
let   baixados    = 0;
let   erros       = 0;
const inicio      = Date.now();

// ── Cria uma conexão SFTP e baixa um arquivo ──
function baixarArquivo(item) {
  return new Promise((resolve) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          resultErros.push({...item, erro: err.message, status: 'ERRO_SFTP'});
          erros++;
          conn.end();
          return resolve();
        }

        const ws = fs.createWriteStream(item.destPath);

        sftp.fastGet(item.remotePath, item.destPath, {
          concurrency: 1,
          chunkSize: 32768,
          step: () => {} // silencia progresso por arquivo
        }, (err2) => {
          if (err2) {
            // Remove arquivo parcial
            try { fs.unlinkSync(item.destPath); } catch (_) {}
            resultErros.push({...item, erro: err2.message, status: 'ERRO_DOWNLOAD'});
            erros++;
          } else {
            resultOk.push({...item, status: 'BAIXADO'});
            baixados++;
          }
          ws.destroy();
          conn.end();
          resolve();
        });
      });
    });

    conn.on('error', (err) => {
      resultErros.push({...item, erro: err.message, status: 'ERRO_CONEXAO'});
      erros++;
      resolve();
    });

    conn.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      password: SSH_PASS,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    });
  });
}

// ── Pool de concorrência ──
async function runPool(items, concurrency) {
  const total    = items.length;
  let   idx      = 0;
  let   concAtual = 0;

  function barraProgresso() {
    const done    = baixados + erros;
    const pct     = total === 0 ? 100 : Math.round((done / total) * 100);
    const elapsed = ((Date.now() - inicio) / 1000).toFixed(0);
    const bar     = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`\r  [${bar}] ${pct}% | ✅ ${baixados} baixados | ❌ ${erros} erros | ⏱ ${elapsed}s`);
  }

  return new Promise((resolve) => {
    function next() {
      if (idx >= items.length && concAtual === 0) {
        process.stdout.write('\n');
        resolve();
        return;
      }
      while (concAtual < concurrency && idx < items.length) {
        const item = items[idx++];
        concAtual++;
        baixarArquivo(item).then(() => {
          concAtual--;
          barraProgresso();
          next();
        });
      }
    }
    next();
    // Mostra progresso imediatamente
    barraProgresso();
  });
}

// ── Executa ──
(async () => {
  await runPool(pendentes, CONCURRENCY);

  // Relatórios
  const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function writeCsv(fp, headers, rows) {
    const lines = [headers.join(';')];
    for (const r of rows) lines.push(headers.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(';'));
    fs.writeFileSync(fp, '\uFEFF' + lines.join('\n'), 'utf8');
  }

  const fOk  = path.join(REPORT_DIR, `relatorio_zips_ok_copia_${ts}.csv`);
  const fErr = path.join(REPORT_DIR, `relatorio_zips_erros_copia_${ts}.csv`);

  writeCsv(fOk, ['id','titulo','zipNome','remotePath','destPath','status'], resultOk);
  if (resultErros.length > 0) {
    writeCsv(fErr, ['id','titulo','zipNome','remotePath','destPath','erro','status'], resultErros);
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(65));
  console.log('  RESULTADO FINAL');
  console.log('═'.repeat(65));
  console.log(`  Total de produtos com ZIP     : ${lista.length}`);
  console.log(`  ✅ Já existiam no destino     : ${jaExistem.length}`);
  console.log(`  📥 Baixados com sucesso       : ${baixados}`);
  console.log(`  ❌ Erros durante download     : ${erros}`);
  console.log(`  ⏱  Tempo total               : ${duracao}s`);
  console.log('═'.repeat(65));
  console.log(`\n📊 Relatórios em: ${REPORT_DIR}`);
  console.log(`   → ${path.basename(fOk)}`);
  if (resultErros.length > 0) console.log(`   → ${path.basename(fErr)}`);
  console.log('\n✔ Concluído.\n');
})();
