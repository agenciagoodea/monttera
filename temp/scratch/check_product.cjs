const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });

  try {
    const [rows] = await connection.execute('SELECT id, name, slug, status FROM products ORDER BY id DESC LIMIT 5');
    console.log('Últimos 5 produtos:', JSON.stringify(rows, null, 2));

    const [specific] = await connection.execute('SELECT id, name, slug, status FROM products WHERE id = 948 OR slug = "mario-bras"');
    console.log('Produto específico (948/mario-bras):', JSON.stringify(specific, null, 2));
  } catch (err) {
    console.error('Erro na consulta:', err);
  } finally {
    await connection.end();
  }
}

run();
