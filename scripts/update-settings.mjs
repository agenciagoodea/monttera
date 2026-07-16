import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env manualmente
const envPath = resolve(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.substring(0, eqIdx).trim();
  const val = trimmed.substring(eqIdx + 1).trim();
  process.env[key] = val;
}

const config = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

async function run() {
  const conn = await mysql.createConnection(config);
  
  const updates = [
    { k: 'site_name', v: 'Monttera' },
    { k: 'seo_meta_title', v: 'Monttera' },
    { k: 'seo_organization_name', v: 'Monttera' },
    { k: 'top_bar_message', v: 'Cadastre-se e aproveite todas as vantagens da nossa loja!' },
    { k: 'home_company_subtitle', v: 'Qualidade e confiança em produtos e serviços' },
    { k: 'home_company_text', v: 'Criamos soluções consistentes e atendimento especializado para sua melhor experiência.' },
    { k: 'home_company_vision', v: 'Ser referência em e-commerce de qualidade.' },
    { k: 'home_company_mission', v: 'Entregar produtos com excelência, agilidade e excelente suporte.' },
    { k: 'seo_keywords', v: 'loja online, produtos digitais, monttera, e-commerce' },
    { k: 'seo_meta_description', v: 'Monttera — sua loja online com os melhores produtos e entrega rápida.' }
  ];

  for (const item of updates) {
    await conn.query('UPDATE settings SET value = ? WHERE `key` = ?', [item.v, item.k]);
    console.log(`Atualizado: ${item.k} -> ${item.v}`);
  }

  await conn.end();
  console.log('Fim!');
}

run().catch(console.error);
