import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  process.env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const sideBanners = [
  {
    id: 'side_1',
    title: 'Super Ofertas Informática',
    description: 'Descontos de até 30% em MacBooks e periféricos.',
    image_url: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=400&q=80',
    link: '/loja?category=informatica',
    active: true,
    show_mobile: true,
    show_desktop: true
  },
  {
    id: 'side_2',
    title: 'iPhone 16 Pro',
    description: 'Garanta o seu com as melhores condições de parcelamento.',
    image_url: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=400&q=80',
    link: '/loja?category=celulares-iphone',
    active: true,
    show_mobile: true,
    show_desktop: true
  },
  {
    id: 'side_3',
    title: 'Perfumes Importados',
    description: 'Fragrâncias exclusivas com preços imperdíveis.',
    image_url: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=400&q=80',
    link: '/loja?category=perfumes-beleza',
    active: true,
    show_mobile: true,
    show_desktop: true
  },
  {
    id: 'side_4',
    title: 'PlayStation 5 Pro',
    description: 'Sinta o poder do novo console da Sony.',
    image_url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400&q=80',
    link: '/loja?category=games-playstation',
    active: true,
    show_mobile: true,
    show_desktop: true
  },
  {
    id: 'side_5',
    title: 'Estilo & Conforto',
    description: 'Tênis e acessórios com design e qualidade premium.',
    image_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&q=80',
    link: '/loja?category=moda-tenis',
    active: true,
    show_mobile: true,
    show_desktop: true
  },
  {
    id: 'side_6',
    title: 'Aventura & Lazer',
    description: 'Tudo o que você precisa para o seu próximo acampamento.',
    image_url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=80',
    link: '/loja?category=lazer-camping',
    active: true,
    show_mobile: true,
    show_desktop: true
  }
];

const sideSlidersJson = JSON.stringify(sideBanners);

await conn.query(
  'INSERT INTO settings (`key`, value) VALUES ("side_sliders", ?) ON DUPLICATE KEY UPDATE value = ?',
  [sideSlidersJson, sideSlidersJson]
);

console.log('✅ Banners laterais iniciais configurados com sucesso!');
await conn.end();
