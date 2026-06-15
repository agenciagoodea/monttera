import { initDb } from '../../src/server/dbInitAsync';
import dbAsync from '../../src/server/dbAsync';

async function main() {
  console.log('Iniciando conexão e criação de tabelas no banco de dados...');
  try {
    await initDb();
    console.log('Tabelas criadas/verificadas com sucesso!');
    
    // Verifica se a tabela site_visits existe
    const tables = await dbAsync.all('SHOW TABLES');
    console.log('Tabelas no banco remoto:', tables);
  } catch (error) {
    console.error('Erro ao inicializar o banco:', error);
  } finally {
    await dbAsync.dispose();
  }
}

main();
