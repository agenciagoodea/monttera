/**
 * deploy-zips-sftp.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * Envia os arquivos locais da pasta uploads/arquivos/ para o servidor remoto
 * via SFTP (ssh2) de forma concorrente e eficiente.
 *
 * Pula arquivos que já existam no destino com o mesmo tamanho (otimização).
 *
 * Uso:
 *   node scripts/deploy-zips-sftp.cjs
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10); // pool de uploads paralelos

const LOCAL_DIR = path.resolve(__dirname, '..', 'uploads', 'arquivos');
const REMOTE_DIR = '/home/digitalbordados/digitalbordados/uploads/arquivos';

if (!SSH_PASS) {
  console.error('\n❌ ERRO: Defina a senha SSH no seu .env ou nas credenciais.');
  process.exit(1);
}

if (!fs.existsSync(LOCAL_DIR)) {
  console.error(`\n❌ ERRO: Pasta local não encontrada: ${LOCAL_DIR}`);
  process.exit(1);
}

// Lista os arquivos na pasta local
const todosArquivosLocais = fs.readdirSync(LOCAL_DIR)
  .map(name => {
    const fullPath = path.join(LOCAL_DIR, name);
    const stat = fs.statSync(fullPath);
    return { name, path: fullPath, size: stat.size, isFile: stat.isFile() };
  })
  .filter(f => f.isFile);

console.log(`\n📄 Encontrados ${todosArquivosLocais.length} arquivos locais na pasta uploads/arquivos/`);

if (todosArquivosLocais.length === 0) {
  console.log('Nada para enviar. Finalizado.');
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────
// EXECUÇÃO DO DEPLOY
// ──────────────────────────────────────────────────────────────

async function run() {
  const conn = new Client();

  conn.on('ready', () => {
    console.log(`\n🔌 Conectado ao servidor SSH: ${SSH_HOST}:${SSH_PORT}`);
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error('❌ Erro ao abrir canal SFTP:', err.message);
        conn.end();
        process.exit(1);
      }

      console.log('📁 Verificando diretório remoto...');
      
      // Cria o diretório remoto recursivamente (garante que existe)
      await new Promise((resolve) => {
        sftp.mkdir(REMOTE_DIR, (errDir) => {
          // Se já existir ou for criado, continuamos
          resolve();
        });
      });

      console.log(`📁 Obtendo lista de arquivos existentes no servidor remoto em ${REMOTE_DIR}...`);
      
      const remoteFilesMap = new Map();
      await new Promise((resolve) => {
        sftp.readdir(REMOTE_DIR, (errRead, list) => {
          if (!errRead && list) {
            list.forEach(f => {
              remoteFilesMap.set(f.filename.toLowerCase(), f.attrs.size);
            });
          }
          resolve();
        });
      });

      console.log(`   → ${remoteFilesMap.size} arquivos já existem remotamente.`);

      // Filtra arquivos a enviar (não existem ou têm tamanho diferente)
      const filaDeEnvio = todosArquivosLocais.filter(f => {
        const remoteSize = remoteFilesMap.get(f.name.toLowerCase());
        if (remoteSize !== undefined && remoteSize === f.size) {
          return false; // pula
        }
        return true; // envia
      });

      const totalJaExistiam = todosArquivosLocais.length - filaDeEnvio.length;
      console.log(`   → Já existentes / pulados: ${totalJaExistiam}`);
      console.log(`   → A enviar: ${filaDeEnvio.length}\n`);

      let enviados = 0;
      let erros = 0;
      const total = filaDeEnvio.length;
      const inicio = Date.now();

      const logSucesso = [];
      const logErros = [];

      // Função de upload individual
      function enviarArquivo(item) {
        return new Promise((resolveFile) => {
          const remotePath = path.posix.join(REMOTE_DIR, item.name);
          
          sftp.fastPut(item.path, remotePath, {
            concurrency: 2,
            chunkSize: 65536
          }, (errPut) => {
            if (errPut) {
              console.error(`\n❌ Erro ao enviar ${item.name}:`, errPut.message);
              logErros.push({ name: item.name, error: errPut.message });
              erros++;
            } else {
              logSucesso.push(item.name);
              enviados++;
            }
            resolveFile();
          });
        });
      }

      // Pool de concorrência
      async function runPool() {
        let idx = 0;
        let concAtual = 0;

        function barraProgresso() {
          const done = enviados + erros;
          const pct = total === 0 ? 100 : Math.round((done / total) * 100);
          const elapsed = ((Date.now() - inicio) / 1000).toFixed(0);
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          process.stdout.write(`\r  [${bar}] ${pct}% | 📤 ${enviados} enviados | ❌ ${erros} erros | ⏱ ${elapsed}s`);
        }

        return new Promise((resolvePool) => {
          function next() {
            if (idx >= filaDeEnvio.length && concAtual === 0) {
              process.stdout.write('\n');
              resolvePool();
              return;
            }
            while (concAtual < CONCURRENCY && idx < filaDeEnvio.length) {
              const item = filaDeEnvio[idx++];
              concAtual++;
              enviarArquivo(item).then(() => {
                concAtual--;
                barraProgresso();
                next();
              });
            }
          }
          next();
          if (total > 0) barraProgresso();
        });
      }

      if (total > 0) {
        console.log(`🚀 Iniciando upload usando pool de ${CONCURRENCY} conexões paralelas...`);
        await runPool();
      }

      const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
      
      console.log('\n' + '═'.repeat(65));
      console.log('  RESUMO DO DEPLOY');
      console.log('═'.repeat(65));
      console.log(`  Total analisado localmente   : ${todosArquivosLocais.length}`);
      console.log(`  ✅ Já existentes no servidor : ${totalJaExistiam}`);
      console.log(`  📤 Enviados com sucesso      : ${enviados}`);
      console.log(`  ❌ Erros durante upload      : ${erros}`);
      console.log(`  ⏱  Tempo de transferência   : ${duracao}s`);
      console.log('═'.repeat(65));

      // Salva checklist Markdown de confirmação de arquivos no servidor
      const REPORT_DIR = path.resolve(__dirname, '..', 'relatorios_migracao');
      if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
      
      const reportPath = path.join(REPORT_DIR, 'checklist_arquivos_servidor.md');
      let reportMd = `# Checklist de Confirmação de Arquivos no Servidor Remoto\n\n`;
      reportMd += `**Data do Deploy:** ${new Date().toLocaleString('pt-BR')}\n`;
      reportMd += `**Servidor Remoto:** \`${SSH_HOST}\`\n`;
      reportMd += `**Diretório Remoto:** \`${REMOTE_DIR}\`\n\n`;
      reportMd += `## Estatísticas do Deploy\n\n`;
      reportMd += `- **Total de arquivos locais analisados:** ${todosArquivosLocais.length}\n`;
      reportMd += `- **Arquivos que já existiam no servidor:** ${totalJaExistiam}\n`;
      reportMd += `- **Novos arquivos enviados:** ${enviados}\n`;
      reportMd += `- **Falhas de transferência:** ${erros}\n\n`;
      
      reportMd += `## Lista de Todos os Arquivos no Servidor Remoto\n\n`;
      reportMd += `Abaixo estão listados todos os arquivos configurados e disponíveis para download:\n\n`;
      
      todosArquivosLocais.forEach((f, idx) => {
        const statusIcon = logErros.some(e => e.name === f.name) ? '❌ Falhou' : '✅ Ok';
        reportMd += `${idx + 1}. [${statusIcon}] \`${f.name}\` (${(f.size / (1024 * 1024)).toFixed(2)} MB)\n`;
      });

      fs.writeFileSync(reportPath, reportMd);
      console.log(`\n📊 Checklist detalhado gerado localmente em:`);
      console.log(`   → ${reportPath}`);

      conn.end();
    });
  });

  conn.on('error', (err) => {
    console.error('❌ Erro de conexão SSH:', err.message);
  });

  conn.connect({
    host: SSH_HOST,
    port: SSH_PORT,
    username: SSH_USER,
    password: SSH_PASS,
    readyTimeout: 45000,
    keepaliveInterval: 10000,
  });
}

run().catch(console.error);
