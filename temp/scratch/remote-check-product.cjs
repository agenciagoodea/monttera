const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Executando query MySQL na produção...\n');

  // Buscar produtos cuja image ou production_sheet seja absoluta (inicie com http)
  const cmd = `mysql -h 127.0.0.1 -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw digitalbordados_novo -e "SELECT id, name, image, production_sheet FROM products WHERE image LIKE 'http%' OR production_sheet LIKE 'http%' LIMIT 10;"`;

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
