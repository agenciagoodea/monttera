const http = require('http');
const https = require('https');
const urlModule = require('url');

function fetchHtml(targetUrl, userAgent, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = urlModule.parse(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': userAgent || 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_voiced.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...extraHeaders
      }
    };
    client.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          html: data
        });
      });
    }).on('error', reject);
  });
}

async function testUrl(targetUrl, headers = {}) {
  console.log(`\n==================================================`);
  console.log(`Buscando ${targetUrl}`);
  console.log(`Headers extra: ${JSON.stringify(headers)}`);
  try {
    const result = await fetchHtml(targetUrl, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_voiced.html)', headers);
    console.log('Status Code:', result.statusCode);
    console.log('Response Headers:', JSON.stringify(result.headers, null, 2));
    
    // Mostrar as primeiras tags og: e icon
    const lines = result.html.split('\n');
    let inHead = false;
    for (const line of lines) {
      if (line.includes('<head>')) inHead = true;
      if (line.includes('</head>')) break;
      if (inHead) {
        const trimmed = line.trim();
        if (trimmed.startsWith('<meta') || trimmed.startsWith('<title') || trimmed.startsWith('<link')) {
          console.log('  ', trimmed);
        }
      }
    }
  } catch (err) {
    console.error('Erro na requisição:', err.message);
  }
}

async function run() {
  // Simular a requisição do Facebook Crawler para /index.html com Accept */*
  await testUrl('http://digitalbordados.com.br/index.html', { 'Accept': '*/*' });
  await testUrl('https://digitalbordados.com.br/index.html', { 'Accept': '*/*' });
}

run();
