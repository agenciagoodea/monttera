import dbAsync from './dbAsync';

export async function initDb() {
  // Keep startup health-check async; schema migrations are handled by SQL scripts/admin routines.
  await dbAsync.query('SELECT 1');
}

