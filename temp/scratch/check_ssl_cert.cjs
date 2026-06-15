const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Analisando arquivos de certificado SSL...\n');

  const commands = [
    'echo "=== ARQUIVOS DE CERTIFICADO DO SUBDOMINIO MOBILE ==="',
    'ls -la /usr/local/directadmin/data/users/digitalbordados/domains/m.digitalbordados.com.br.* 2>/dev/null || echo "Nao encontrados"',
    'echo "=== DETALHES DO CERTIFICADO CONFIGURADO PARA M.DIGITALBORDADOS ==="',
    'openssl x509 -in /usr/local/directadmin/data/users/digitalbordados/domains/m.digitalbordados.com.br.cert.combined -text -noout 2>/dev/null | grep -E "Subject:|Issuer:|DNS:|Not After" || echo "Nao foi possivel decodificar o certificado"',
    'echo "=== DETALHES DO CERTIFICADO DO DOMINIO PRINCIPAL ==="',
    'openssl x509 -in /usr/local/directadmin/data/users/digitalbordados/domains/digitalbordados.com.br.cert.combined -text -noout 2>/dev/null | grep -E "Subject:|Issuer:|DNS:|Not After" || echo "Nao foi possivel decodificar o certificado principal"',
    'echo "=== TESTE DE CONEXAO LOCAL COM CURL ==="',
    'curl -Iv https://m.digitalbordados.com.br 2>&1 | head -n 35'
  ];

  conn.exec(commands.join(' && echo "" && '), (err, stream) => {
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
