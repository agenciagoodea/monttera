const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const localServerTs = path.join(__dirname, '..', '..', 'server.ts');
const remoteServerTs = '/home/digitalbordados/digitalbordados/server.ts';

const conn = new Client();

console.log('Iniciando deploy customizado via SFTP e SSH...');

conn.on('ready', () => {
  console.log('Conexão SSH estabelecida.');

  // Passo 1: SFTP Upload
  conn.sftp((err, sftp) => {
    if (err) throw err;

    console.log(`SFTP: Enviando server.ts local para ${remoteServerTs} remoto...`);
    sftp.fastPut(localServerTs, remoteServerTs, {}, (err) => {
      if (err) {
        console.error('SFTP: Falha ao enviar o arquivo:', err);
        conn.end();
        return;
      }
      console.log('SFTP: Upload concluído com sucesso!');

      // Passo 2: Executar build e reload via SSH
      const commands = [
        'cd /home/digitalbordados/digitalbordados',
        'npm run build',
        'pm2 reload digitalbordados'
      ].join(' && ');

      console.log('SSH: Executando comandos de build e restart no servidor remoto...');
      conn.exec(commands, (err, stream) => {
        if (err) throw err;

        stream.on('close', (code) => {
          console.log(`SSH: Comandos finalizados com código de saída ${code}.`);
          
          // Exibir status do PM2
          conn.exec('pm2 list', (err, listStream) => {
            if (err) throw err;
            listStream.on('close', () => {
              conn.end();
            }).on('data', (data) => {
              process.stdout.write(data);
            });
          });

        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
