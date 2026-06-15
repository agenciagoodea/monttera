const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/produto/matriz-bordado-abelha-rainha',
  method: 'GET',
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  }
};

http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', res.headers);
    console.log('\n--- BODY ---');
    console.log(data);
  });
}).on('error', console.error).end();
