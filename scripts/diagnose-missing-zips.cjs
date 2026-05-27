const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  console.log('Conectando ao banco de dados...');

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  console.log('Conectado!');

  // ============================================================
  // 1. BUSCAR TODOS OS PRODUTOS
  // ============================================================
  const [products] = await connection.query(`
    SELECT id, name, status, price, production_sheet
    FROM products
    ORDER BY id ASC
  `);

  // ============================================================
  // 2. BUSCAR TODOS OS product_files
  // ============================================================
  const [productFiles] = await connection.query(`
    SELECT id as file_id, product_id, file_name, file_path, file_type
    FROM product_files
    ORDER BY product_id ASC
  `);

  await connection.end();
  console.log('Banco encerrado.');
  console.log('Total de produtos:', products.length);
  console.log('Total de registros product_files:', productFiles.length);

  // ============================================================
  // 3. LER ARQUIVOS FÍSICOS
  // ============================================================
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'arquivos');
  const lixoDir = path.resolve(uploadsDir, 'lixo');

  let physicalFiles = [];
  let lixoFiles = [];

  try {
    physicalFiles = fs.readdirSync(uploadsDir).filter(f => {
      const fp = path.join(uploadsDir, f);
      return fs.statSync(fp).isFile();
    });
  } catch (e) { console.error('Erro ao ler uploads/arquivos:', e.message); }

  try {
    lixoFiles = fs.readdirSync(lixoDir).filter(f => {
      const fp = path.join(lixoDir, f);
      return fs.statSync(fp).isFile();
    });
  } catch (e) {}

  const physicalSet = new Set(physicalFiles.map(f => f.toLowerCase()));
  const lixoSet    = new Set(lixoFiles.map(f => f.toLowerCase()));

  console.log('Arquivos físicos em uploads/arquivos:', physicalFiles.length);
  console.log('Arquivos físicos em uploads/arquivos/lixo:', lixoFiles.length);

  // ============================================================
  // 4. MAPEAR product_files POR PRODUTO
  // ============================================================
  const filesByProduct = {};
  for (const pf of productFiles) {
    if (!filesByProduct[pf.product_id]) filesByProduct[pf.product_id] = [];
    filesByProduct[pf.product_id].push(pf);
  }

  // Função auxiliar para extrair nome do arquivo de um path/url
  function extractBaseName(rawPath) {
    if (!rawPath) return null;
    const clean = String(rawPath).trim();
    if (!clean) return null;
    let p = clean;
    if (/^https?:\/\//i.test(p)) {
      try { p = new URL(p).pathname; } catch {}
    }
    const base = path.basename(p);
    return (base && base !== '.' && base !== '..') ? base : null;
  }

  // ============================================================
  // 5. ANALISAR CADA PRODUTO
  // ============================================================
  const results = {
    ok: [],
    lixo: [],
    missing: [],
    not_found: [],
    only_production_sheet: []
  };

  for (const prod of products) {
    const pfiles = filesByProduct[prod.id] || [];
    const hasProductFiles = pfiles.length > 0;
    const sheetBase = extractBaseName(prod.production_sheet);
    const hasSheet = !!sheetBase;

    // Produto sem nenhum tipo de arquivo
    if (!hasProductFiles && !hasSheet) {
      results.missing.push({
        id: prod.id, name: prod.name, status: prod.status,
        issue: 'Sem product_files E sem production_sheet'
      });
      continue;
    }

    let hasIssue = false;

    // Verificar product_files
    for (const pf of pfiles) {
      const fname = extractBaseName(pf.file_path) || extractBaseName(pf.file_name);
      if (!fname) {
        results.not_found.push({
          id: prod.id, name: prod.name, status: prod.status,
          file_id: pf.file_id, file_name: '(vazio)', file_path: pf.file_path || '',
          issue: 'file_path e file_name vazios em product_files'
        });
        hasIssue = true;
        continue;
      }
      const fl = fname.toLowerCase();
      if (lixoSet.has(fl)) {
        results.lixo.push({
          id: prod.id, name: prod.name, status: prod.status,
          file_name: fname, file_path: pf.file_path || '',
          issue: 'Arquivo movido para LIXO — PRODUTO ATIVO SEM ACESSO AO ARQUIVO!'
        });
        hasIssue = true;
      } else if (!physicalSet.has(fl)) {
        results.not_found.push({
          id: prod.id, name: prod.name, status: prod.status,
          file_name: fname, file_path: pf.file_path || '',
          issue: 'Arquivo não encontrado fisicamente (nem no lixo)'
        });
        hasIssue = true;
      }
    }

    // Verificar production_sheet (legado)
    if (hasSheet && !hasProductFiles) {
      const fl = sheetBase.toLowerCase();
      const exists = physicalSet.has(fl);
      const inLixo = lixoSet.has(fl);
      results.only_production_sheet.push({
        id: prod.id, name: prod.name, status: prod.status,
        production_sheet: prod.production_sheet,
        file_name: sheetBase,
        exists, in_lixo: inLixo,
        issue: inLixo ? 'Arquivo na PASTA LIXO' : (!exists ? 'Arquivo não encontrado' : null)
      });
      if (inLixo || !exists) hasIssue = true;
    }

    if (!hasIssue) results.ok.push(prod.id);
  }

  // ============================================================
  // 6. GERAR RELATÓRIO MARKDOWN
  // ============================================================
  const lines = [];
  const now = new Date().toLocaleString('pt-BR');

  lines.push('# Diagnóstico: Produtos x Arquivos ZIP');
  lines.push('');
  lines.push(`**Data:** ${now}`);
  lines.push(`**Total de produtos cadastrados:** ${results.ok.length + results.lixo.length + results.missing.length + results.not_found.length + results.only_production_sheet.length}`);
  lines.push(`**Arquivos físicos em /uploads/arquivos:** ${physicalFiles.length}`);
  lines.push(`**Arquivos na pasta /lixo:** ${lixoFiles.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push('| Situação | Qtd |');
  lines.push('|---|---|');
  lines.push(`| ✅ Produtos com arquivo OK | **${results.ok.length}** |`);
  lines.push(`| 🗑️ Arquivo movido para LIXO (produto ativo!) | **${results.lixo.length}** |`);
  lines.push(`| ❌ Produto sem nenhum arquivo vinculado | **${results.missing.length}** |`);
  lines.push(`| ⚠️ Arquivo vinculado mas NÃO encontrado | **${results.not_found.length}** |`);
  lines.push(`| 📁 Produto usa production_sheet legado | **${results.only_production_sheet.length}** |`);
  lines.push('');

  // LIXO
  lines.push('---');
  lines.push('');
  lines.push(`## 🗑️ Arquivos na pasta LIXO - PRODUTO ATIVO (${results.lixo.length})`);
  lines.push('');
  lines.push('> ⚠️ AÇÃO NECESSÁRIA: Restaurar esses arquivos de volta para /uploads/arquivos');
  lines.push('');
  lines.push('| ID | Nome do Produto | Status | Arquivo | Caminho no Banco |');
  lines.push('|---|---|---|---|---|');
  for (const p of results.lixo) {
    lines.push(`| ${p.id} | ${p.name} | ${p.status} | \`${p.file_name}\` | ${p.file_path} |`);
  }
  if (results.lixo.length === 0) lines.push('*(nenhum — nenhum arquivo ativo foi para o lixo)*');
  lines.push('');

  // MISSING
  lines.push('---');
  lines.push('');
  lines.push(`## ❌ Produtos sem nenhum arquivo vinculado (${results.missing.length})`);
  lines.push('');
  lines.push('| ID | Nome | Status | Problema |');
  lines.push('|---|---|---|---|');
  for (const p of results.missing) {
    lines.push(`| ${p.id} | ${p.name} | ${p.status} | ${p.issue} |`);
  }
  if (results.missing.length === 0) lines.push('*(nenhum)*');
  lines.push('');

  // NOT FOUND
  lines.push('---');
  lines.push('');
  lines.push(`## ⚠️ Arquivo vinculado mas não encontrado fisicamente (${results.not_found.length})`);
  lines.push('');
  lines.push('| ID | Nome | Status | Arquivo | Caminho | Problema |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of results.not_found) {
    lines.push(`| ${p.id} | ${p.name} | ${p.status} | \`${p.file_name}\` | ${p.file_path} | ${p.issue} |`);
  }
  if (results.not_found.length === 0) lines.push('*(nenhum)*');
  lines.push('');

  // PRODUCTION_SHEET LEGADO
  lines.push('---');
  lines.push('');
  lines.push(`## 📁 Produtos com production_sheet legado (${results.only_production_sheet.length})`);
  lines.push('');
  lines.push('| ID | Nome | Status | Arquivo | Existe? | No Lixo? | Problema |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const p of results.only_production_sheet) {
    lines.push(`| ${p.id} | ${p.name} | ${p.status} | \`${p.file_name}\` | ${p.exists ? '✅' : '❌'} | ${p.in_lixo ? '🗑️' : 'Não'} | ${p.issue || 'OK'} |`);
  }
  if (results.only_production_sheet.length === 0) lines.push('*(nenhum)*');

  const md = lines.join('\n');
  const mdPath = path.join(process.cwd(), 'diagnostico_produtos_zips.md');
  const jsonPath = path.join(process.cwd(), 'diagnostico_produtos_zips.json');

  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  console.log('');
  console.log('='.repeat(60));
  console.log('DIAGNÓSTICO CONCLUÍDO');
  console.log('='.repeat(60));
  console.log(`✅  Com arquivo OK:             ${results.ok.length}`);
  console.log(`🗑️  Arquivo no LIXO (ativo):    ${results.lixo.length}`);
  console.log(`❌  Sem nenhum arquivo:         ${results.missing.length}`);
  console.log(`⚠️  Arquivo não encontrado:     ${results.not_found.length}`);
  console.log(`📁  Usa production_sheet legado:${results.only_production_sheet.length}`);
  console.log('='.repeat(60));
  console.log('Relatórios salvos:');
  console.log(' -', mdPath);
  console.log(' -', jsonPath);
}

run().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
