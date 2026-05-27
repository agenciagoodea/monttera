const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../server.ts');
let content = fs.readFileSync(targetFilePath, 'utf8');

// A linha original
const targetStr = `      const reqFiles = (req.files || []) ;`;

// A linha modificada
const replacementStr = `      const reqFiles = (req.files || []) as any;`;

// Normalizar
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = normalize(targetStr);

if (normalizedContent.includes(normalizedTarget)) {
  content = normalizedContent.replace(normalizedTarget, replacementStr);
  fs.writeFileSync(targetFilePath, content, 'utf8');
  console.log('server.ts reqFiles corrigido contra erros de iterador com sucesso!');
} else {
  console.error('Erro: não foi possível encontrar a linha const reqFiles no server.ts!');
}
