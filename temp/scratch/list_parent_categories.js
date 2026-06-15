import dbAsync from '../../src/server/dbAsync.js';

async function list() {
  try {
    const categories = await dbAsync.all('SELECT id, name, slug, icon FROM product_categories WHERE parent_id IS NULL');
    console.log('Categorias Pai no Banco de Dados:');
    console.log(JSON.stringify(categories, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    process.exit(1);
  }
}

list();
