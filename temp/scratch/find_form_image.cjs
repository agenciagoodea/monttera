const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../src/pages/admin/AdminProductForm.tsx');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

const queries = [
  'image',
  'gallery',
  'duplicate',
  'imagePreview',
  'fetchProduct',
  'useEffect'
];

queries.forEach(query => {
  console.log(`\n--- Resultados para "${query}" em AdminProductForm.tsx:`);
  let count = 0;
  lines.forEach((line, index) => {
    if (line.includes(query)) {
      count++;
      if (count <= 20) {
        console.log(`Linha ${index + 1}: ${line.trim()}`);
      }
    }
  });
  if (count > 20) {
    console.log(`... e mais ${count - 20} ocorrências.`);
  }
});
