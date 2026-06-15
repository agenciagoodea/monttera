const https = require('https');

https.get('https://digitalbordados.com.br/sitemap-static.xml', (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('--- CONTENT-TYPE ---');
    console.log(res.headers['content-type']);
    console.log('--- BODY ---');
    console.log(body);
  });
}).on('error', console.error);
