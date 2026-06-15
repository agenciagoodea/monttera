const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('--- Buscando getClientIp em server.ts ---');
lines.forEach((line, index) => {
  if (line.includes('function getClientIp') || line.includes('const getClientIp')) {
    console.log(`Linha ${index + 1}: ${line.trim()}`);
  }
});
