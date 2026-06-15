const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Total de linhas:', lines.length);

const queries = [
  '/api/admin/products',
  'duplicate',
  'initDb',
  'startServer',
  'post(\'/api/admin/products\''
];

queries.forEach(query => {
  console.log(`\n--- Resultados para "${query}":`);
  lines.forEach((line, index) => {
    if (line.includes(query)) {
      console.log(`Linha ${index + 1}: ${line.trim()}`);
    }
  });
});
