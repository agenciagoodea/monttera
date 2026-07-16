import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

function parseCredentials() {
  const filePath = path.join(process.cwd(), '.cpanel-credentials.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo .cpanel-credentials.json não encontrado!');
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Extrai o host
  const hostMatch = content.match(/"host"\s*:\s*"([^"]+)"/);
  const portMatch = content.match(/"port"\s*:\s*([0-9]+)/);
  
  // Extrai o usuário e a senha do cPanel
  const cpanelUserMatch = content.match(/"cpanel"[\s\S]*?"user"\s*:\s*"([^"]+)"/);
  const cpanelPasswordMatch = content.match(/"cpanel"[\s\S]*?"password"\s*:\s*"([^"]+)"/);

  if (!hostMatch || !cpanelUserMatch || !cpanelPasswordMatch) {
    throw new Error('Erro ao fazer o parse das credenciais do cPanel no arquivo JSON.');
  }

  return {
    host: hostMatch[1],
    port: portMatch ? Number(portMatch[1]) : 22,
    user: cpanelUserMatch[1],
    password: cpanelPasswordMatch[1]
  };
}

async function testSSHPassword() {
  try {
    const creds = parseCredentials();
    console.log(`Tentando conectar via SSH por SENHA a ${creds.user}@${creds.host}:${creds.port}...`);

    const conn = new Client();

    conn.on('ready', () => {
      console.log('Conexão SSH por SENHA estabelecida com SUCESSO!');
      console.log('Executando comando de diagnóstico...');

      conn.exec('uname -a && whoami && node -v && git --version', (err, stream) => {
        if (err) {
          console.error('Erro ao executar comando:', err);
          conn.end();
          process.exit(1);
        }

        let output = '';
        stream.on('close', (code, signal) => {
          console.log(`Comando finalizado com código ${code}`);
          console.log('\n--- SAÍDA DO SERVIDOR ---');
          console.log(output);
          console.log('-------------------------\n');
          conn.end();
          process.exit(0);
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          console.error('STDERR: ' + data);
        });
      });
    }).on('error', (err) => {
      console.error('Erro na conexão SSH por SENHA:', err);
      process.exit(1);
    }).connect({
      host: creds.host,
      port: creds.port,
      username: creds.user,
      password: creds.password
    });

  } catch (error) {
    console.error('Erro ao inicializar:', error);
    process.exit(1);
  }
}

testSSHPassword();
