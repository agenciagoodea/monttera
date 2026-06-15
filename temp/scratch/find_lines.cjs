const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const query = 'public_categories';

console.log(`Buscando por: "${query}" em ${filePath}`);
lines.forEach((line, idx) => {
  if (line.includes(query)) {
    console.log(`Linha ${idx + 1}: ${line.trim()}`);
  }
});
