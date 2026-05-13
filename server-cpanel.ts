import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import apiApp from './api/index'; // Importa a configuração exata do Vercel (com MySQL)

const __filename = fileURLToPath(import.meta.url);
const _dir = path.dirname(__filename);
const distPath = path.join(_dir, 'dist');

console.log('App Root:', _dir);
console.log('Dist Path:', distPath);

const app = express();

// 1. Servir estáticos primeiro (Prioridade Máxima)
app.use(express.static(distPath));

// 2. Rotas da API
app.use(apiApp);

// 3. Fallback para o index.html com verificação de erro amigável
app.get('*', (req, res) => {
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send(`Erro: O arquivo index.html não foi encontrado no servidor. Caminho esperado: ${indexFile}`);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
