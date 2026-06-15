const { Client } = require('ssh2');
const conn = new Client();

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const commands = [
  'echo "=== Nginx Access Log ==="',
  'tail -n 10 /var/log/nginx/domains/digitalbordados.com.br.novo.log || true',
  'echo "=== Nginx Error Log ==="',
  'tail -n 10 /var/log/nginx/domains/digitalbordados.com.br.novo.error.log || true',
  'echo "=== PM2 Out Log ==="',
  'tail -n 20 /home/digitalbordados/.pm2/logs/digitalbordados-out.log || true',
  'echo "=== PM2 Error Log ==="',
  'tail -n 20 /home/digitalbordados/.pm2/logs/digitalbordados-error.log || true'
].join(' && ');

conn.on('ready', () => {
  conn.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
