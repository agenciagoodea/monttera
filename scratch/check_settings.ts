import db from '../src/server/db.ts';
const { all } = db;

async function check() {
  try {
    console.log('--- SETTINGS ---');
    const settings = all('SELECT * FROM settings');
    console.table(settings);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
