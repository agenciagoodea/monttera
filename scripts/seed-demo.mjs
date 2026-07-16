/**
 * Seed script — Insere categorias, subcategorias e 30 produtos demo com imagens reais
 * Uso: node scripts/seed-demo.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env
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

function slug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function upsertCategory(name, slugStr, icon = null, parentId = null, sortOrder = 0) {
  const [existing] = await conn.query('SELECT id FROM product_categories WHERE slug = ?', [slugStr]);
  if (existing.length > 0) {
    console.log(`  [SKIP] Categoria existente: ${name}`);
    return existing[0].id;
  }
  const [res] = await conn.query(
    `INSERT INTO product_categories (name, slug, icon, parent_id, status, sort_order, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, NOW())`,
    [name, slugStr, icon, parentId, sortOrder]
  );
  console.log(`  [OK] Categoria criada: ${name} (id=${res.insertId})`);
  return res.insertId;
}

// ─── Categorias Principais ───────────────────────────────────────────────────
console.log('\n=== CATEGORIAS PRINCIPAIS ===');
const celulares   = await upsertCategory('Celulares & Smartphones', 'celulares', 'smartphone', null, 1);
const informatica = await upsertCategory('Informática', 'informatica', 'laptop', null, 2);
const perfumes    = await upsertCategory('Perfumes & Beleza', 'perfumes-beleza', 'sparkles', null, 3);
const eletronicos = await upsertCategory('Eletrônicos', 'eletronicos', 'tv', null, 4);
const games       = await upsertCategory('Games & Consoles', 'games', 'joystick', null, 5);
const moda        = await upsertCategory('Moda & Acessórios', 'moda', 'shirt', null, 6);
const lazer       = await upsertCategory('Lazer & Esportes', 'lazer', 'tent', null, 7);

// ─── Subcategorias ────────────────────────────────────────────────────────────
console.log('\n=== SUBCATEGORIAS ===');
const iphone   = await upsertCategory('iPhone', 'celulares-iphone', null, celulares, 1);
const samsung  = await upsertCategory('Samsung Galaxy', 'celulares-samsung', null, celulares, 2);
const xiaomi   = await upsertCategory('Xiaomi', 'celulares-xiaomi', null, celulares, 3);
const motorola = await upsertCategory('Motorola', 'celulares-motorola', null, celulares, 4);

const notebooks  = await upsertCategory('Notebooks', 'informatica-notebooks', null, informatica, 1);
const tablets    = await upsertCategory('Tablets', 'informatica-tablets', null, informatica, 2);
const perifericos= await upsertCategory('Periféricos', 'informatica-perifericos', null, informatica, 3);
const storage    = await upsertCategory('Armazenamento', 'informatica-armazenamento', null, informatica, 4);

const perfFem = await upsertCategory('Perfumes Femininos', 'perfumes-femininos', null, perfumes, 1);
const perfMas = await upsertCategory('Perfumes Masculinos', 'perfumes-masculinos', null, perfumes, 2);
const cosmet  = await upsertCategory('Cosméticos', 'cosmeticos', null, perfumes, 3);

const smarttv  = await upsertCategory('Smart TVs', 'eletronicos-smarttv', null, eletronicos, 1);
const caixasom = await upsertCategory('Caixas de Som', 'eletronicos-caixasom', null, eletronicos, 2);
const cameras  = await upsertCategory('Câmeras', 'eletronicos-cameras', null, eletronicos, 3);

const playstation = await upsertCategory('PlayStation', 'games-playstation', null, games, 1);
const xbox        = await upsertCategory('Xbox', 'games-xbox', null, games, 2);
const nintendo    = await upsertCategory('Nintendo', 'games-nintendo', null, games, 3);
const acGamer     = await upsertCategory('Acessórios Gamer', 'games-acessorios', null, games, 4);

const tenis  = await upsertCategory('Tênis & Calçados', 'moda-tenis', null, moda, 1);
const oculos = await upsertCategory('Óculos de Sol', 'moda-oculos', null, moda, 2);
const relogios= await upsertCategory('Relógios', 'moda-relogios', null, moda, 3);

const bicicletas = await upsertCategory('Bicicletas', 'lazer-bicicletas', null, lazer, 1);
const camping    = await upsertCategory('Camping', 'lazer-camping', null, lazer, 2);
const fitness    = await upsertCategory('Fitness & Aventura', 'lazer-fitness', null, lazer, 3);

// ─── Produtos Demo ────────────────────────────────────────────────────────────
const products = [
  // Celulares
  {
    name: 'Apple iPhone 16 Pro 256GB Titânio Natural',
    catId: iphone,
    price: 8499.00, sale_price: 7299.00,
    image: 'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=800&q=80',
    desc: 'O iPhone 16 Pro com chip A18 Pro, câmera de 48MP e tela Super Retina XDR de 6,3 polegadas.',
    featured: 1, is_new: 1, brand: 'Apple', sku: 'IPH16P-256-TN'
  },
  {
    name: 'Samsung Galaxy S25 Ultra 512GB Phantom Black',
    catId: samsung,
    price: 7999.00, sale_price: 6999.00,
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800&q=80',
    desc: 'Galaxy S25 Ultra com S Pen integrada, câmera de 200MP e bateria de 5000mAh.',
    featured: 1, is_new: 1, brand: 'Samsung', sku: 'SGS25U-512-PB'
  },
  {
    name: 'Xiaomi 14 Ultra 512GB Global',
    catId: xiaomi,
    price: 5299.00, sale_price: null,
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
    desc: 'Xiaomi 14 Ultra com câmera Leica, Snapdragon 8 Gen 3 e tela AMOLED 6,73".',
    featured: 0, is_new: 1, brand: 'Xiaomi', sku: 'XMI14U-512-GL'
  },
  {
    name: 'Motorola Edge 50 Pro 256GB Azul Vegan Leather',
    catId: motorola,
    price: 2799.00, sale_price: 2399.00,
    image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=800&q=80',
    desc: 'Edge 50 Pro com câmera de 50MP, tela pOLED 6,7" e carregamento rápido 125W.',
    featured: 0, is_new: 0, brand: 'Motorola', sku: 'MOTE50P-256-AZ'
  },
  // Informática
  {
    name: 'Apple MacBook Air M3 13" 16GB 512GB',
    catId: notebooks,
    price: 12999.00, sale_price: 11499.00,
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
    desc: 'MacBook Air com chip M3, bateria de até 18h, tela Liquid Retina e design ultraleve.',
    featured: 1, is_new: 1, brand: 'Apple', sku: 'MBA-M3-16-512'
  },
  {
    name: 'Dell XPS 15 Intel Core i9 32GB 1TB RTX 4070',
    catId: notebooks,
    price: 15499.00, sale_price: null,
    image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80',
    desc: 'XPS 15 com tela OLED 3,5K, placa de vídeo dedicada e desempenho profissional.',
    featured: 1, is_new: 0, brand: 'Dell', sku: 'DXPS15-I9-32-1TB'
  },
  {
    name: 'iPad Pro M4 11" 256GB Wi-Fi',
    catId: tablets,
    price: 9199.00, sale_price: 8299.00,
    image: 'https://images.unsplash.com/photo-1544244015-0df4702503aa?w=800&q=80',
    desc: 'iPad Pro com chip M4, tela Ultra Retina XDR e suporte ao Apple Pencil Pro.',
    featured: 1, is_new: 1, brand: 'Apple', sku: 'IPADPRO-M4-256'
  },
  {
    name: 'SSD Samsung 990 Pro 2TB NVMe PCIe 4.0',
    catId: storage,
    price: 899.00, sale_price: 749.00,
    image: 'https://images.unsplash.com/photo-1601999109332-542b18dbec61?w=800&q=80',
    desc: 'SSD Samsung 990 Pro com velocidade de leitura de até 7.450 MB/s.',
    featured: 0, is_new: 0, brand: 'Samsung', sku: 'SSD990P-2TB'
  },
  {
    name: 'Logitech MX Master 3S Mouse Sem Fio',
    catId: perifericos,
    price: 599.00, sale_price: 499.00,
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80',
    desc: 'Mouse MX Master 3S com sensor de 8000 DPI, scroll magnético e bateria de 70 dias.',
    featured: 0, is_new: 0, brand: 'Logitech', sku: 'LMXM3S'
  },
  // Perfumes
  {
    name: 'Chanel N°5 Eau de Parfum 100ml Feminino',
    catId: perfFem,
    price: 1299.00, sale_price: 999.00,
    image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80',
    desc: 'O perfume mais famoso do mundo. Notas florais com toque de baunilha e sândalo.',
    featured: 1, is_new: 0, brand: 'Chanel', sku: 'CHAN5-EDP-100'
  },
  {
    name: 'Dior Sauvage Eau de Parfum 100ml Masculino',
    catId: perfMas,
    price: 849.00, sale_price: 699.00,
    image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80',
    desc: 'Sauvage EDP com notas de bergamota, pimenta preta e ambroxan selvagem.',
    featured: 1, is_new: 0, brand: 'Dior', sku: 'DSAUVEDP-100'
  },
  {
    name: 'Lancôme Trésor Eau de Parfum 100ml',
    catId: perfFem,
    price: 749.00, sale_price: null,
    image: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=800&q=80',
    desc: 'Trésor, o clássico perfume floral de Lancôme com notas de rosa e framboesa.',
    featured: 0, is_new: 0, brand: 'Lancôme', sku: 'LANTRES-EDP-100'
  },
  {
    name: 'La Mer Crème de la Mer 60ml Hidratante',
    catId: cosmet,
    price: 2299.00, sale_price: 1999.00,
    image: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800&q=80',
    desc: 'O hidratante premium com extrato de algas marinhas para renovação celular.',
    featured: 0, is_new: 0, brand: 'La Mer', sku: 'LMCREME-60'
  },
  // Eletrônicos
  {
    name: 'Samsung Neo QLED 8K 65" Smart TV 2024',
    catId: smarttv,
    price: 18999.00, sale_price: 15999.00,
    image: 'https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?w=800&q=80',
    desc: 'TV 8K Neo QLED com Processador Neural Quantum 8K e Dolby Atmos.',
    featured: 1, is_new: 1, brand: 'Samsung', sku: 'SAMNEOQ-8K-65'
  },
  {
    name: 'JBL Charge 5 Caixa de Som Bluetooth 40W',
    catId: caixasom,
    price: 1299.00, sale_price: 999.00,
    image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80',
    desc: 'JBL Charge 5 à prova d\'água IPX7, 20h de bateria e função power bank.',
    featured: 0, is_new: 0, brand: 'JBL', sku: 'JBLCH5-40W'
  },
  {
    name: 'Sony WH-1000XM5 Headphone Noise Cancelling',
    catId: caixasom,
    price: 2299.00, sale_price: 1899.00,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
    desc: 'Headphone Sony com cancelamento de ruído líder da indústria e 30h de bateria.',
    featured: 1, is_new: 0, brand: 'Sony', sku: 'SNYWH1000XM5'
  },
  {
    name: 'GoPro Hero 13 Black + Acessórios Kit',
    catId: cameras,
    price: 3199.00, sale_price: 2799.00,
    image: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80',
    desc: 'GoPro Hero 13 com vídeo 5.3K, HyperSmooth 6.0 e bateria Enduro de longa duração.',
    featured: 0, is_new: 1, brand: 'GoPro', sku: 'GPH13B-KIT'
  },
  // Games
  {
    name: 'PlayStation 5 Pro 1TB Digital Edition',
    catId: playstation,
    price: 5999.00, sale_price: null,
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&q=80',
    desc: 'PS5 Pro com GPU aprimorada, Ray Tracing melhorado e armazenamento SSD de 1TB.',
    featured: 1, is_new: 1, brand: 'Sony', sku: 'PS5PRO-1TB-DE'
  },
  {
    name: 'Nintendo Switch 2 256GB Joy-Con Neon',
    catId: nintendo,
    price: 3499.00, sale_price: 3199.00,
    image: 'https://images.unsplash.com/photo-1585620385456-4759f9b5c7d9?w=800&q=80',
    desc: 'Nintendo Switch 2 com tela OLED maior, Joy-Con melhorados e 256GB de armazenamento.',
    featured: 1, is_new: 1, brand: 'Nintendo', sku: 'NSW2-256-NEON'
  },
  {
    name: 'Xbox Series X 1TB Standard Edition',
    catId: xbox,
    price: 4499.00, sale_price: 3899.00,
    image: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=800&q=80',
    desc: 'Xbox Series X com 12 teraflops, 16GB GDDR6 e retrocompatibilidade total.',
    featured: 0, is_new: 0, brand: 'Microsoft', sku: 'XBXSX-1TB'
  },
  {
    name: 'Cadeira Gamer ThunderX3 EC1 Vermelha',
    catId: acGamer,
    price: 1499.00, sale_price: 1199.00,
    image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&q=80',
    desc: 'Cadeira gamer ergonômica com apoio lombar, encosto reclinável e tecido respirável.',
    featured: 0, is_new: 0, brand: 'ThunderX3', sku: 'TX3EC1-VM'
  },
  // Moda
  {
    name: 'Nike Air Jordan 1 Retro High OG Chicago',
    catId: tenis,
    price: 2199.00, sale_price: 1799.00,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80',
    desc: 'Air Jordan 1 Retro High OG edição Chicago, o clássico do basquete com visual icônico.',
    featured: 1, is_new: 0, brand: 'Nike', sku: 'AJRD1-CHI-42'
  },
  {
    name: 'Ray-Ban New Wayfarer Classic Preto G15',
    catId: oculos,
    price: 799.00, sale_price: 649.00,
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&q=80',
    desc: 'Ray-Ban New Wayfarer com armação em acetato, lentes G-15 e proteção UV400.',
    featured: 0, is_new: 0, brand: 'Ray-Ban', sku: 'RBNW2132-G15'
  },
  {
    name: 'Apple Watch Ultra 2 49mm Titanium Trail Loop',
    catId: relogios,
    price: 7499.00, sale_price: 6799.00,
    image: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=800&q=80',
    desc: 'Apple Watch Ultra 2 com GPS de precisão dupla, resistência extrema e bateria de 60h.',
    featured: 1, is_new: 1, brand: 'Apple', sku: 'AWU2-49-TI-TL'
  },
  {
    name: 'Adidas Ultraboost 24 Running Preto Branco',
    catId: tenis,
    price: 999.00, sale_price: 799.00,
    image: 'https://images.unsplash.com/photo-1556906781-9a412961d28c?w=800&q=80',
    desc: 'Ultraboost 24 com amortecimento BOOST e palmilha CONTINENTAL para máxima performance.',
    featured: 0, is_new: 1, brand: 'Adidas', sku: 'ADUB24-PB-42'
  },
  // Lazer
  {
    name: 'Garmin Forerunner 965 GPS Running Watch',
    catId: fitness,
    price: 4999.00, sale_price: 4299.00,
    image: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&q=80',
    desc: 'Garmin Forerunner 965 com tela AMOLED, métricas avançadas de corrida e mapas topográficos.',
    featured: 1, is_new: 0, brand: 'Garmin', sku: 'GAFRN965'
  },
  {
    name: 'Trek FX 3 Disc Bicicleta Híbrida Tamanho M',
    catId: bicicletas,
    price: 5299.00, sale_price: null,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    desc: 'Bicicleta híbrida Trek FX 3 com freios a disco hidráulicos, câmbio Shimano 24v.',
    featured: 0, is_new: 0, brand: 'Trek', sku: 'TREKFX3-M'
  },
  {
    name: 'Barraca Coleman Sundome 4 Pessoas Azul',
    catId: camping,
    price: 899.00, sale_price: 749.00,
    image: 'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&q=80',
    desc: 'Barraca para 4 pessoas com proteção WeatherTec e montagem em 10 minutos.',
    featured: 0, is_new: 0, brand: 'Coleman', sku: 'COLSUN4-AZ'
  },
  {
    name: 'DJI Mini 4 Pro Drone 4K HDR',
    catId: fitness,
    price: 5499.00, sale_price: 4799.00,
    image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&q=80',
    desc: 'DJI Mini 4 Pro com câmera 4K HDR, 34 min de voo e Omnidirectional Obstacle Sensing.',
    featured: 1, is_new: 1, brand: 'DJI', sku: 'DJIMINI4P'
  },
  {
    name: 'Kindle Paperwhite 16GB Waterproof',
    catId: lazer,
    price: 799.00, sale_price: 649.00,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80',
    desc: 'Kindle Paperwhite com tela de 6,8", luz quente ajustável e resistente à água.',
    featured: 0, is_new: 1, brand: 'Amazon', sku: 'KINDPW-16'
  },
];

// ─── Inserção de Produtos ─────────────────────────────────────────────────────
console.log('\n=== PRODUTOS ===');
let inserted = 0, skipped = 0;
for (const p of products) {
  const productSlug = slug(p.name);
  const [existing] = await conn.query('SELECT id FROM products WHERE slug = ?', [productSlug]);
  if (existing.length > 0) {
    console.log(`  [SKIP] ${p.name}`);
    skipped++;
    continue;
  }

  await conn.query(`
    INSERT INTO products 
      (name, slug, description, short_description, price, sale_price, image, category_id, 
       is_new, is_featured, brand, sku, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
  `, [
    p.name,
    productSlug,
    p.desc,
    p.desc.substring(0, 120),
    p.price,
    p.sale_price || null,
    p.image,
    p.catId,
    p.is_new,
    p.featured,
    p.brand,
    p.sku,
  ]);
  inserted++;
  console.log(`  [OK] ${p.name}`);
}

await conn.end();
console.log(`\n✅ Seed concluído: ${inserted} produtos criados, ${skipped} ignorados.`);
console.log(`   Categorias: 7 principais + 21 subcategorias`);
