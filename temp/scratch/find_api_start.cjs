const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('--- Buscando rotas API em server.ts ---');
lines.forEach((line, index) => {
  if (line.includes("app.get('/api/") || line.includes("app.post('/api/")) {
    if (index < 3125 && index > 1500) {
      console.log(`Linha ${index + 1}: ${line.trim()}`);
    }
  }
});
