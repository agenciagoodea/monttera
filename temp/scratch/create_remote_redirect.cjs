const { Client } = require('ssh2');
const conn = new Client();

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const commands = [
  'echo "=== Criando diretório /novo ==="',
  'mkdir -p /home/digitalbordados/domains/digitalbordados.com.br/public_html/novo',
  'echo "=== Criando arquivo .htaccess de redirecionamento ==="',
  'echo \'RewriteEngine On\' > /home/digitalbordados/domains/digitalbordados.com.br/public_html/novo/.htaccess',
  'echo \'RewriteRule ^(.*)$ https://digitalbordados.com.br/$1 [R=301,L]\' >> /home/digitalbordados/domains/digitalbordados.com.br/public_html/novo/.htaccess',
  'echo "=== Verificando permissões e arquivos criados ==="',
  'ls -la /home/digitalbordados/domains/digitalbordados.com.br/public_html/novo',
  'cat /home/digitalbordados/domains/digitalbordados.com.br/public_html/novo/.htaccess'
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
