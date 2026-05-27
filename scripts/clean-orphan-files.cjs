const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  console.log('Iniciando análise de arquivos órfãos em /uploads/arquivos...');

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  console.log('Conectado ao banco de dados MySQL.');

  // 1. Buscar arquivos registrados na tabela product_files
  const [dbProductFiles] = await connection.query('SELECT file_path, file_name FROM product_files');
  
  // 2. Buscar fichas técnicas registradas na tabela products
  const [dbProducts] = await connection.query('SELECT production_sheet FROM products');

  await connection.end();
  console.log('Dados do banco coletados e conexão encerrada.');

  // Conjunto de arquivos válidos (nomes de arquivos únicos normalizados)
  const validFileNames = new Set();

  const addFileNameToSet = (rawPath) => {
    if (!rawPath) return;
    const cleanPath = String(rawPath).trim();
    if (!cleanPath) return;

    // Extrair apenas o nome base do arquivo
    // ex: /uploads/arquivos/11bimth-mhgpig.zip -> 11bimth-mhgpig.zip
    // ex: https://digitalbordados.com.br/uploads/arquivos/11bimth-mhgpig.zip -> 11bimth-mhgpig.zip
    let directPath = cleanPath;
    if (/^https?:\/\//i.test(directPath)) {
      try {
        const parsed = new URL(directPath);
        directPath = parsed.pathname || '';
      } catch {}
    }

    const baseName = path.basename(directPath);
    if (baseName && baseName !== '.' && baseName !== '..') {
      validFileNames.add(baseName.toLowerCase());
    }
  };

  // Coleta os caminhos válidos do banco de dados
  dbProductFiles.forEach(file => {
    addFileNameToSet(file.file_path);
    addFileNameToSet(file.file_name);
  });

  dbProducts.forEach(prod => {
    addFileNameToSet(prod.production_sheet);
  });

  console.log(`Encontrados ${validFileNames.size} nomes de arquivos únicos referenciados no banco de dados.`);

  // Pasta física dos arquivos
  const targetDir = path.resolve(process.cwd(), 'uploads', 'arquivos');
  const trashDir = path.resolve(targetDir, 'lixo');

  if (!fs.existsSync(targetDir)) {
    console.error(`A pasta de arquivos física não existe no caminho: ${targetDir}`);
    return;
  }

  // Garantir que a pasta de lixo exista
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir, { recursive: true });
    console.log('Pasta de lixo criada em uploads/arquivos/lixo');
  }

  // Listar arquivos físicos no diretório
  const physicalFiles = fs.readdirSync(targetDir);
  
  const movedFiles = [];
  const keptFiles = [];
  let ignoredDirectories = 0;

  physicalFiles.forEach(fileName => {
    const fullPath = path.join(targetDir, fileName);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      ignoredDirectories++;
      return; // Ignora pastas como a própria pasta "lixo"
    }

    const normName = fileName.toLowerCase();
    
    if (validFileNames.has(normName)) {
      keptFiles.push({ name: fileName, size: stat.size });
    } else {
      // Arquivo órfão encontrado! Mover para o lixo
      const destPath = path.join(trashDir, fileName);
      try {
        fs.renameSync(fullPath, destPath);
        movedFiles.push({ name: fileName, size: stat.size });
      } catch (err) {
        console.error(`Erro ao mover o arquivo ${fileName} para o lixo:`, err);
      }
    }
  });

  console.log('\n==================================================');
  console.log('RELATÓRIO DE LIMPEZA DE ARQUIVOS ÓRFÃOS:');
  console.log('==================================================');
  console.log(`- Diretório analisado: ${targetDir}`);
  console.log(`- Total de arquivos físicos originais: ${physicalFiles.length - ignoredDirectories}`);
  console.log(`- Arquivos ATIVOS (mantidos no lugar): ${keptFiles.length}`);
  console.log(`- Arquivos ÓRFÃOS (movidos para o lixo): ${movedFiles.length}`);
  console.log(`- Subpastas ignoradas: ${ignoredDirectories}`);
  console.log('==================================================\n');

  // Gravar relatório em JSON
  const reportPath = path.join(process.cwd(), 'relatorio_limpeza_arquivos.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totals: {
      physical_original: physicalFiles.length - ignoredDirectories,
      kept: keptFiles.length,
      moved_to_trash: movedFiles.length,
      ignored_directories: ignoredDirectories
    },
    kept_files_list: keptFiles,
    moved_files_list: movedFiles
  }, null, 2));

  console.log(`Relatório detalhado JSON salvo em: ${reportPath}`);

  // Criar arquivo Markdown legível
  const mdReportPath = path.join(process.cwd(), 'relatorio_limpeza_arquivos.md');
  let mdContent = `# Relatório de Limpeza de Arquivos Órfãos (uploads/arquivos)\n\n`;
  mdContent += `**Data da varredura:** ${new Date().toLocaleString('pt-BR')}\n`;
  mdContent += `**Diretório analisado:** \`${targetDir}\`\n\n`;

  mdContent += `## Resumo Geral\n\n`;
  mdContent += `| Métrica | Quantidade |\n`;
  mdContent += `| --- | --- |\n`;
  mdContent += `| Arquivos físicos analisados | ${physicalFiles.length - ignoredDirectories} |\n`;
  mdContent += `| **Arquivos mantidos (Registrados no banco)** | **${keptFiles.length}** |\n`;
  mdContent += `| **Arquivos órfãos movidos para o lixo** | **${movedFiles.length}** |\n`;
  mdContent += `| Subpastas ignoradas | ${ignoredDirectories} |\n\n`;

  if (movedFiles.length > 0) {
    mdContent += `## 🗑️ Arquivos movidos para a pasta \`uploads/arquivos/lixo/\` (${movedFiles.length})\n\n`;
    mdContent += `Estes arquivos físicos existiam no servidor, mas **não** possuem nenhuma relação ativa no banco de dados (nas tabelas \`product_files\` ou \`products\`). Eles foram movidos com segurança para a subpasta \`lixo\`:\n\n`;
    mdContent += `| # | Nome do Arquivo | Tamanho (Bytes) | Tamanho Formatado |\n`;
    mdContent += `| --- | --- | --- | --- |\n`;
    movedFiles.forEach((m, idx) => {
      const formattedSize = (m.size / (1024 * 1024)).toFixed(2) + ' MB';
      mdContent += `| ${idx + 1} | \`${m.name}\` | ${m.size} | ${formattedSize} |\n`;
    });
  } else {
    mdContent += `## ✅ Nenhum arquivo órfão encontrado!\n\nTodos os arquivos físicos contidos na pasta de uploads estão ativamente registrados e vinculados a algum produto no banco de dados.\n`;
  }

  fs.writeFileSync(mdReportPath, mdContent);
  console.log(`Relatório detalhado Markdown salvo em: ${mdReportPath}`);
}

run().catch(console.error);
