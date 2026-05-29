const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const scriptContent = fs.readFileSync(path.join(__dirname, 'remote-diagnose-colors.js'), 'utf8');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Enviando script de cores...\n');

  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP err:', err); conn.end(); return; }

    const remoteScriptPath = '/home/digitalbordados/digitalbordados/scripts/remote-diagnose-colors-temp.cjs';
    const writeStream = sftp.createWriteStream(remoteScriptPath);

    writeStream.on('close', () => {
      console.log('Script enviado. Executando...\n');
      conn.exec(`cd /home/digitalbordados/digitalbordados && node scripts/remote-diagnose-colors-temp.cjs`, (err2, stream) => {
        if (err2) { console.error('Exec err:', err2); conn.end(); return; }
        stream.on('close', (code) => {
          console.log(`\nCódigo: ${code}`);
          conn.exec(`rm -f /home/digitalbordados/digitalbordados/scripts/remote-diagnose-colors-temp.cjs`, () => conn.end());
        }).on('data', (data) => {
          process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
      });
    }).on('error', (e) => { console.error('Write error:', e); conn.end(); });

    writeStream.write(scriptContent);
    writeStream.end();
  });
}).on('error', (err) => {
  console.error('Erro SSH:', err.message);
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
