import mysql from 'mysql2/promise';
import 'dotenv/config';

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || '3306');
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'digitalbordados_novo';

  console.log(`Tentando conectar ao MySQL em ${host}:${port} como ${user}...`);

  try {
    // Conecta sem especificar banco de dados para evitar erro ER_BAD_DB_ERROR
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password
    });

    console.log('Conectado ao MySQL com sucesso!');
    console.log(`Garantindo a criação do banco de dados: ${database}...`);

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

    console.log(`Banco de dados "${database}" criado ou já existente!`);
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Erro ao conectar ou criar o banco de dados:', error);
    process.exit(1);
  }
}

main();
