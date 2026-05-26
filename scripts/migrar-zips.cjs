/**
 * migrar-zips.cjs
 * ---------------------------------------------------------------
 * Lê o CSV de produtos e tenta localizar cada ZIP nas pastas
 * woocommerce_uploads existentes em D:\www\*\wp-content\uploads\woocommerce_uploads
 *
 * MODO TESTE  (padrão): apenas lista e gera relatórios CSV, NÃO copia nada.
 * MODO CÓPIA  (--copy):  efetua a cópia real para uploads/arquivos/
 *
 * Uso:
 *   node scripts/migrar-zips.cjs              → modo teste
 *   node scripts/migrar-zips.cjs --copy       → modo cópia real
 * ---------------------------------------------------------------
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ──────────────────────────────────────────────────────────────

// Arquivo CSV principal
const CSV_PATH = 'C:\\Users\\Adriano Amorim\\Downloads\\produtos (2).csv';

// Pasta destino onde os ZIPs devem ficar
const DEST_DIR = path.resolve(__dirname, '..', 'uploads', 'arquivos');

// Todas as pastas woocommerce_uploads encontradas em D:\www
const SEARCH_ROOTS = [
  'D:\\www\\agenciagoodea\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\atacadaonalin\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\auaufaville\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\conecta\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\encontro\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\escoladelideres\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\fegb\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\goodeashop\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\guiacomercial\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\guiagoogdea\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\jctecsat\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\labratec\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\manausfitas\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\matemativadoamor\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\mavmonitoramento\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\mobsat\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\qgbradock\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\shopgoodea\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\thiago\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\tupaturismo\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\turismo\\wp-content\\uploads\\woocommerce_uploads',
  'D:\\www\\voangelo\\wp-content\\uploads\\woocommerce_uploads',
];

// Modo cópia ou apenas teste
const DO_COPY = process.argv.includes('--copy');

// ──────────────────────────────────────────────────────────────
// ÍNDICE DE ARQUIVOS: varre todos os roots de uma vez e mapeia
//   basename_lowercase → caminho_completo
// ──────────────────────────────────────────────────────────────

console.log('\n🔍 Indexando arquivos ZIP nas pastas de origem...');

/** @type {Map<string, string>} */
const zipIndex = new Map();

/**
 * Varre uma pasta recursivamente e adiciona ZIPs ao índice.
 * @param {string} dir
 */
function indexDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return; // pasta inacessível
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      indexDir(full);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.zip')) {
      const key = e.name.toLowerCase();
      if (!zipIndex.has(key)) {
        zipIndex.set(key, full);
      }
      // se já existe, mantemos o primeiro encontrado
    }
  }
}

for (const root of SEARCH_ROOTS) {
  if (fs.existsSync(root)) {
    indexDir(root);
  }
}

console.log(`   → ${zipIndex.size} ZIPs indexados nas pastas de origem.\n`);

// ──────────────────────────────────────────────────────────────
// PARSE CSV (separador ;  com campos entre aspas duplas)
// ──────────────────────────────────────────────────────────────

