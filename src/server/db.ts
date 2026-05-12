import mysql from 'mysql2/promise';
import 'dotenv/config';

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
};

// Singleton pool - reused across serverless invocations
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Async query functions
export async function queryAsync(sql: string, params: any[] = []): Promise<any> {
  const [result] = await getPool().execute(sql, params);
  return result;
}

export async function allAsync<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await queryAsync(sql, params);
  return Array.isArray(result) ? (result as T[]) : [];
}

export async function getAsync<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const rows = await allAsync<T>(sql, params);
  return rows[0];
}

export async function runAsync(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
  const result = (await queryAsync(sql, params)) as any;
  if (Array.isArray(result)) {
    return { changes: 0, lastInsertRowid: 0 };
  }
  return {
    changes: result.affectedRows ?? result.changedRows ?? 0,
    lastInsertRowid: result.insertId ?? 0,
  };
}

export async function tableExistsAsync(table: string): Promise<boolean> {
  const row = await getAsync(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.MYSQL_DATABASE || 'digitalbordados_novo', table],
  );
  return !!row;
}

export async function columnExistsAsync(table: string, column: string): Promise<boolean> {
  const row = await getAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DATABASE || 'digitalbordados_novo', table, column],
  );
  return !!row;
}

export async function ensureColumnAsync(table: string, column: string, definition: string): Promise<void> {
  const exists = await columnExistsAsync(table, column);
  if (!exists) {
    await queryAsync(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function createIndexIfNotExistsAsync(table: string, indexName: string, ddl: string): Promise<void> {
  const existing = await getAsync(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [process.env.MYSQL_DATABASE || 'digitalbordados_novo', table, indexName],
  );
  if (!existing) {
    try { await queryAsync(ddl); } catch {}
  }
}

// Legacy sync-compatible wrapper for dev environment
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

type QueryRows = Record<string, any>[];
type QueryWriteResult = { affectedRows?: number; changedRows?: number; insertId?: number };

let _syncConn: any = null;
function getSyncConn() {
  if (!_syncConn) {
    const MySql = require('sync-mysql2');
    _syncConn = new MySql(dbConfig);
  }
  return _syncConn;
}

function query(sql: string, ...params: any[]) {
  return getSyncConn().query(sql, params);
}

function all<T = any>(sql: string, ...params: any[]): T[] {
  const result = query(sql, ...params);
  return Array.isArray(result) ? (result as T[]) : [];
}

function get<T = any>(sql: string, ...params: any[]): T | undefined {
  return all<T>(sql, ...params)[0];
}

function run(sql: string, ...params: any[]) {
  const result = query(sql, ...params) as QueryRows | QueryWriteResult;
  if (Array.isArray(result)) return { changes: 0, lastInsertRowid: 0 };
  return {
    changes: (result as QueryWriteResult).affectedRows ?? (result as QueryWriteResult).changedRows ?? 0,
    lastInsertRowid: (result as QueryWriteResult).insertId ?? 0,
  };
}

function transaction<T extends (...args: any[]) => any>(callback: T): T {
  return ((...args: any[]) => {
    query('START TRANSACTION');
    try {
      const result = callback(...args);
      query('COMMIT');
      return result;
    } catch (error) {
      query('ROLLBACK');
      throw error;
    }
  }) as T;
}

export { tableExistsAsync as tableExists, columnExistsAsync as columnExists };
export default { query, all, get, run, transaction };
