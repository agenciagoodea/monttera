const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getDownloadRoots() {
  const configured = [
    process.env.WOO_UPLOADS_DIR,
    process.env.WOOCOMMERCE_UPLOADS_DIR,
    process.env.DOWNLOADS_BASE_DIR,
    process.env.PROTECTED_DOWNLOADS_DIR,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));

  const defaults = [
    path.resolve(process.cwd(), 'wp-content', 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), '..', 'wp-content', 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), '..', 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd()),
  ];

  const roots = Array.from(new Set([...configured, ...defaults]));
  return roots.filter((root) => {
    try {
      return fs.existsSync(root) && fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}

function decodePathComponentSafe(val) {
  try {
    return decodeURIComponent(String(val || ''));
  } catch {
    return String(val || '');
  }
}

function extractWooUploadsRelativePath(rawInput) {
  const normalized = String(rawInput || '').replace(/\\/g, '/');
  const marker = '/wp-content/uploads/woocommerce_uploads/';
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx >= 0) {
    return normalized.slice(idx + marker.length);
  }
  
  const markerShort = '/woocommerce_uploads/';
  const idxShort = normalized.toLowerCase().indexOf(markerShort);
  if (idxShort >= 0) {
    return normalized.slice(idxShort + markerShort.length);
  }
  return null;
}

function isInsideRoot(absPath, absRoot) {
  const rel = path.relative(absRoot, absPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveDownloadAbsolutePath(rawInput, roots) {
  const wooRelativePath = extractWooUploadsRelativePath(rawInput);
  if (wooRelativePath) {
    for (const root of roots) {
      const absolutePath = path.resolve(root, wooRelativePath);
      if (!isInsideRoot(absolutePath, root)) continue;
      if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
        return { absolutePath, relativePath: wooRelativePath };
      }
    }
  }

  let directPath = decodePathComponentSafe(String(rawInput || '').trim());
  if (/^https?:\/\//i.test(directPath)) {
    try {
      const parsed = new URL(directPath);
      directPath = parsed.pathname || '';
    } catch {}
  }
  const cleanRelative = directPath.replace(/^\/+/, '');
  if (cleanRelative && !cleanRelative.startsWith('..') && !cleanRelative.includes('/../')) {
    for (const root of roots) {
      const absolutePath = path.resolve(root, cleanRelative);
      if (!isInsideRoot(absolutePath, root)) continue;
      if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
        return { absolutePath, relativePath: cleanRelative };
      }
    }
  }

  return null;
}

async function run() {
  const roots = getDownloadRoots();
  console.log('Detected active root directories:');
  roots.forEach(r => console.log(' -', r));

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3307'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // Query database for all products with their files
  const [products] = await connection.query(`
    SELECT p.id, p.name, p.slug, p.status, f.file_path, f.file_name, f.id as file_id
    FROM products p
    LEFT JOIN product_files f ON f.product_id = p.id
    ORDER BY p.id ASC
  `);

  console.log(`\nStarting scan on ${products.length} products...\n`);

  const missing = [];
  const found = [];
  const noFileRegistered = [];

  for (const p of products) {
    if (!p.file_path) {
      noFileRegistered.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status
      });
      continue;
    }

    const resolved = resolveDownloadAbsolutePath(p.file_path, roots);
    if (resolved) {
      found.push({
        id: p.id,
        name: p.name,
        file_path: p.file_path,
        physical_path: resolved.absolutePath
      });
    } else {
      missing.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        file_id: p.file_id,
        file_path: p.file_path,
        file_name: p.file_name
      });
    }
  }

  console.log('==================================================');
  console.log('RESULTS SUMMARY:');
  console.log('==================================================');
  console.log(`- Total products scanned: ${products.length}`);
  console.log(`- Files FOUND on disk: ${found.length}`);
  console.log(`- Files MISSING on disk: ${missing.length}`);
  console.log(`- Products without any file in database: ${noFileRegistered.length}`);
  console.log('==================================================\n');

  // Let's write the detailed report as a JSON file or markdown report so the user can easily see it
  const reportPath = path.join(__dirname, '..', 'relatorio_verificacao_arquivos.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    roots_scanned: roots,
    totals: {
      scanned: products.length,
      found: found.length,
      missing: missing.length,
      no_file_registered: noFileRegistered.length
    },
    missing_files: missing,
    products_without_files: noFileRegistered
  }, null, 2));
  console.log(`Detailed JSON report saved to: ${reportPath}`);

  // Create a markdown report for the user to view in their language (Portuguese)
  const mdReportPath = path.join(__dirname, '..', 'relatorio_verificacao_arquivos.md');
  let mdContent = `# Relatório de Verificação de Arquivos e Banco de Dados\n\n`;
  mdContent += `**Data da verificação:** ${new Date().toLocaleString('pt-BR')}\n`;
  mdContent += `**Diretórios raízes de busca escaneados:**\n`;
  roots.forEach(r => {
    mdContent += `- \`${r}\`\n`;
  });
  mdContent += `\n`;

  mdContent += `## Resumo Geral\n\n`;
  mdContent += `| Métrica | Quantidade |\n`;
  mdContent += `| --- | --- |\n`;
  mdContent += `| Total de produtos no banco | ${products.length} |\n`;
  mdContent += `| Arquivos ZIP encontrados fisicamente | ${found.length} |\n`;
  mdContent += `| **Arquivos ZIP ausentes fisicamente (Erro)** | **${missing.length}** |\n`;
  mdContent += `| Produtos sem nenhum arquivo registrado no banco | ${noFileRegistered.length} |\n\n`;

  if (missing.length > 0) {
    mdContent += `## ❌ Produtos com arquivo ZIP ausente no servidor (${missing.length})\n\n`;
    mdContent += `Estes produtos possuem registros de arquivos no banco de dados, mas o arquivo físico correspondente não foi encontrado nos diretórios de download. Eles precisam que seus arquivos ZIP sejam enviados e posicionados na pasta correta.\n\n`;
    mdContent += `| ID | Nome do Produto | Caminho no Banco | Arquivo Esperado |\n`;
    mdContent += `| --- | --- | --- | --- |\n`;
    missing.forEach(m => {
      mdContent += `| ${m.id} | ${m.name} | \`${m.file_path}\` | \`${m.file_name}\` |\n`;
    });
    mdContent += `\n`;
  } else {
    mdContent += `## ✅ Nenhum arquivo ZIP ausente!\n\nTodos os produtos com arquivos registrados no banco possuem seus respectivos arquivos ZIP no servidor.\n\n`;
  }

  if (noFileRegistered.length > 0) {
    mdContent += `## ⚠️ Produtos sem arquivo registrado no banco de dados (${noFileRegistered.length})\n\n`;
    mdContent += `Estes produtos estão cadastrados no banco de dados, mas não possuem nenhuma linha correspondente na tabela \`product_files\`, o que significa que o usuário não conseguirá fazer download de nenhum arquivo após a compra.\n\n`;
    mdContent += `| ID | Nome do Produto | Slug | Status |\n`;
    mdContent += `| --- | --- | --- | --- |\n`;
    noFileRegistered.forEach(n => {
      mdContent += `| ${n.id} | ${n.name} | \`${n.slug}\` | \`${n.status}\` |\n`;
    });
    mdContent += `\n`;
  }

  fs.writeFileSync(mdReportPath, mdContent);
  console.log(`Detailed Markdown report saved to: ${mdReportPath}`);

  await connection.end();
}

run().catch(console.error);
