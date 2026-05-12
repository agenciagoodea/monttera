import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// ─── DB Pool ─────────────────────────────────────────────────────────────────
let pool: mysql.Pool | null = null;
function getPool() {
  if (!pool) {
    const config = {
      host: process.env.MYSQL_HOST || '177.136.229.86',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'digitalbordados_novo',
      password: process.env.MYSQL_PASSWORD || 'vmsC9hNpxwqAx3HGc8Md',
      database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
    };
    console.log('Connecting to DB:', { host: config.host, database: config.database, user: config.user });
    pool = mysql.createPool(config);
  }
  return pool;
}

async function q(sql: string, params: any[] = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows as any[];
}

async function qOne(sql: string, params: any[] = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

async function qRun(sql: string, params: any[] = []) {
  const [result] = await getPool().execute(sql, params) as any;
  return { insertId: result.insertId ?? 0, affectedRows: result.affectedRows ?? 0 };
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
function signToken(payload: object) {
  return (jwt as any).sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token: string) {
  try { return (jwt as any).verify(token, JWT_SECRET) as any; } catch { return null; }
}
function authenticate(req: any, res: any, next: any) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Token inválido' });
  req.user = user;
  next();
}
function isAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  next();
}

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try { await q('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }
  catch (e: any) { res.status(500).json({ status: 'error', db: e.message }); }
});

