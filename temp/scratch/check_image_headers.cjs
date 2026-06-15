const https = require('https');

function getUrlHeaders(url, userAgent) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'HEAD',
      headers: {
        'User-Agent': userAgent
      }
    };
    https.request(url, options, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers
      });
    }).on('error', reject).end();
  });
}

async function run() {
  const imageUrl = 'https://digitalbordados.com.br/uploads/matriz-bordado-mario-bros-one-978.jpg';
  
  const userAgents = {
    'Navegador Padrão': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Googlebot Geral': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Googlebot Imagens': 'Googlebot-Image/1.0'
  };

  for (const [name, ua] of Object.entries(userAgents)) {
    console.log(`\nTestando com User-Agent: ${name}`);
    try {
      const res = await getUrlHeaders(imageUrl, ua);
      console.log('Status Code:', res.statusCode);
      console.log('Headers:', JSON.stringify(res.headers, null, 2));
    } catch (err) {
      console.error('Erro:', err.message);
    }
  }
}

run();
