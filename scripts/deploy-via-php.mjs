import https from 'https';
import fs from 'fs';
import path from 'path';

const credsPath = path.resolve(process.cwd(), '.cpanel-credentials.json');
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

const CPANEL_HOST = 'pro122.dnspro.com.br';
const CPANEL_PORT = 2083;
const CPANEL_USER = creds.cpanel.user;
const CPANEL_PASS = creds.cpanel.password;
const AUTH = Buffer.from(`${CPANEL_USER}:${CPANEL_PASS}`).toString('base64');
const APP_DIR = `/home/${CPANEL_USER}/monttera`;

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
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(body);
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
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    
    const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([headerPart, fileContent, footerPart]);

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
        catch (e) { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

function triggerUnzipWeb() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'monttera.com.br',
      path: '/unzip.php',
      method: 'GET',
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n🚀 Iniciando deploy via PHP Script...');

  const localZipPath = path.resolve(process.cwd(), 'deploy-bundle.zip');
  const localPHPPath = path.resolve(process.cwd(), 'unzip.php');

  // 1. Remover arquivos antigos se existirem
  console.log('🧹 Removendo zip e unzip.php antigos no servidor...');
  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `monttera/deploy-bundle.zip`
  }).catch(() => null);

  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `monttera/unzip.php`
  }).catch(() => null);

  // 2. Upload do zip e unzip.php
  console.log('📤 Subindo deploy-bundle.zip para o servidor...');
  const zipUpload = await uploadFile(APP_DIR, localZipPath);
  if (zipUpload.status === 1) {
    console.log('  ✅ Upload do zip concluído.');
  } else {
    console.error('  ❌ Falha no upload do zip:', JSON.stringify(zipUpload));
    process.exit(1);
  }

  console.log('📤 Subindo unzip.php para o servidor...');
  const phpUpload = await uploadFile(APP_DIR, localPHPPath);
  if (phpUpload.status === 1) {
    console.log('  ✅ Upload do unzip.php concluído.');
  } else {
    console.error('  ❌ Falha no upload do unzip.php:', JSON.stringify(phpUpload));
    process.exit(1);
  }

  // 3. Executar o unzip.php via requisição web
  console.log('\n📦 Acionando descompactação via requisição HTTP...');
  const webRes = await triggerUnzipWeb();
  console.log(`  Status HTTP: ${webRes.status}`);
  console.log('  Resposta do servidor:\n' + webRes.body);

  if (webRes.body.includes('concluída com sucesso')) {
    console.log('  ✅ Extração efetuada com sucesso!');
  } else {
    console.error('  ❌ Falha na descompactação.');
    process.exit(1);
  }

  // 4. Limpeza
  console.log('\n🧹 Limpando arquivos temporários de deploy no servidor...');
  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `monttera/deploy-bundle.zip`
  }).catch(() => null);

  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `monttera/unzip.php`
  }).catch(() => null);

  console.log('🎉 Deploy concluído com sucesso!');
}

main().catch(console.error);