// ─── Settings ────────────────────────────────────────────────────────────────
app.get('/api/settings', async (_req, res) => {
  try {
    const rows = await q('SELECT `key`, value FROM settings');
    const map = rows.reduce((acc: any, r: any) => { acc[r.key] = r.value; return acc; }, {});
    res.json(map);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Categories ──────────────────────────────────────────────────────────────
app.get('/api/categories', async (_req, res) => {
  try {
    const rows = await q("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Products ────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, sort = 'recent', page = '1', limit = '20' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = ["p.status = 'active'"];
    const params: any[] = [];

    if (category) {
      where.push('(p.category_id = ? OR EXISTS (SELECT 1 FROM product_category_relations pcr WHERE pcr.product_id = p.id AND pcr.category_id = ?))');
      params.push(category, category);
    }
    if (search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const orderMap: any = { recent: 'p.created_at DESC', price_asc: 'p.price ASC', price_desc: 'p.price DESC', name: 'p.name ASC' };
    const orderBy = orderMap[sort] || 'p.created_at DESC';

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [countRows] = await getPool().execute(`SELECT COUNT(*) as total FROM products p ${whereClause}`, params) as any;
    const total = countRows[0].total;

    const products = await q(
      `SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON c.id = p.category_id ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const newBadgeDays = 20;
    const withBadge = products.map((p: any) => ({
      ...p,
      is_new: p.is_new || (p.created_at && (Date.now() - new Date(p.created_at).getTime()) / 86400000 <= newBadgeDays),
    }));

    res.json({ products: withBadge, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = await qOne(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON c.id = p.category_id WHERE p.slug = ? AND p.status = 'active'`, [req.params.slug]);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    const gallery = await q("SELECT * FROM product_images WHERE product_id = ? AND file_type = 'gallery' ORDER BY id ASC", [product.id]);
    const relatedProducts = await q("SELECT * FROM products WHERE category_id = ? AND id != ? AND status = 'active' LIMIT 6", [product.category_id, product.id]);
    res.json({ ...product, gallery, relatedProducts });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Reviews ────────────────────────────────────────────────────────────────
app.get('/api/products/:slug/reviews', async (req, res) => {
  try {
    const { slug } = req.params;
    const product = await qOne('SELECT id FROM products WHERE slug = ?', [slug]);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const reviews = await q(`
      SELECT r.*, u.name as user_name 
      FROM reviews r 
      LEFT JOIN users u ON r.user_id = u.id 
      WHERE r.product_id = ? AND r.status = 'approved'
      ORDER BY r.created_at DESC
    `, [product.id]);

    const stats = await qOne('SELECT AVG(rating) as avgRating FROM reviews WHERE product_id = ? AND status = "approved"', [product.id]);

    res.json({ reviews, avgRating: stats?.avgRating || 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/:slug/reviews', authenticate, async (req, res) => {
  try {
    const { slug } = req.params;
    const { rating, comment } = req.body;
    const user = (req as any).user;

    if (!rating || !comment) {
      return res.status(400).json({ error: 'Nota e comentário são obrigatórios' });
    }

    const product = await qOne('SELECT id FROM products WHERE slug = ?', [slug]);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    await qRun(`
      INSERT INTO reviews (user_id, product_id, rating, comment, status) 
      VALUES (?, ?, ?, ?, 'approved')
    `, [user.id, product.id, rating, comment]);

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Auth ────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    const user = await qOne('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    if (user.status !== 'ativo' && user.status !== 'active') return res.status(403).json({ error: 'Conta inativa' });
    const type = user.role === 'admin' ? 'user' : 'customer';
    const payload = { id: user.id, email: user.email, type, name: user.name, role: user.role };
    const token = signToken(payload);
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'none', secure: true });
    res.json({ success: true, user: payload });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.auth_token;
  if (!token) return res.json({ user: null });
  const decoded = verifyToken(token);
  if (!decoded) { res.clearCookie('auth_token'); return res.json({ user: null }); }
  res.json({ user: decoded });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    const name = `${firstName} ${lastName}`;
    const hash = bcrypt.hashSync(password, 10);
    const { insertId } = await qRun("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'customer')", [name, email, hash]);
    await qRun('INSERT INTO customers (user_id) VALUES (?)', [insertId]);
    const payload = { id: insertId, email, type: 'customer', name };
    const token = signToken(payload);
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'none', secure: true });
    res.json({ success: true, user: payload });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'E-mail já cadastrado' });
    res.status(500).json({ error: e.message });
  }
});

// ─── Favorites ───────────────────────────────────────────────────────────────
app.get('/api/favorites', authenticate, async (req: any, res) => {
  try {
    const favs = await q("SELECT f.product_id, p.name, p.slug, p.image, p.price, p.sale_price FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.user_id = ? AND p.status = 'active' ORDER BY f.created_at DESC", [req.user.id]);
    res.json({ favorites: favs, favorite_ids: favs.map((f: any) => f.product_id) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/favorites/:productId', authenticate, async (req: any, res) => {
  try {
    await qRun('INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)', [req.user.id, req.params.productId]);
    res.status(201).json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/favorites/:productId', authenticate, async (req: any, res) => {
  try {
    await qRun('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Customer Orders & Downloads ─────────────────────────────────────────────
app.get('/api/customer/orders', authenticate, async (req: any, res) => {
  try {
    const orders = await q('SELECT o.*, GROUP_CONCAT(p.name SEPARATOR ", ") as items_summary FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id WHERE o.user_id = ? GROUP BY o.id ORDER BY o.created_at DESC', [req.user.id]);
    res.json(orders);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customer/downloads', authenticate, async (req: any, res) => {
  try {
    const downloads = await q("SELECT pf.*, p.name as product_name, p.image as product_image FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN product_files pf ON pf.product_id = oi.product_id JOIN products p ON p.id = oi.product_id WHERE o.user_id = ? AND o.status = 'paid' ORDER BY o.created_at DESC", [req.user.id]);
    res.json(downloads);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Admin ────────────────────────────────────────────────────────────────────
app.get('/api/admin/products', authenticate, isAdmin, async (_req, res) => {
  try {
    const rows = await q('SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON p.category_id = c.id ORDER BY p.created_at DESC');
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', authenticate, isAdmin, async (_req, res) => {
  try { res.json(await q('SELECT * FROM orders ORDER BY created_at DESC')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', authenticate, isAdmin, async (_req, res) => {
  try { res.json(await q('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/settings', authenticate, isAdmin, async (_req, res) => {
  try {
    const rows = await q('SELECT `key`, value FROM settings');
    const map = rows.reduce((acc: any, r: any) => { acc[r.key] = r.value; return acc; }, {});
    res.json(map);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/settings', authenticate, isAdmin, async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await qRun('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [key, value, value]);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/categories', authenticate, isAdmin, async (_req, res) => {
  try { res.json(await q('SELECT * FROM product_categories ORDER BY sort_order ASC, name ASC')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/reports', authenticate, isAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query as any;
    const days = parseInt(period) || 30;
    const [totalOrders, totalRevenue, totalProducts, totalUsers] = await Promise.all([
      qOne(`SELECT COUNT(*) as total FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [days]),
      qOne(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'paid' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [days]),
      qOne("SELECT COUNT(*) as total FROM products WHERE status = 'active'"),
      qOne('SELECT COUNT(*) as total FROM users'),
    ]);
    res.json({ totalOrders: totalOrders?.total || 0, totalRevenue: totalRevenue?.total || 0, totalProducts: totalProducts?.total || 0, totalUsers: totalUsers?.total || 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/products/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await qRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Matrix requests (orçamento) ─────────────────────────────────────────────
app.post('/api/matrix-requests', async (req, res) => {
  try {
    const { name, email, whatsapp, details } = req.body;
    if (!name || !email || !whatsapp) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    const { insertId } = await qRun('INSERT INTO matrix_requests (name, email, whatsapp, details) VALUES (?, ?, ?, ?)', [name, email, whatsapp, details || '']);
    res.json({ success: true, id: insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Checkout config ─────────────────────────────────────────────────────────
app.get('/api/checkout/config', async (_req, res) => {
  try {
    const rows = await q("SELECT `key`, value FROM settings WHERE `key` IN ('mp_public_key','mercadopago_public_key','mp_mode','modo_operacao')");
    const s = rows.reduce((acc: any, r: any) => { acc[r.key] = r.value; return acc; }, {} as any);
    res.json({ publicKey: s.mercadopago_public_key || s.mp_public_key || '', mode: s.modo_operacao || s.mp_mode || 'sandbox' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default app;
