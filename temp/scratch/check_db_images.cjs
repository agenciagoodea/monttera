const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  let connection;
  try {
    console.log('Tentando conectar ao banco de dados MySQL...');
    console.log('Host:', process.env.MYSQL_HOST);
    console.log('Port:', process.env.MYSQL_PORT);
    console.log('Database:', process.env.MYSQL_DATABASE);
    console.log('User:', process.env.MYSQL_USER);

    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || ''
    });

    console.log('Conexão realizada com sucesso!');

    // 1. Verificar algumas imagens de produtos
    const [products] = await connection.query(
      `SELECT id, name, slug, image, image_alt FROM products WHERE status = 'active' AND image IS NOT NULL AND image != '' LIMIT 10`
    );
    console.log('\n--- 10 primeiros produtos ativos com imagem ---');
    console.log(JSON.stringify(products, null, 2));

    // 2. Verificar configurações de SEO
    const [settings] = await connection.query(
      `SELECT name, value FROM settings WHERE name LIKE '%seo%' OR name = 'app_url'`
    );
    console.log('\n--- Configurações de SEO e URL ---');
    console.log(JSON.stringify(settings, null, 2));

  } catch (err) {
    console.error('Erro de conexão/consulta:', err);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
