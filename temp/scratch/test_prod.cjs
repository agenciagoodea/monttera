const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('=== TESTANDO ENDPOINTS DE SEO EM PRODUÇÃO PÚBLICA ===');
  
  const endpoints = [
    'https://digitalbordados.com.br/sitemap.xml',
    'https://digitalbordados.com.br/sitemap-products.xml',
    'https://digitalbordados.com.br/sitemap-images.xml',
    'https://digitalbordados.com.br/google-merchant.xml'
  ];

  for (const url of endpoints) {
    try {
      console.log(`Requisitando: ${url}...`);
      const res = await get(url);
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Content-Type: ${res.headers['content-type']}`);
      console.log(`  Tamanho do Body: ${res.body.length} bytes`);
      if (res.statusCode === 200) {
        console.log(`  Trecho inicial: ${res.body.slice(0, 150).replace(/\r?\n/g, ' ')}...`);
      } else {
        console.log(`  [ERRO] Status inesperado: ${res.statusCode}`);
      }
    } catch (err) {
      console.log(`  [FALHA DE CONEXÃO] ${err.message}`);
    }
    console.log();
  }
}

run();
