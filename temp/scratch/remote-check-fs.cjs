const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Verificando existência de arquivos físicos na produção...\n');

  const cmd = `node -e "const fs = require('fs'); ['/home/digitalbordados/digitalbordados/public/uploads/matriz-bordado-fc-inter-milan-copia-952.jpg', '/home/digitalbordados/digitalbordados/public/uploads/enfermagem-unir-953.pdf', '/home/digitalbordados/digitalbordados/uploads/arquivos/enfermagem-unir-953.zip'].forEach(f => console.log(f, '=>', fs.existsSync(f) ? 'EXISTE' : 'NAO EXISTE'))"`;

  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    stream.on('close', (code) => {
      console.log(`\nCódigo de encerramento: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('Erro SSH:', err.message);
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
