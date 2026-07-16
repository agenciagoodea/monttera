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

// 1. Popular product_category_relations com base no category_id dos produtos
const [result] = await conn.query(`
  INSERT IGNORE INTO product_category_relations (product_id, category_id)
  SELECT id, category_id FROM products
  WHERE category_id IS NOT NULL AND status = 'active'
`);
console.log('product_category_relations preenchidas:', result.affectedRows, 'linhas');

// 2. Verificar contagem
const [counts] = await conn.query(`
  SELECT pc.name, COUNT(pcr.product_id) as total
  FROM product_categories pc
  LEFT JOIN product_category_relations pcr ON pcr.category_id = pc.id
  GROUP BY pc.id, pc.name
  ORDER BY pc.sort_order
`);
console.log('\nContagem por categoria:');
for (const row of counts) {
  if (row.total > 0) console.log(` ${row.name}: ${row.total} produtos`);
}

// 3. Também adicionar produtos nas categorias pai (parent) para hierarquia funcionar
// Isso permite filtrar por categoria pai e retornar produtos das subcategorias
const [products] = await conn.query(`
  SELECT p.id, p.category_id, pc.parent_id
  FROM products p
  JOIN product_categories pc ON pc.id = p.category_id
  WHERE pc.parent_id IS NOT NULL AND p.status = 'active'
`);

let addedParent = 0;
for (const p of products) {
  await conn.query(`
    INSERT IGNORE INTO product_category_relations (product_id, category_id)
    VALUES (?, ?)
  `, [p.id, p.parent_id]);
  addedParent++;
}
console.log(`\nVinculos com categoria PAI adicionados: ${addedParent}`);

await conn.end();
console.log('\nConcluido!');
