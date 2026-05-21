import mysql from 'mysql2/promise';
import 'dotenv/config';

async function testConnection() {
  const config = {
    host: process.env.MYSQL_HOST || '187.110.162.234',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'digitalbordados_novo',
    password: process.env.MYSQL_PASSWORD || '93Ze6HbNpTQztygdCqgz',
    database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
    connectTimeout: 10000,
  };

  console.log('--- INICIANDO TESTE DE CONEXÃO ---');
  console.log(`Tentando conectar em: ${config.host}:${config.port}`);
  console.log(`Usuário: ${config.user}`);
  console.log(`Banco: ${config.database}`);
  console.log('----------------------------------');

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ SUCESSO: Conexão estabelecida com o banco de dados!');

    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log('✅ SUCESSO: Query de teste executada!');

    await connection.end();
    console.log('--- TESTE CONCLUÍDO COM ÊXITO ---');
  } catch (error: any) {
    console.error('❌ FALHA NA CONEXÃO:');
    console.error(`Código do Erro: ${error.code}`);
    console.error(`Mensagem: ${error.message}`);

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 DICA: O usuário ou a senha estão incorretos, OU o seu IP não está na lista de permissões (Remote MySQL) do servidor.');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n💡 DICA: O servidor não respondeu. Pode ser um bloqueio de Firewall no porto 3306.');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 DICA: O endereço do Host (IP) não foi encontrado.');
    }
    console.log('----------------------------------');
  }
}

testConnection();
