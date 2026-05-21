import mysql from 'mysql2/promise';
import 'dotenv/config';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  charset: string;
};

const dbConfig: DbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
  charset: 'utf8mb4',
};

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_ASYNC_POOL_LIMIT || '10'),
  queueLimit: 0,
  namedPlaceholders: false,
});

function normalizeParams(params: any[]) {
  return params.map((value) => (value === undefined ? null : value));
}

async function query<T = any>(sql: string, ...params: any[]): Promise<T> {
  const [rows] = await pool.query(sql, normalizeParams(params));
  return rows as T;
}

async function all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
  const rows = await query<T[]>(sql, ...params);
  return Array.isArray(rows) ? rows : [];
}

async function get<T = any>(sql: string, ...params: any[]): Promise<T | undefined> {
  const rows = await all<T>(sql, ...params);
  return rows[0];
}

async function run(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
  const [result] = await pool.execute(sql, normalizeParams(params));
  const packet = result as any;
  return {
    changes: Number(packet?.affectedRows ?? packet?.changedRows ?? 0),
    lastInsertRowid: Number(packet?.insertId ?? 0),
  };
}

async function transaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function dispose() {
  await pool.end();
}

export default {
  query,
  all,
  get,
  run,
  transaction,
  dispose,
};

