import https from 'https';
import fs from 'fs';
import path from 'path';

// Carregar credenciais
const credsPath = path.resolve(process.cwd(), '.cpanel-credentials.json');
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

const CPANEL_HOST = 'pro122.dnspro.com.br';
const CPANEL_PORT = 2083;
const CPANEL_USER = creds.cpanel.user;
const CPANEL_PASS = creds.cpanel.password;
const AUTH = Buffer.from(`${CPANEL_USER}:${CPANEL_PASS}`).toString('base64');
const APP_DIR = `/home/${CPANEL_USER}/monttera`;
const BUNDLE_NAME = 'deploy-bundle.zip';
const BUNDLE_PATH = path.resolve(process.cwd(), BUNDLE_NAME);

function cpanelAPI(module, func, params = {}) {
  return new Promise((resolve, reject) => {
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const urlPath = `/execute/${module}/${func}${query ? '?' + query : ''}`;
    
    const options = {
      hostname: CPANEL_HOST,
      port: CPANEL_PORT,
      path: urlPath,
      method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}` },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Resposta inesperada: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function uploadFile(remoteDir, localFilePath) {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(localFilePath);
    const fileName = path.basename(localFilePath);
    
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    const headerPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="dir"\r\n\r\n${remoteDir}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file-1"; filename="${fileName}"\r\n` +
      `Content-Type: application/x-gzip\r\n\r\n`
    );
    
    const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([headerPart, fileContent, footerPart]);

    console.log(`  Subindo ${fileName} para ${remoteDir} (${(fullBody.length / (1024 * 1024)).toFixed(2)} MB)...`);

    const options = {
      hostname: CPANEL_HOST,
      port: CPANEL_PORT,
      path: `/execute/Fileman/upload_files`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data.substring(0, 200), status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('Timeout no upload')); });
    req.write(fullBody);
    req.end();
  });
}

function cpanelAPI2(module, func, params = {}) {
  return new Promise((resolve, reject) => {
    const body = Object.entries({
      cpanel_jsonapi_user: CPANEL_USER,
      cpanel_jsonapi_apiversion: '2',
      cpanel_jsonapi_module: module,
      cpanel_jsonapi_func: func,
      ...params
    })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

    const options = {
      hostname: CPANEL_HOST,
      port: CPANEL_PORT,
      path: '/json-api/cpanel',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Resposta inesperada: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('\n🚀 Iniciando deploy no cPanel...');
  
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error(`Erro: ${BUNDLE_NAME} não encontrado na raiz. Rode 'npm run prepare:deploy' primeiro.`);
    process.exit(1);
  }

  // 0. Deletar bundle antigo se existir
  console.log('🧹 Removendo bundle antigo do servidor...');
  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `${APP_DIR}/${BUNDLE_NAME}`
  }).catch(() => null);

  // 1. Upload do bundle.zip
  const uploadRes = await uploadFile(APP_DIR, BUNDLE_PATH);
  if (uploadRes.status === 1) {
    console.log('  ✅ Upload concluído com sucesso.');
  } else {
    console.error('  ❌ Falha no upload:', JSON.stringify(uploadRes));
    process.exit(1);
  }

  // 2. Extrair o arquivo no servidor usando cPanel API 2 Fileman::fileop via POST
  console.log('\n📦 Extraindo bundle no servidor...');
  const extractRes = await cpanelAPI2('Fileman', 'fileop', {
    op: 'extract',
    sourcefiles: `${APP_DIR}/${BUNDLE_NAME}`,
    doubledecode: '1'
  });

  const cpanelResult = extractRes.cpanelresult || {};
  const cpanelData = cpanelResult.data || [];
  const fileResult = cpanelData[0] || {};
  
  if (cpanelResult.error) {
    console.error('  ❌ Falha na extração:', cpanelResult.error);
    process.exit(1);
  } else if (fileResult.result === 1) {
    console.log('  ✅ Extração concluída com sucesso.');
  } else {
    console.error('  ❌ Falha no resultado da extração:', JSON.stringify(fileResult));
    process.exit(1);
  }

  // 3. Remover o arquivo zip no servidor
  console.log('\n🧹 Limpando o arquivo bundle no servidor...');
  const deleteRes = await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `${APP_DIR}/${BUNDLE_NAME}`
  });

  const deleteResult = deleteRes.cpanelresult || {};
  const deleteData = deleteResult.data || [];
  const deleteFileResult = deleteData[0] || {};

  if (deleteFileResult.result === 1) {
    console.log('  ✅ Limpeza concluída.');
  } else {
    console.log('  ⚠️  Aviso: Não foi possível deletar o bundle no servidor:', JSON.stringify(deleteRes));
  }

  console.log('\n🎉 Deploy via cPanel API concluído com sucesso!');
}

main().catch(console.error);
