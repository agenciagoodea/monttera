const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  console.log('Connecting with config:', {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER
  });

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3307'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const [files] = await connection.query('SELECT * FROM product_files LIMIT 20');
  console.log('Sample file paths in DB:');
  console.dir(files, { depth: null });

  const [count] = await connection.query('SELECT COUNT(*) as count FROM product_files');
  console.log('Total product files in DB:', count[0].count);

  const [productsCount] = await connection.query('SELECT COUNT(*) as count FROM products');
  console.log('Total products in DB:', productsCount[0].count);

  await connection.end();
}

run().catch(console.error);
