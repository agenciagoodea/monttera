import dbAsync from '../../src/server/dbAsync.js';

async function check() {
  try {
    const columns = await dbAsync.all('SHOW COLUMNS FROM product_categories');
    console.log('Colunas de product_categories:');
    console.log(JSON.stringify(columns, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Erro ao verificar colunas:', error);
    process.exit(1);
  }
}

check();
