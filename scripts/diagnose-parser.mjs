import fs from 'fs';
import path from 'path';

function parseCredentials() {
  const filePath = path.join(process.cwd(), '.cpanel-credentials.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo .cpanel-credentials.json não encontrado!');
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const hostMatch = content.match(/"host"\s*:\s*"([^"]+)"/);
  const portMatch = content.match(/"port"\s*:\s*([0-9]+)/);
  const userMatch = content.match(/"user"\s*:\s*"([^"]+)"/);
  const keyMatch = content.match(/"password"\s*:\s*"([\s\S]+?-----END OPENSSH PRIVATE KEY-----)"/);
  const passphraseMatch = content.match(/"passphrase"\s*:\s*"([^"]+)"/);
  const cpanelPasswordMatch = content.match(/"cpanel"[\s\S]*?"password"\s*:\s*"([^"]+)"/);

  console.log('--- DIAGNÓSTICO DO PARSER ---');
  console.log('Host:', hostMatch ? hostMatch[1] : 'NÃO ENCONTRADO');
  console.log('Porta:', portMatch ? portMatch[1] : 'NÃO ENCONTROU (Padrão 22)');
  console.log('Usuário SSH:', userMatch ? userMatch[1] : 'NÃO ENCONTRADO');
  
  if (keyMatch) {
    const key = keyMatch[1];
    console.log('Chave Privada encontrada. Tamanho:', key.length);
    console.log('Início da chave:', key.substring(0, 40));
    console.log('Fim da chave:', key.substring(key.length - 40));
  } else {
    console.log('Chave Privada: NÃO ENCONTRADA');
  }

  if (passphraseMatch) {
    const pass = passphraseMatch[1];
    console.log('Passphrase encontrada. Tamanho:', pass.length);
    console.log('Início da Passphrase:', pass.substring(0, 15) + '...');
  } else {
    console.log('Passphrase: NÃO ENCONTRADA');
  }

  if (cpanelPasswordMatch) {
    const cpPass = cpanelPasswordMatch[1];
    console.log('Senha do cPanel encontrada. Tamanho:', cpPass.length);
    console.log('Início da Senha do cPanel:', cpPass.substring(0, 4) + '...');
  } else {
    console.log('Senha do cPanel: NÃO ENCONTRADA');
  }
}

parseCredentials();
