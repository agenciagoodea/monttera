const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Executando server.cjs com o Node.js v20 do Passenger...\n');

  // Executa o node v20 no cjs por 4 segundos e encerra, para capturar possíveis crashes no boot
  const commands = [
    'export PORT=3005 && export NODE_ENV=production && timeout 5 /opt/alt/alt-nodejs20/root/usr/bin/node /home/digitalbordados/digitalbordados/dist/server.cjs 2>&1 || true'
  ];

  conn.exec(commands.join(' && '), (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    
    stream.on('close', () => {
      console.log('\n--- Execução simulada encerrada ---');
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
