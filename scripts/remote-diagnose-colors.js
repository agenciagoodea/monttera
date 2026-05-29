// Script para diagnóstico da gravação de cores e pontos via UPDATE
const path = require('path');
process.chdir('/home/digitalbordados/digitalbordados');
require('dotenv').config({ path: '/home/digitalbordados/digitalbordados/.env' });

const mysql = require('/home/digitalbordados/digitalbordados/node_modules/mysql2/promise');

async function testPut() {
  console.log('=== TESTE DE DIAGNÓSTICO PUT DE PRODUTO ===');
  
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  });

  const productId = 948; // Mario Bros
  console.log(`Lendo produto #${productId} antes do teste...`);
  
  const [rows] = await connection.execute('SELECT id, name, colors, stitch_count FROM products WHERE id = ?', [productId]);
  if (rows.length === 0) {
    console.error('Produto não encontrado!');
    await connection.end();
    return;
  }
  
  const existingProduct = rows[0];
  console.log('Produto atual no banco:', JSON.stringify(existingProduct));

  // Simular recepção de req.body com alteração de cores e pontos
  const inputColors = "5 cores";
  const inputStitchCount = "16500";

  console.log(`Simulando lógica de parse do server.ts...`);
  const nextColors = inputColors !== undefined
    ? ((typeof inputColors === 'string' ? inputColors.trim() : String(inputColors)) || null)
    : existingProduct.colors;

  const nextStitchCount = inputStitchCount !== undefined
    ? (inputStitchCount === '' || inputStitchCount === null ? null : Number(inputStitchCount))
    : existingProduct.stitch_count;

  console.log('Valores após parse para o UPDATE:');
  console.log('  nextColors:', JSON.stringify(nextColors));
  console.log('  nextStitchCount:', JSON.stringify(nextStitchCount));

  console.log('Executando query de UPDATE no banco de produção...');
  try {
    const [updateResult] = await connection.execute(`
      UPDATE products
      SET
        stitch_count = ?,
        colors = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nextStitchCount, nextColors, productId]);
    
    console.log('Resultado do UPDATE:', JSON.stringify(updateResult));

    // Ler novamente para atestar gravação física no banco
    const [rowsAfter] = await connection.execute('SELECT id, name, colors, stitch_count FROM products WHERE id = ?', [productId]);
    console.log('Produto após o UPDATE no banco:', JSON.stringify(rowsAfter[0]));
    
    // Restaurar valores anteriores para não alterar dados reais do usuário permanentemente
    await connection.execute(`
      UPDATE products
      SET
        stitch_count = ?,
        colors = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [existingProduct.stitch_count, existingProduct.colors, productId]);
    console.log('Valores originais restaurados com sucesso.');
    
  } catch (err) {
    console.error('ERRO ao executar a query de UPDATE:', err);
  } finally {
    await connection.end();
    console.log('=== FIM DO DIAGNÓSTICO ===');
  }
}

testPut().catch(console.error);
