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

function callUAPI(module, func, params = {}) {
  return new Promise((resolve, reject) => {
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const urlPath = `/execute/${module}/${func}?${query}`;
    
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
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function uploadFileContent(remoteDir, fileName, content) {
  return new Promise((resolve, reject) => {
    const fileContent = Buffer.from(content);
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    const headerPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="dir"\r\n\r\n${remoteDir}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file-1"; filename="${fileName}"\r\n` +
      `Content-Type: text/plain\r\n\r\n`
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

async function main() {
  console.log('🧹 Removendo restart.txt antigo se existir...');
  await cpanelAPI2('Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: `monttera/tmp/restart.txt`
  }).catch(() => null);

  console.log('🚀 Escrevendo tmp/restart.txt para reiniciar Passenger...');
  const restartTimestamp = String(Date.now());
  const restartRes = await uploadFileContent(`${APP_DIR}/tmp`, 'restart.txt', restartTimestamp);
  console.log('Restart trigger result:', JSON.stringify(restartRes, null, 2));

  // Tenta chamar restart via PassengerApps se disponível
  console.log('🚀 Tentando reiniciar via PassengerApps API...');
  const apiRestart = await callUAPI('PassengerApps', 'restart_application', {
    name: 'monttera'
  }).catch(() => null);
  console.log('API Restart result:', JSON.stringify(apiRestart, null, 2));

  console.log('\n✅ Reinicialização do aplicativo acionada.');
}

main().catch(console.error);
