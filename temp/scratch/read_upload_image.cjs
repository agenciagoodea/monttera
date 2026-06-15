const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../server.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Vamos ler o endpoint POST /api/admin/products/:id/main-image (linhas 4064 a 4151)
console.log('--- POST /api/admin/products/:id/main-image ---');
for (let i = 4063; i < 4151; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

// Vamos ler a parte do PUT /api/admin/products/:id que lida com a gravação de arquivos de imagem (linhas 3600 a 3730 - estimativa)
// Vamos buscar a linha que trata de "image" no PUT e listar ao redor
console.log('\n--- Gravação de imagem principal e galeria no PUT ---');
let startPutImage = 0;
lines.forEach((line, index) => {
  if (index >= 3458 && index < 3800) {
    if (line.includes('files[\'image\']') || line.includes('applyWatermark')) {
      if (startPutImage === 0) startPutImage = index - 10;
    }
  }
});
if (startPutImage > 0) {
  for (let i = startPutImage; i < startPutImage + 120; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
