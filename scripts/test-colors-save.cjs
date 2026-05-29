// Script diagnóstico: verifica o campo colors nos produtos
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql2 = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

async function run() {
  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS,
    database: process.env.MYSQL_DATABASE,
  });

  console.log('\n=== DIAGNÓSTICO: campo COLORS nos produtos ===\n');

  // Verificar a definição da coluna colors no banco
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM products LIKE 'colors'");
    console.log('Definição da coluna:', JSON.stringify(cols, null, 2));
  } catch(e) { console.log('ERRO ao verificar coluna:', e.message); }

  // Ver os 10 últimos produtos e seus valores de colors
  try {
    const [rows] = await conn.query(
      "SELECT id, name, colors, stitch_count, updated_at FROM products ORDER BY updated_at DESC LIMIT 10"
    );
    console.log('\n--- Últimos 10 produtos (id | name | colors | stitch_count | updated_at) ---');
    rows.forEach(r => console.log(`#${r.id} | ${String(r.name).substring(0,30)} | colors="${r.colors}" | pontos=${r.stitch_count} | ${r.updated_at}`));
  } catch(e) { console.log('ERRO:', e.message); }

  // Verificar especificamente o produto 948 (Mario Bros da screenshot)
  try {
    const [rows] = await conn.query("SELECT id, name, colors, stitch_count FROM products WHERE id = 948");
    if (rows.length > 0) {
      const p = rows[0];
      console.log(`\n--- Produto #948 ---`);
      console.log(`name: ${p.name}`);
      console.log(`colors: "${p.colors}" (tipo: ${typeof p.colors})`);
      console.log(`stitch_count: ${p.stitch_count}`);
    }
  } catch(e) { console.log('ERRO ao buscar produto 948:', e.message); }

  // Tentar fazer um UPDATE manual para testar se salva
  try {
    console.log('\n--- Testando UPDATE manual do colors ---');
    await conn.query("UPDATE products SET colors = 'TEST_4', updated_at = NOW() WHERE id = 948");
    const [rows] = await conn.query("SELECT id, colors FROM products WHERE id = 948");
    console.log('Após UPDATE:', rows[0]);
    // Reverter
    await conn.query("UPDATE products SET colors = '4', updated_at = NOW() WHERE id = 948");
    const [rows2] = await conn.query("SELECT id, colors FROM products WHERE id = 948");
    console.log('Após reverter:', rows2[0]);
  } catch(e) { console.log('ERRO ao testar UPDATE:', e.message); }

  await conn.end();
  console.log('\n=== FIM ===');
}

run().catch(err => { console.error('ERRO GERAL:', err.message); process.exit(1); });
