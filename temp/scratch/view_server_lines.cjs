const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

for (let i = 2449; i < 2475; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
