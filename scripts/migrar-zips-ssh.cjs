/**
 * migrar-zips-ssh.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * Lê o CSV de produtos e transfere cada ZIP diretamente do servidor remoto
 * via SSH (usando 'scp' ou 'rsync' disponível no sistema).
 *
 * MODO TESTE  (padrão): apenas lista os arquivos a transferir, sem baixar.
 * MODO CÓPIA  (--copy): executa o download real via SCP.
 *
 * Uso:
 *   node scripts/migrar-zips-ssh.cjs              → modo teste
 *   node scripts/migrar-zips-ssh.cjs --copy       → cópia real
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ──────────────────────────────────────────────────────────────
// CONFIGURAÇÕES SSH — ajuste conforme seu acesso
// ──────────────────────────────────────────────────────────────

const SSH_USER = 'digitalbordados';         // usuário SSH
const SSH_HOST = 'novo.digitalbordados.com.br'; // host do servidor
const SSH_PORT = 22;                        // porta SSH (padrão 22)

// Pasta base no servidor remoto onde ficam os woocommerce_uploads
const REMOTE_BASE = '/home/digitalbordados/domains/novo.digitalbordados.com.br/public_html/wp-content/uploads/woocommerce_uploads';

// Pasta destino local onde os ZIPs devem ficar
const DEST_DIR = path.resolve(__dirname, '..', 'uploads', 'arquivos');

// CSV
const CSV_PATH = 'C:\\Users\\Adriano Amorim\\Downloads\\produtos (2).csv';

// Modo cópia
const DO_COPY = process.argv.includes('--copy');

// ──────────────────────────────────────────────────────────────
// PARSE CSV
// ──────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows   = [];
  let   header = null;
  let   i      = 0;
  const len    = text.length;

  function readField() {
    if (i >= len) return '';
    if (text[i] === '"') {
      i++;
      let val = '';
      while (i < len) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { val += '"'; i += 2; continue; }
          i++; break;
        }
        val += text[i++];
      }
      return val;
    } else {
      let val = '';
      while (i < len && text[i] !== ';' && text[i] !== '\n') val += text[i++];
      return val.replace(/\r$/, '');
    }
  }

  function readLine() {
    const fields = [];
    while (i < len) {
      fields.push(readField());
      if (i >= len || text[i] === '\n') { i++; break; }
      if (text[i] === ';') i++;
    }
    return fields;
  }

  while (i < len) {
    const fields = readLine();
    if (!fields.length || (fields.length === 1 && fields[0] === '')) continue;
    if (!header) {
      if (fields[0].charCodeAt(0) === 0xFEFF) fields[0] = fields[0].slice(1);
      header = fields.map(f => f.trim());
      continue;
    }
    const obj = {};
    header.forEach((col, idx) => { obj[col] = (fields[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────
// EXTRAI CAMINHO REMOTO A PARTIR DA URL do file_path
// Exemplo:
//   https://novo.digitalbordados.com.br/wp-content/uploads/woocommerce_uploads/2025/02/abelharainha18cm-jkm9nf.zip
//   → /home/.../woocommerce_uploads/2025/02/abelharainha18cm-jkm9nf.zip
// ──────────────────────────────────────────────────────────────

function urlToRemotePath(filePathUrl) {
  // extrai a parte depois de "woocommerce_uploads"
  const match = filePathUrl.match(/woocommerce_uploads(\/.*\.zip)/i);
  if (!match) return null;
  return REMOTE_BASE + match[1];
}

// ──────────────────────────────────────────────────────────────
// LÊ CSV E FILTRA PRODUTOS COM ZIP
// ──────────────────────────────────────────────────────────────

console.log(`\n📄 Lendo CSV: ${CSV_PATH}`);
const csvText    = fs.readFileSync(CSV_PATH, 'utf8');
const produtos   = parseCsv(csvText);
const comArquivo = produtos.filter(p => {
  const fp = (p['file_path'] || '').trim();
  return fp && fp.includes('woocommerce_uploads') && fp.endsWith('.zip');
});

console.log(`   → ${produtos.length} linhas no CSV`);
console.log(`   → ${comArquivo.length} produtos com arquivo ZIP\n`);

// ──────────────────────────────────────────────────────────────
// PROCESSA CADA PRODUTO
// ──────────────────────────────────────────────────────────────

if (DO_COPY && !fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`📁 Pasta de destino criada: ${DEST_DIR}\n`);
}

const resultOk           = [];
const resultNaoEncontrado = [];
const resultErros        = [];

let contador = 0;

for (const prod of comArquivo) {
  contador++;
  const id       = prod['ID'] || '';
  const titulo   = prod['post_title'] || '';
  const filePath = (prod['file_path'] || '').trim();

  const zipNome    = path.basename(filePath.split('?')[0]);
  const remotePath = urlToRemotePath(filePath);
  const destPath   = path.join(DEST_DIR, zipNome);

  if (contador % 50 === 0) {
    process.stdout.write(`\r   ${contador}/${comArquivo.length} processados...`);
  }

  if (!remotePath) {
    resultNaoEncontrado.push({ id, titulo, zipNome, file_path: filePath, motivo: 'URL inválida' });
    continue;
  }

  // Já existe no destino?
  if (fs.existsSync(destPath)) {
    resultOk.push({ id, titulo, zipNome, remotePath, destPath, status: 'JÁ EXISTE' });
    continue;
  }

  if (!DO_COPY) {
    // Modo teste: apenas registra o que seria copiado
    resultOk.push({ id, titulo, zipNome, remotePath, destPath, status: 'PENDENTE' });
  } else {
    // Modo cópia: usa SCP para baixar o arquivo
    const scpCmd = `scp -P ${SSH_PORT} -o StrictHostKeyChecking=no -o BatchMode=yes "${SSH_USER}@${SSH_HOST}:${remotePath}" "${destPath}"`;
    try {
      execSync(scpCmd, { stdio: 'pipe', timeout: 120000 });
      resultOk.push({ id, titulo, zipNome, remotePath, destPath, status: 'COPIADO' });
    } catch (err) {
      const errMsg = err.stderr?.toString() || err.message || 'erro desconhecido';
      resultErros.push({ id, titulo, zipNome, remotePath, destPath, erro: errMsg.trim() });
    }
  }
}

process.stdout.write('\n');

// ──────────────────────────────────────────────────────────────
// RELATÓRIOS CSV
// ──────────────────────────────────────────────────────────────

const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const modo = DO_COPY ? 'copia' : 'teste';

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push(headers.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(';'));
  }
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf8');
}

const fileOk  = path.join(REPORT_DIR, `relatorio_zips_ok_${modo}_${ts}.csv`);
const fileNao = path.join(REPORT_DIR, `relatorio_zips_nao_encontrados_${modo}_${ts}.csv`);
const fileErr = path.join(REPORT_DIR, `relatorio_zips_erros_${modo}_${ts}.csv`);

writeCsv(fileOk,  ['id','titulo','zipNome','remotePath','destPath','status'], resultOk);
writeCsv(fileNao, ['id','titulo','zipNome','file_path','motivo'], resultNaoEncontrado);
if (resultErros.length > 0) {
  writeCsv(fileErr, ['id','titulo','zipNome','remotePath','destPath','erro'], resultErros);
}

// ──────────────────────────────────────────────────────────────
// RESUMO
// ──────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log(`  MODO: ${DO_COPY ? '🚀 CÓPIA REAL (SSH/SCP)' : '🧪 TESTE (sem transferência)'}`);
console.log('═'.repeat(65));
console.log(`  Total de produtos com ZIP no CSV   : ${comArquivo.length}`);
console.log(`  ✅ Ok (copiados / já existentes)   : ${resultOk.length}`);
console.log(`  ❌ Não mapeáveis (URL inválida)    : ${resultNaoEncontrado.length}`);
console.log(`  ⚠️  Erros durante transferência     : ${resultErros.length}`);
console.log('═'.repeat(65));
console.log(`\n📊 Relatórios em: ${REPORT_DIR}`);

if (!DO_COPY) {
  console.log('\n📋 CONFIGURAÇÕES SSH NECESSÁRIAS:');
  console.log(`   Usuário : ${SSH_USER}`);
  console.log(`   Host    : ${SSH_HOST}`);
  console.log(`   Porta   : ${SSH_PORT}`);
  console.log('\n⚠️  ATENÇÃO: Certifique-se que sua chave SSH está configurada.');
  console.log('   Para executar a cópia real:');
  console.log('   node scripts/migrar-zips-ssh.cjs --copy');
}

console.log('\n✔ Concluído.\n');
