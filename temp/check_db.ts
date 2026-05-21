import db from './src/server/db.ts';
const { all } = db;

async function check() {
  try {
    console.log('--- STATUSES ---');
    const statuses = all('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
    console.table(statuses);

    console.log('\n--- ORDER ITEMS SAMPLE ---');
    const items = all('SELECT * FROM order_items LIMIT 5');
    console.table(items);

    console.log('\n--- PRODUCTS SAMPLE ---');
    const products = all('SELECT id, name, category_id FROM products LIMIT 5');
    console.table(products);

    console.log('\n--- CATEGORIES ---');
    const cats = all('SELECT id, name FROM product_categories');
    console.table(cats);
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
