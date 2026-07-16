import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

// Função para extrair dados de .cpanel-credentials.json tolerando quebras de linha literais no JSON
function parseCredentials() {
  const filePath = path.join(process.cwd(), '.cpanel-credentials.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo .cpanel-credentials.json não encontrado!');
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Regex para extrair a host do ssh
  const hostMatch = content.match(/"host"\s*:\s*"([^"]+)"/);
  const portMatch = content.match(/"port"\s*:\s*([0-9]+)/);
  const userMatch = content.match(/"user"\s*:\s*"([^"]+)"/);

  // Regex específica para extrair a chave privada até o bloco de finalização
  const keyMatch = content.match(/"password"\s*:\s*"([\s\S]+?-----END OPENSSH PRIVATE KEY-----)"/);
  
  // Regex para extrair a passphrase
  const passphraseMatch = content.match(/"passphrase"\s*:\s*"([^"]+)"/);

  // Regex para extrair a senha do cPanel
  const cpanelPasswordMatch = content.match(/"cpanel"[\s\S]*?"password"\s*:\s*"([^"]+)"/);

  if (!hostMatch || !userMatch || !keyMatch) {
    throw new Error('Erro ao fazer o parse das credenciais do SSH no arquivo JSON.');
  }

  return {
    host: hostMatch[1],
    port: portMatch ? Number(portMatch[1]) : 22,
    user: userMatch[1],
    privateKey: keyMatch[1].replace(/\\n/g, '\n').replace(/\r?\n/g, '\n'), // Converte \n escapados e padroniza quebras de linha reais
    passphrase: passphraseMatch ? passphraseMatch[1] : (cpanelPasswordMatch ? cpanelPasswordMatch[1] : undefined)
  };
}

async function testSSH() {
  try {
    const creds = parseCredentials();
    console.log(`Tentando conectar via SSH a ${creds.user}@${creds.host}:${creds.port} com passphrase...`);

    const conn = new Client();

    conn.on('ready', () => {
      console.log('Conexão SSH estabelecida com SUCESSO!');
      console.log('Executando comando de diagnóstico (uname -a; whoami; node -v; npm -v; git --version)...');

      conn.exec('uname -a && echo "Usuário:" && whoami && echo "Node:" && node -v && echo "NPM:" && npm -v && echo "Git:" && git --version', (err, stream) => {
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
      console.error('Erro na conexão SSH:', err);
      process.exit(1);
    }).connect({
      host: creds.host,
      port: creds.port,
      username: creds.user,
      privateKey: creds.privateKey,
      passphrase: creds.passphrase
    });

  } catch (error) {
    console.error('Erro ao ler credenciais ou inicializar:', error);
    process.exit(1);
  }
}

testSSH();
