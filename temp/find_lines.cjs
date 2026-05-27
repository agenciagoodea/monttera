const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../server.ts');
const content = fs.readFileSync(serverPath, 'utf8');
const lines = content.split('\n');

const queries = ['budget', 'orcamento', 'custom-request', 'solicitacao', 'contact', 'sendEmail'];

queries.forEach(query => {
  console.log(`Buscando por "${query}" no server.ts...`);
  lines.forEach((line, idx) => {
    if (line.includes(query)) {
      console.log(`Linha ${idx + 1}: ${line.trim()}`);
    }
  });
});