/**
 * Parse simples de CSV com separador ;
 * Lida com campos entre aspas duplas contendo quebras de linha e ;
 * Retorna array de objetos com as colunas do header.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
function parseCsv(text) {
  const rows  = [];
  let   header = null;
  let   i = 0;
  const len = text.length;

  // Lê um campo (com ou sem aspas)
  function readField() {
    if (i >= len) return '';
    if (text[i] === '"') {
      // campo entre aspas
      i++; // pula a aspas inicial
      let val = '';
      while (i < len) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { val += '"'; i += 2; continue; }
          i++; break; // fim do campo
        }
        val += text[i++];
      }
      return val;
    } else {
      // campo sem aspas — lê até ; ou \n
      let val = '';
      while (i < len && text[i] !== ';' && text[i] !== '\n') {
        val += text[i++];
      }
      return val.replace(/\r$/, '');
    }
  }

  // Lê uma linha completa → array de campos
  function readLine() {
    const fields = [];
    while (i < len) {
      fields.push(readField());
      if (i >= len || text[i] === '\n') { i++; break; }
      if (text[i] === ';') { i++; }
    }
    return fields;
  }

  while (i < len) {
    const fields = readLine();
    if (!fields.length || (fields.length === 1 && fields[0] === '')) continue;

    if (!header) {
      // Remove BOM se existir
      if (fields[0].charCodeAt(0) === 0xFEFF) {
        fields[0] = fields[0].slice(1);
      }
      header = fields.map(f => f.trim());
      continue;
    }

    const obj = {};
    header.forEach((col, idx) => {
      obj[col] = (fields[idx] || '').trim();
    });
    rows.push(obj);
  }

  return rows;
}

// ──────────────────────────────────────────────────────────────
// LÊ CSV
// ──────────────────────────────────────────────────────────────

console.log(`📄 Lendo CSV: ${CSV_PATH}`);
const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const produtos = parseCsv(csvText);

// Filtra apenas produtos com file_path (ignora variações/sem arquivo)
const comArquivo = produtos.filter(p => {
  const fp = (p['file_path'] || '').trim();
  return fp && fp.includes('woocommerce_uploads') && fp.endsWith('.zip');
});

console.log(`   → ${produtos.length} linhas no CSV.`);
console.log(`   → ${comArquivo.length} produtos com arquivo ZIP definido.\n`);

// ──────────────────────────────────────────────────────────────
// PROCESSA CADA PRODUTO
// ──────────────────────────────────────────────────────────────

if (DO_COPY && !fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`📁 Pasta de destino criada: ${DEST_DIR}\n`);
}

const resultOk         = []; // encontrado (e copiado se --copy)
const resultNaoEncontrado = []; // não encontrado em nenhuma pasta
const resultErros      = []; // erro durante a cópia

let contador = 0;

for (const prod of comArquivo) {
  contador++;
  const id         = prod['ID'] || '';
  const titulo     = prod['post_title'] || '';
  const filePath   = prod['file_path'] || '';

  // Nome oficial do ZIP = basename da URL
  const zipNome    = path.basename(filePath.replace(/\?.*$/, '')); // remove querystring se houver
  const zipNomeLc  = zipNome.toLowerCase();

  // Destino final
  const destPath   = path.join(DEST_DIR, zipNome);

  // Progresso a cada 100 produtos
  if (contador % 100 === 0) {
    process.stdout.write(`\r   processando ${contador}/${comArquivo.length}...`);
  }

  // Verifica se já existe no destino
  if (fs.existsSync(destPath)) {
    resultOk.push({ id, titulo, zipNome, origem: 'JÁ EXISTE NO DESTINO', destino: destPath, status: 'OK' });
    continue;
  }

  // Busca no índice
  const origem = zipIndex.get(zipNomeLc);

  if (!origem) {
    resultNaoEncontrado.push({ id, titulo, zipNome, file_path: filePath });
    continue;
  }

  // Encontrado!
  if (!DO_COPY) {
    // Modo teste: apenas registra
    resultOk.push({ id, titulo, zipNome, origem, destino: destPath, status: 'ENCONTRADO' });
  } else {
    // Modo cópia real
    try {
      fs.copyFileSync(origem, destPath);
      resultOk.push({ id, titulo, zipNome, origem, destino: destPath, status: 'COPIADO' });
    } catch (err) {
      resultErros.push({ id, titulo, zipNome, origem, destino: destPath, erro: err.message });
    }
  }
}

process.stdout.write('\n');

// ──────────────────────────────────────────────────────────────
// RELATÓRIOS
// ──────────────────────────────────────────────────────────────

const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const modo = DO_COPY ? 'copia' : 'teste';

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push(headers.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(';'));
  }
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf8');
}

// Relatório OK
const fileOk = path.join(REPORT_DIR, `relatorio_zips_ok_${modo}_${ts}.csv`);
writeCsv(fileOk, ['id','titulo','zipNome','origem','destino','status'], resultOk);

// Relatório não encontrado
const fileNao = path.join(REPORT_DIR, `relatorio_zips_nao_encontrados_${modo}_${ts}.csv`);
writeCsv(fileNao, ['id','titulo','zipNome','file_path'], resultNaoEncontrado);

// Relatório erros (só existe em modo cópia)
const fileErr = path.join(REPORT_DIR, `relatorio_zips_erros_${modo}_${ts}.csv`);
if (resultErros.length > 0) {
  writeCsv(fileErr, ['id','titulo','zipNome','origem','destino','erro'], resultErros);
}

// ──────────────────────────────────────────────────────────────
// RESUMO
// ──────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  MODO: ${DO_COPY ? '🚀 CÓPIA REAL' : '🧪 TESTE (sem cópia)'}`);
console.log('═'.repeat(60));
console.log(`  Total de produtos com ZIP no CSV : ${comArquivo.length}`);
console.log(`  ✅ Encontrados / já existentes   : ${resultOk.length}`);
console.log(`  ❌ Não encontrados               : ${resultNaoEncontrado.length}`);
console.log(`  ⚠️  Erros durante cópia           : ${resultErros.length}`);
console.log('═'.repeat(60));
console.log(`\n📊 Relatórios gerados em: ${REPORT_DIR}`);
console.log(`   → ${path.basename(fileOk)}`);
console.log(`   → ${path.basename(fileNao)}`);
if (resultErros.length > 0) {
  console.log(`   → ${path.basename(fileErr)}`);
}

if (!DO_COPY && resultNaoEncontrado.length < comArquivo.length) {
  console.log('\n💡 Para executar a cópia real, rode:');
  console.log('   node scripts/migrar-zips.cjs --copy');
}

console.log('\n✔ Concluído.\n');
