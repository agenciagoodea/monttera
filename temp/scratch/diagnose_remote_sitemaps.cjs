const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const conn = new Client();

const commands = [
  // 1. Testar se o Express local na porta 3000 responde os sitemaps
  'echo "=== TESTANDO LOCALHOST EM PORTA 3000 ==="',
  'curl -I http://localhost:3000/sitemap.xml',
  'curl -I http://localhost:3000/sitemap-static.xml',
  'curl -I http://localhost:3000/sitemap-products.xml',
  
  // 2. Testar se o Nginx localmente na porta 80/443 responde ou redireciona
  'echo "\n=== TESTANDO ATRAVES DO DOMINIO LOCALMENTE ==="',
  'curl -I https://digitalbordados.com.br/sitemap.xml',
  'curl -I https://digitalbordados.com.br/sitemap-products.xml',
  
  // 3. Verificar logs recentes de erro no Nginx
  'echo "\n=== ULTIMAS LINHAS DO LOG DE ERROS DO NGINX ==="',
  'tail -n 20 /var/log/nginx/error.log 2>/dev/null || tail -n 20 /var/log/httpd/error_log 2>/dev/null || echo "Nginx error log nao acessivel"',
  
  // 4. Verificar se existe algum arquivo de configuracao do Nginx relevante
  'echo "\n=== CONFIGURACOES DO NGINX ==="',
  'find /etc/nginx -name "*.conf" 2>/dev/null | xargs grep -i -H "digitalbordados" 2>/dev/null || echo "Nao foi possivel ler configuracoes do Nginx"'
];

conn.on('ready', () => {
  console.log('SSH Connection ready for diagnostics...');
  conn.exec(commands.join(' && '), (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`\nConnection closed with code: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
