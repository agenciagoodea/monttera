import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';

function parseCredentials() {
  const filePath = path.join(process.cwd(), '.cpanel-credentials.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo .cpanel-credentials.json não encontrado!');
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const keyMatch = content.match(/"password"\s*:\s*"([\s\S]+?-----END OPENSSH PRIVATE KEY-----)"/);
  const cpanelPasswordMatch = content.match(/"cpanel"[\s\S]*?"password"\s*:\s*"([^"]+)"/);

  return {
    privateKey: keyMatch ? keyMatch[1].replace(/\r?\n/g, '\n') : '',
    cpanelPassword: cpanelPasswordMatch ? cpanelPasswordMatch[1] : ''
  };
}

// Retorna uma Promise que resolve em true se a passphrase decifrou a chave com sucesso localmente
function testPassphrase(key, passphrase) {
  return new Promise((resolve) => {
    const conn = new Client();
    
    conn.on('error', (err) => {
      // Se o erro for de decodificação da chave local
      if (err.message.includes('integrity check failed') || err.message.includes('bad passphrase') || err.message.includes('Cannot parse privateKey')) {
        resolve(false);
      } else {
        // Se for qualquer outro erro (ex: ECONNREFUSED, host inalcançável), significa que a chave privada 
        // foi descriptografada localmente com sucesso e a biblioteca tentou iniciar a conexão de rede!
        resolve(true);
      }
    });

    try {
      conn.connect({
        host: '127.0.0.1', // conectamos num host local fictício
        port: 9999,        // porta fechada
        username: 'test',
        privateKey: key,
        passphrase: passphrase,
        readyTimeout: 100 // timeout curtíssimo
      });
    } catch (err) {
      // Se der exceção síncrona na hora do connect (geralmente por conta do parse da chave privada)
      resolve(false);
    }
  });
}

async function runBrute() {
  const creds = parseCredentials();
  const key = creds.privateKey;

  const candidates = [
    'antigravity',
    'kryontecnologic',
    creds.cpanelPassword,
    creds.cpanelPassword.trim(),
    'antigravity123',
    'kryontecnologic123',
    '123456',
    'admin',
    'root',
  ];

  console.log(`Testando ${candidates.length} candidatos de passphrase localmente...`);

  for (const pass of candidates) {
    const success = await testPassphrase(key, pass);
    if (success) {
      console.log(`\n>>> SUCESSO! A passphrase correta decifrou a chave! É: "${pass}" <<<\n`);
      process.exit(0);
    } else {
      console.log(`Falhou para: "${pass}"`);
    }
  }

  console.log('\nNenhum dos candidatos comuns descriptografou a chave privada.');
  process.exit(1);
}

runBrute();
