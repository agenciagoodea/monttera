const { Client } = require('ssh2');
const conn = new Client();

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const commands = [
  'cd /home/digitalbordados/digitalbordados',
  'echo "=== Git Fetch ==="',
  'git fetch origin',
  'echo "=== Git Status ==="',
  'git status',
  'echo "=== Git Pull ==="',
  'git pull origin main',
  'echo "=== NPM Install ==="',
  'npm install',
  'echo "=== NPM Run Build ==="',
  'npm run build',
  'echo "=== PM2 Reload ==="',
  'pm2 reload digitalbordados',
  'echo "=== PM2 Status ==="',
  'pm2 status'
].join(' && ');

conn.on('ready', () => {
  console.log('SSH :: Conectado com sucesso.');
  console.log('SSH :: Executando comandos de deploy...');
  
  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('Erro ao executar comandos:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code, signal) => {
      console.log(`\nSSH :: Conexão encerrada com código de saída ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('Erro na conexão SSH:', err);
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
