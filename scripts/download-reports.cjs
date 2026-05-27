const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

// Copia os relatórios JSON e Markdown do servidor para o diretório local
const REMOTE_JSON = '/home/digitalbordados/digitalbordados/relatorio_limpeza_arquivos.json';
const REMOTE_MD   = '/home/digitalbordados/digitalbordados/relatorio_limpeza_arquivos.md';
const LOCAL_JSON  = path.join(__dirname, '..', 'relatorio_limpeza_arquivos.json');
const LOCAL_MD    = path.join(__dirname, '..', 'relatorio_limpeza_arquivos.md');

function downloadFile(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

console.log('Conectando ao servidor remoto para baixar os relatórios de limpeza...');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp(async (err, sftp) => {
    if (err) { conn.end(); throw err; }
    try {
      await downloadFile(sftp, REMOTE_JSON, LOCAL_JSON);
      console.log('✅ Relatório JSON baixado em:', LOCAL_JSON);
      await downloadFile(sftp, REMOTE_MD, LOCAL_MD);
      console.log('✅ Relatório Markdown baixado em:', LOCAL_MD);
    } catch (e) {
      console.error('Erro ao baixar relatórios:', e.message);
    } finally {
      conn.end();
    }
  });
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
