const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Vamos extrair as linhas da rota GET /api/admin/products/:id (linhas 3861 a 3896)
console.log('--- Rota GET /api/admin/products/:id ---');
for (let i = 3860; i < 3896; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

// Vamos buscar também a rota PATCH/PUT de produtos (linhas 3459 em diante) para entender a lógica de atualização
console.log('\n--- Rota PUT /api/admin/products/:id (primeiras 50 linhas) ---');
for (let i = 3458; i < 3508; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
