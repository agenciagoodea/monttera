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
  console.log('SSH conectado. Iniciando backup da infraestrutura do servidor remoto...\n');

  const backupDir = '/home/digitalbordados/backup_infrastructure_20260529';
  const commands = [
    `mkdir -p ${backupDir}`,
    // Backup PM2
    `pm2 jlist > ${backupDir}/pm2_list.json 2>/dev/null || true`,
    // Backup dos arquivos DirectAdmin acessíveis
    `cp /usr/local/directadmin/data/users/digitalbordados/nginx.conf ${backupDir}/nginx.conf.bak 2>/dev/null || echo "nginx.conf nao acessivel para copia direta"`,
    `cp /usr/local/directadmin/data/users/digitalbordados/httpd.conf ${backupDir}/httpd.conf.bak 2>/dev/null || echo "httpd.conf nao acessivel para copia direta"`,
    // Backup dos .htaccess dos domínios
    `cp /home/digitalbordados/domains/digitalbordados.com.br/public_html/.htaccess ${backupDir}/htaccess_desktop.bak 2>/dev/null || true`,
    `cp /home/digitalbordados/domains/m.digitalbordados.com.br/public_html/.htaccess ${backupDir}/htaccess_mobile.bak 2>/dev/null || true`,
    // Mostra o que foi copiado
    `ls -la ${backupDir}`
  ];

  conn.exec(commands.join(' && '), (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    
    stream.on('close', () => {
      console.log('\n--- Backup concluído com sucesso no servidor remoto ---');
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
