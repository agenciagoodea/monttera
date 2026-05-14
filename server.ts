process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import db, { initDb } from './src/server/db';
import { hashPassword, comparePassword, generateToken, verifyToken, authenticate, isAdmin } from './src/server/auth';
import multer from 'multer';
import slugify from 'slugify';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import { sendEmail } from './src/server/mailer';
import nodemailer from 'nodemailer';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import axios from 'axios';

// Simple in-memory cache for extreme optimization
class CacheProvider {
  private cache: Map<string, { value: any; expiry: number }> = new Map();

  set(key: string, value: any, ttlSeconds: number = 300) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value as T;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const apiCache = new CacheProvider();

console.log('--- SERVER.TS EXECUTING ---');

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

function loadSettingsMap(keys?: string[]) {
  const rows = keys && keys.length > 0
    ? db.all(`SELECT \`key\`, value FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`, ...keys)
    : db.all('SELECT `key`, value FROM settings');

  return (rows as any[]).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function resolveMercadoPagoSettings() {
  const settings = loadSettingsMap([
    'mp_public_key',
    'mp_access_token',
    'mp_mode',
    'modo_operacao',
    'mercadopago_public_key',
    'mercadopago_access_token',
  ]);

  const publicKey =
    settings.mercadopago_public_key ||
    settings.mp_public_key ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    '';
  const accessToken =
    settings.mercadopago_access_token ||
    settings.mp_access_token ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    '';
  const mode = (settings.modo_operacao || settings.mp_mode || 'sandbox').toLowerCase();

  return { publicKey, accessToken, mode };
}

function createMercadoPagoPaymentClient() {
  const { accessToken } = resolveMercadoPagoSettings();
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado em settings');
  }

  const client = new MercadoPagoConfig({ accessToken });
  return new Payment(client);
}

function normalizeCPF(cpf: string | undefined | null) {
  return String(cpf || '').replace(/\D/g, '');
}

function extractGatewayError(error: any) {
  const fallback = 'Falha ao processar pagamento no gateway.';

  const details = error?.cause || error?.response?.data || error?.message || null;
  let message = fallback;

  if (Array.isArray(error?.cause) && error.cause.length > 0) {
    const first = error.cause[0];
    message = first?.description || first?.message || first?.code || fallback;
  } else if (typeof error?.message === 'string' && error.message.trim()) {
    message = error.message;
  } else if (typeof error?.cause?.message === 'string' && error.cause.message.trim()) {
    message = error.cause.message;
  }

  return {
    message,
    details,
    status: Number(error?.status || error?.statusCode || error?.response?.status || 400),
  };
}

function httpGetJsonWithToken(url: string, accessToken: string): Promise<{ status: number; payload: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'digitalbordados-admin/1.0',
        },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          let payload: any = null;
          try {
            payload = raw ? JSON.parse(raw) : null;
          } catch {
            payload = { raw };
          }
          resolve({
            status: response.statusCode || 500,
            payload,
            raw,
          });
        });
      },
    );

    request.on('error', (error) => reject(error));
    request.end();
  });
}

async function fetchMercadoPagoAccountInfo(accessToken: string) {
  const endpoints = [
    'https://api.mercadolibre.com/users/me',
    'https://api.mercadopago.com/users/me',
  ];

  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const response = await httpGetJsonWithToken(endpoint, accessToken);
      if (response.status >= 200 && response.status < 300) {
        const payload = response.payload || {};
        return {
          ok: true,
          status: response.status,
          account: {
            nickname: payload?.nickname || '',
            account_id: payload?.id ? String(payload.id) : '',
            email: payload?.email || '',
            site_id: payload?.site_id || '',
          },
        };
      }

      const payload = response.payload || {};
      const message = payload?.message || payload?.error_description || payload?.error || 'Falha ao validar credenciais do Mercado Pago';
      const details = payload?.cause || payload?.raw || response.raw || null;
      lastError = { status: response.status, message, details };
    } catch (error: any) {
      lastError = {
        status: 500,
        message: error?.message || 'Erro de comunicação com Mercado Pago',
        details: null,
      };
    }
  }

  return {
    ok: false,
    status: lastError?.status || 500,
    message: lastError?.message || 'Falha ao validar credenciais do Mercado Pago',
    details: lastError?.details || null,
  };
}

// ConfiguraÃ§Ã£o do Multer para Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './public/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

function createUniqueProductSlug(baseName: string, ignoreProductId?: number) {
  const baseSlugRaw = slugify(baseName || 'produto', { lower: true, strict: true, trim: true }) || 'produto';
  let candidate = baseSlugRaw;
  let sequence = 2;

  while (true) {
    const existing = db.get('SELECT id FROM products WHERE slug = ?', candidate) as any;
    if (!existing || (ignoreProductId && Number(existing.id) === Number(ignoreProductId))) {
      return candidate;
    }
    candidate = `${baseSlugRaw}-${sequence}`;
    sequence += 1;
  }
}

function resolveNewBadgeDays() {
  const settings = loadSettingsMap(['new_badge_days']);
  const parsed = Number(settings.new_badge_days);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 20;
}

function isProductWithinNewWindow(createdAt: any, days: number) {
  if (!createdAt || days <= 0) return false;
  const normalizedDateString = typeof createdAt === 'string'
    ? createdAt.replace(' ', 'T')
    : createdAt;
  const createdDate = new Date(normalizedDateString as any);
  if (Number.isNaN(createdDate.getTime())) return false;

  const ageMs = Date.now() - createdDate.getTime();
  if (ageMs < 0) return true;

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= days;
}

function initSettings() {
  const defaultSettings = {
    site_name: 'Digital Bordados',
    site_description: 'ExcelÃªncia em Matrizes de Bordado',
    logo_url: '',
    primary_color: '#3b82f6',
    secondary_color: '#1e293b',
    email_contact: 'contato@digitalbordados.com',
    mp_mode: 'sandbox',
    modo_operacao: 'sandbox',
    mp_public_key: '',
    mp_access_token: '',
    mercadopago_public_key: '',
    mercadopago_access_token: '',
    new_badge_days: '20',
    smtp_from_name: '',
    smtp_from_email: '',
    matrix_request_team_email: '',
    app_url: 'https://digitalbordados.com.br',
    paypal_enabled: 'false',
    paypal_mode: 'sandbox',
    paypal_sandbox_client_id: '',
    paypal_sandbox_client_secret: '',
    paypal_production_client_id: '',
    paypal_production_client_secret: '',
    paypal_default_currency: 'USD',
    paypal_brl_usd_rate: '5.20',
    paypal_webhook_id: '',
  };

  Object.entries(defaultSettings).forEach(([key, value]) => {
    db.run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\'))', key, value);
  });
}

async function initTestData() {
  initSettings();
  const hashedPassword = await hashPassword('123456');
  const adrianoPassword = await hashPassword('04039866');

  // 1. Novo UsuÃ¡rio Admin (Adriano Amorim)
  const adrianoAdmin = db.get('SELECT * FROM users WHERE email = ?', 'contato@agenciagoodea.com');
  if (!adrianoAdmin) {
    db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Adriano Amorim', 'contato@agenciagoodea.com', adrianoPassword, 'admin', 'ativo');
    console.log('Admin Adriano created: contato@agenciagoodea.com / 04039866');
  } else {
    db.run('UPDATE users SET name = ?, password = ?, role = "admin", status = "ativo" WHERE email = ?', 'Adriano Amorim', adrianoPassword, 'contato@agenciagoodea.com');
  }

  // 2. Antigo UsuÃ¡rio Admin (Digital Bordados)
  const admin = db.get('SELECT * FROM users WHERE email = ?', 'admin@digitalbordados.com');
  if (!admin) {
    db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Administrador', 'admin@digitalbordados.com', hashedPassword, 'admin', 'ativo');
    console.log('Test Admin created: admin@digitalbordados.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃ¡ existir
    db.run('UPDATE users SET password = ?, role = "admin", status = "ativo" WHERE email = ?', hashedPassword, 'admin@digitalbordados.com');
  }

  // 3. UsuÃ¡rio Cliente
  const customerUser = db.get('SELECT * FROM users WHERE email = ?', 'cliente@teste.com');
  if (!customerUser) {
    const result = db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Cliente Teste', 'cliente@teste.com', hashedPassword, 'customer', 'ativo');
    
    // Inserir dados complementares na tabela customers
    db.run('INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)', result.lastInsertRowid, '(11) 98888-7777', '123.456.789-00');
    console.log('Test Customer created: cliente@teste.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃ¡ existir
    db.run('UPDATE users SET password = ?, role = "customer", status = "ativo" WHERE email = ?', hashedPassword, 'cliente@teste.com');
  }
}

async function startServer() {
  console.log('Starting server initialization...');
  try {
    // Inicializa o esquema do banco de dados
    console.log('Initializing database schema...');
    initDb();
    
    // Inicializa dados de teste
    console.log('Initializing test data...');
    await initTestData();

    // Insert some mock data if empty
    const shouldSeedDemoData = process.env.SEED_DEMO_DATA === 'true';
    const count = db.get('SELECT count(*) as count FROM product_categories') as { count: number };
    if (shouldSeedDemoData && count.count === 0) {
      console.log('Inserting mock categories and products...');
      db.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Animais', 'animais');
      db.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Animes', 'animes');
      db.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Bandeiras', 'bandeiras');
      db.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Carros', 'carros');
      db.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Infantil', 'infantil');

      db.run(`
        INSERT INTO products (name, slug, price, sale_price, image, category_id, stitch_count, colors, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'Matriz Bordado Harley Davidson 14', 
        'matriz-bordado-harley-davidson-14', 
        22.00, 18.00, 
        'https://images.unsplash.com/photo-1558981403-c5f91ebca978?q=80&w=300&auto=format&fit=crop', 
        4, 15000, '3 cores', 1
      );
      db.run(`
        INSERT INTO products (name, slug, price, sale_price, image, category_id, stitch_count, colors, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'Matriz Bordado Harley Davidson 13', 
        'matriz-bordado-harley-davidson-13', 
        25.00, 22.00, 
        'https://images.unsplash.com/photo-1558981403-c5f91ebca978?q=80&w=300&auto=format&fit=crop', 
        4, 12000, '2 cores', 1
      );
      db.run(`
        INSERT INTO products (name, slug, price, sale_price, image, category_id, stitch_count, colors, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'Matriz Bordado UFDPAR', 
        'matriz-bordado-ufdpar', 
        18.00, 15.00, 
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=300&auto=format&fit=crop', 
        3, 8000, '4 cores', 1
      );
    }
    
    console.log('Database and test data initialized successfully.');
  } catch (dbError) {
    console.error('FAILED to initialize database:', dbError);
  }

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static('public/uploads'));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON inválido no corpo da requisição' });
    }
    return next(err);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes - AUTH
  // Busca inteligente de produtos (Posicionada no início para evitar conflitos)
  app.get('/api/products/search', (req, res) => {
    try {
      const queryStr = req.query.q as string;
      if (!queryStr || queryStr.trim().length < 2) return res.json([]);

      const searchTerm = `%${queryStr.trim()}%`;
      
      // Busca direta e simples
      const products = db.all(`
        SELECT id, name, slug, price, sale_price, image 
        FROM products 
        WHERE (name LIKE ? OR slug LIKE ? OR description LIKE ?)
        AND status IN ('active', 'ativo')
        LIMIT 10
      `, searchTerm, searchTerm, searchTerm);

      return res.json(products);
    } catch (error: any) {
      console.error('SEARCH ERROR:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos sÃ£o obrigatÃ³rios' });
    }

    try {
      const name = `${firstName} ${lastName}`;
      const hashedPassword = await hashPassword(password);
      
      const userResult = db.run(`
        INSERT INTO users (name, email, password, role) 
        VALUES (?, ?, ?, 'customer')
      `, name, email, hashedPassword);
      
      const userId = userResult.lastInsertRowid;

      // Inserir na tabela de detalhes do cliente
      db.run(`
        INSERT INTO customers (user_id) 
        VALUES (?)
      `, userId);
      
      const token = generateToken({ id: userId, email, type: 'customer', name });
      res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

      // Trigger welcome email
      const settings = loadSettingsMap(['app_url', 'site_name']);
      const appUrl = process.env.APP_URL || settings.app_url || 'https://digitalbordados.com.br';
      sendEmail({
        to: email,
        templateKey: 'user_welcome',
        variables: {
          name: firstName,
          email: email,
          login_url: `${appUrl}/login`
        }
      }).catch(err => console.error('Failed to send welcome email:', err));

      res.json({ success: true, user: { id: userId, name, email, type: 'customer' } });
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Este e-mail jÃ¡ estÃ¡ cadastrado' });
      }
      console.error('Register error:', error);
      res.status(500).json({ error: 'Erro ao criar conta' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const normalizedPassword = typeof password === 'string' ? password : '';

      if (!normalizedEmail || !normalizedPassword) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
      }

      console.log(`Tentativa de login: ${normalizedEmail}`);
      const user = db.get('SELECT * FROM users WHERE email = ?', normalizedEmail) as any;

      if (!user) {
        console.log(`Falha no login: Usuário não encontrado - ${normalizedEmail}`);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (!user.password || typeof user.password !== 'string') {
        console.error('Falha no login: usuário sem hash de senha válido', { userId: user.id, email: normalizedEmail });
        return res.status(500).json({ error: 'Conta sem senha válida. Redefina a senha do usuário.' });
      }

      let passwordIsValid = false;
      try {
        passwordIsValid = await comparePassword(normalizedPassword, user.password);
      } catch (compareError) {
        console.error('Erro ao validar senha:', compareError);
        return res.status(500).json({ error: 'Erro ao validar credenciais' });
      }

      if (!passwordIsValid) {
        console.log(`Falha no login: Senha incorreta para ${normalizedEmail}`);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (user.status !== 'ativo' && user.status !== 'active') {
        console.log(`Falha no login: Usuário inativo (${user.status}) - ${normalizedEmail}`);
        return res.status(403).json({ error: 'Esta conta está inativa' });
      }

      const type = user.role === 'admin' ? 'user' : 'customer';
      const tokenPayload = {
        id: user.id,
        email: user.email,
        type,
        name: user.name,
        role: user.role,
      };

      console.log(`Login bem-sucedido: ${normalizedEmail} como ${type}`);
      const token = generateToken(tokenPayload);
      res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.json({ success: true, user: tokenPayload });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Erro interno ao processar login' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ user: null });

    const decoded = verifyToken(token);
    if (!decoded) {
      res.clearCookie('auth_token');
      return res.json({ user: null });
    }

    // Consulta o DB para retornar dados atualizados (incluindo avatar_url)
    try {
      const fresh = db.get('SELECT id, name, email, role, avatar_url FROM users WHERE id = ?', decoded.id) as any;
      if (!fresh) return res.json({ user: null });
      const type = fresh.role === 'admin' ? 'user' : 'customer';
      return res.json({ user: { id: fresh.id, name: fresh.name, email: fresh.email, type, role: fresh.role, avatar_url: fresh.avatar_url || null } });
    } catch {
      // fallback: retorna o token decodificado
      return res.json({ user: decoded });
    }
  });

  // API Routes - FAVORITES
  app.get('/api/favorites', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const favorites = db.all(`
        SELECT
          f.product_id,
          f.created_at,
          p.name,
          p.slug,
          p.image,
          p.price,
          p.sale_price,
          p.status
        FROM favorites f
        JOIN products p ON p.id = f.product_id
        WHERE f.user_id = ?
          AND p.status = 'active'
        ORDER BY f.created_at DESC
      `, user.id) as any[];

      const favoriteIds = favorites.map((item) => Number(item.product_id));
      return res.json({ favorites, favorite_ids: favoriteIds });
    } catch (error) {
      console.error('Fetch Favorites Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar favoritos' });
    }
  });

  app.post('/api/favorites/:productId', authenticate, (req, res) => {
    const user = (req as any).user;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'product_id inválido' });
    }

    const product = db.get('SELECT id, status FROM products WHERE id = ?', productId) as any;
    if (!product || product.status !== 'active') {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    try {
      db.run('INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)', user.id, productId);
      return res.status(201).json({ success: true, product_id: productId });
    } catch (error) {
      console.error('Add Favorite Error:', error);
      return res.status(500).json({ error: 'Erro ao adicionar favorito' });
    }
  });

  app.delete('/api/favorites/:productId', authenticate, (req, res) => {
    const user = (req as any).user;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'product_id inválido' });
    }

    try {
      db.run('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', user.id, productId);
      return res.json({ success: true, product_id: productId });
    } catch (error) {
      console.error('Remove Favorite Error:', error);
      return res.status(500).json({ error: 'Erro ao remover favorito' });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });

      const user = db.get('SELECT * FROM users WHERE email = ?', email) as any;
      if (!user) {
        // Return success even if user not found for security reasons
        return res.json({ success: true });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      db.run(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        user.id, token, expiresAt.toISOString()
      );

      const settings = loadSettingsMap(['app_url']);
      const appUrl = process.env.APP_URL || settings.app_url || 'https://digitalbordados.com.br';
      const resetUrl = `${appUrl}/redefinir-senha?token=${token}`;

      await sendEmail({
        to: user.email,
        templateKey: 'password_reset',
        variables: {
          name: user.name,
          reset_url: resetUrl,
          expires_in: '2'
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Erro interno ao solicitar recuperação de senha' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, new_password } = req.body || {};
      if (!token || !new_password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });

      const resetRequest = db.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP',
        token
      ) as any;

      if (!resetRequest) {
        return res.status(400).json({ error: 'Token inválido ou expirado' });
      }

      const hashedPassword = await hashPassword(new_password);
      db.run('UPDATE users SET password = ? WHERE id = ?', hashedPassword, resetRequest.user_id);
      db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', resetRequest.id);

      const user = db.get('SELECT * FROM users WHERE id = ?', resetRequest.user_id) as any;
      if (user) {
        const settings = loadSettingsMap(['app_url']);
        const appUrl = settings.app_url || 'https://digitalbordados.com.br';
        
        await sendEmail({
          to: user.email,
          templateKey: 'password_changed',
          variables: {
            name: user.name,
            login_url: `${appUrl}/login`
          }
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
  });

  // API Routes - ADMIN PRODUCTS
  app.get('/api/admin/products', authenticate, isAdmin, (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      const categoryId = req.query.category;
      const search = req.query.q;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (categoryId && categoryId !== 'all') {
        whereClause += ' AND p.category_id = ?';
        params.push(categoryId);
      }

      if (search) {
        whereClause += ' AND (p.name LIKE ? OR p.slug LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      const products = db.all(`
        SELECT p.id, p.name, p.slug, p.price, p.sale_price, p.image, p.status, p.created_at, p.category_id, c.name as category_name 
        FROM products p 
        LEFT JOIN product_categories c ON p.category_id = c.id 
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `, ...params, limit, offset);

      const totalResult = db.get(`
        SELECT COUNT(*) as total 
        FROM products p 
        ${whereClause}
      `, ...params) as any;

      const total = totalResult?.total || 0;

      res.json({
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Admin Fetch Products Error:', error);
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  });

  app.post('/api/admin/products', authenticate, isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
    { name: 'production_files', maxCount: 5 },
    { name: 'production_sheet', maxCount: 1 }
  ]), (req, res) => {
    const { 
      name, description, short_description, price, sale_price, promotional_price, production_sheet,
      category_id, category_ids, stitch_count, colors, is_featured, is_new,
      seo_title, seo_description, tags, tag_ids, downloadable_files, gallery_urls
    } = req.body;

    const parseIdArray = (rawValue: any): number[] => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return [];
      const normalize = (values: any[]) => values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

      if (Array.isArray(rawValue)) return normalize(rawValue);
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return normalize(parsed);
        } catch {
          return normalize(trimmed.split(',').map((part) => part.trim()).filter(Boolean));
        }
      }
      return [];
    };

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome do produto Ã© obrigatÃ³rio' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const mainImage = files['image']?.[0]?.filename ? `/uploads/${files['image'][0].filename}` : null;
    const productionSheetFile = files['production_sheet']?.[0]?.filename ? `/uploads/${files['production_sheet'][0].filename}` : null;
    const productionSheetValue = productionSheetFile || (typeof production_sheet === 'string' ? production_sheet.trim() : '') || null;
    const finalPrice = Number(price);
    if (!Number.isFinite(finalPrice)) {
      return res.status(400).json({ error: 'PreÃ§o invÃ¡lido' });
    }
    const finalSalePriceRaw = promotional_price ?? sale_price ?? null;
    const finalSalePrice = finalSalePriceRaw === null || finalSalePriceRaw === '' ? null : Number(finalSalePriceRaw);
    if (finalSalePrice !== null && !Number.isFinite(finalSalePrice)) {
      return res.status(400).json({ error: 'PreÃ§o promocional invÃ¡lido' });
    }
    const normalizedStitchCount = stitch_count === undefined || stitch_count === null || stitch_count === ''
      ? null
      : Number(stitch_count);
    if (normalizedStitchCount !== null && !Number.isFinite(normalizedStitchCount)) {
      return res.status(400).json({ error: 'Quantidade de pontos invÃ¡lida' });
    }
    const normalizedCategoryId = category_id === undefined || category_id === null || category_id === ''
      ? null
      : Number(category_id);
    if (normalizedCategoryId !== null && !Number.isFinite(normalizedCategoryId)) {
      return res.status(400).json({ error: 'Categoria principal invÃ¡lida' });
    }

    const uniqueSlug = createUniqueProductSlug(normalizedName);

    try {
      const result = db.run(`
        INSERT INTO products (
          name, slug, description, short_description, price, sale_price, 
          image, production_sheet, category_id, stitch_count, colors, is_featured, is_new,
          seo_title, seo_description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, normalizedName, uniqueSlug, description || null, short_description || null, finalPrice, finalSalePrice, mainImage, productionSheetValue, normalizedCategoryId, normalizedStitchCount, colors || null, is_featured === 'true' || is_featured === '1' ? 1 : 0, is_new === 'true' || is_new === '1' ? 1 : 0, seo_title || null, seo_description || null);

      const productId = result.lastInsertRowid;

      const parsedCategoryIds = parseIdArray(category_ids);
      const finalCategoryIds = parsedCategoryIds.length > 0
        ? parsedCategoryIds
        : (normalizedCategoryId ? [normalizedCategoryId] : []);
      finalCategoryIds.forEach((categoryRelationId) => {
        db.run('INSERT IGNORE INTO product_category_relations (product_id, category_id) VALUES (?, ?)', productId, categoryRelationId);
      });

      // Galeria
      if (files['gallery']) {
        files['gallery'].forEach(f => {
          db.run('INSERT IGNORE INTO product_images (product_id, url, file_type) VALUES (?, ?, ?)', productId, `/uploads/${f.filename}`, 'gallery');
        });
      }

      if (gallery_urls !== undefined) {
        let parsedGalleryUrls: string[] = [];
        if (Array.isArray(gallery_urls)) {
          parsedGalleryUrls = gallery_urls.map((value) => String(value).trim()).filter(Boolean);
        } else if (typeof gallery_urls === 'string' && gallery_urls.trim()) {
          try {
            const parsed = JSON.parse(gallery_urls);
            if (Array.isArray(parsed)) {
              parsedGalleryUrls = parsed.map((value) => String(value).trim()).filter(Boolean);
            }
          } catch {
            parsedGalleryUrls = gallery_urls
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
          }
        }

        parsedGalleryUrls.forEach((url) => {
          db.run('INSERT IGNORE INTO product_images (product_id, url, file_type) VALUES (?, ?, ?)', productId, url, 'gallery');
        });
      }

      // Arquivos de ProduÃ§Ã£o
      if (files['production_files']) {
        files['production_files'].forEach(f => {
          db.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, f.originalname, `/uploads/${f.filename}`, 'production');
        });
      }

      if (downloadable_files !== undefined) {
        let parsedDownloadableFiles: any[] = [];
        if (Array.isArray(downloadable_files)) {
          parsedDownloadableFiles = downloadable_files;
        } else if (typeof downloadable_files === 'string' && downloadable_files.trim()) {
          try {
            const parsed = JSON.parse(downloadable_files);
            parsedDownloadableFiles = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedDownloadableFiles = [];
          }
        }

        parsedDownloadableFiles.forEach((file) => {
          if (typeof file === 'string') {
            const fileName = file.split('/').pop() || file;
            db.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, file, 'downloadable');
            return;
          }

          const filePath = file?.file_path || file?.path || file?.url;
          if (!filePath) return;
          const fileName = file?.file_name || file?.name || filePath.split('/').pop() || 'arquivo';
          const fileType = file?.file_type || file?.type || 'downloadable';
          db.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, filePath, fileType);
        });
      }

      // Tags
      const parsedTagIds = parseIdArray(tag_ids ?? tags);
      if (parsedTagIds.length > 0) {
        parsedTagIds.forEach((tagId) => {
          db.run('INSERT IGNORE INTO product_tag_relations (product_id, tag_id) VALUES (?, ?)', productId, tagId);
        });
      }

      res.json({ success: true, id: productId });
    } catch (error: any) {
      console.error('POST /api/admin/products raw error:', error);
      console.error('POST /api/admin/products failed:', {
        message: error?.message,
        code: error?.code,
        errno: error?.errno,
        sqlState: error?.sqlState,
        sqlMessage: error?.sqlMessage,
        stack: error?.stack,
      });
      res.status(500).json({ error: 'Erro ao salvar produto' });
    }
  });

  app.put('/api/admin/products/:id', authenticate, isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
    { name: 'production_files', maxCount: 5 },
    { name: 'production_sheet', maxCount: 1 }
  ]), (req, res) => {
    const productId = Number(req.params.id);
    const existingProduct = db.get('SELECT * FROM products WHERE id = ?', productId) as any;

    if (!existingProduct) {
      return res.status(404).json({ error: 'Produto nÃ£o encontrado' });
    }

    const files = (req.files || {}) as { [fieldname: string]: Express.Multer.File[] };
    const {
      name,
      slug,
      description,
      short_description,
      price,
      promotional_price,
      sale_price,
      production_sheet,
      category_id,
      category_ids,
      stitch_count,
      colors,
      tags,
      tag_ids,
      downloadable_files
    } = req.body;

    const parseIdArray = (rawValue: any): number[] => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return [];

      const normalize = (values: any[]) =>
        values
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);

      if (Array.isArray(rawValue)) return normalize(rawValue);

      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) return [];

        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return normalize(parsed);
        } catch {
          // fallback para CSV
        }

        return normalize(trimmed.split(',').map((part) => part.trim()).filter(Boolean));
      }

      return [];
    };

    const newImagePath = files['image']?.[0]?.filename
      ? `/uploads/${files['image'][0].filename}`
      : existingProduct.image;

    const nextName = name ?? existingProduct.name;
    const nextSlug = slug
      ? slugify(slug, { lower: true })
      : slugify(nextName, { lower: true });
    const nextDescription = description ?? existingProduct.description;
    const nextShortDescription = short_description ?? existingProduct.short_description;
    const nextPrice = price !== undefined ? Number(price) : existingProduct.price;

    const salePriceInput = promotional_price ?? sale_price;
    const nextSalePrice = salePriceInput !== undefined
      ? (salePriceInput === '' || salePriceInput === null ? null : Number(salePriceInput))
      : existingProduct.sale_price;

    const nextCategoryId = category_id !== undefined
      ? (category_id === '' || category_id === null ? null : Number(category_id))
      : existingProduct.category_id;
    const nextStitchCount = stitch_count !== undefined
      ? (stitch_count === '' || stitch_count === null ? null : Number(stitch_count))
      : existingProduct.stitch_count;
    const nextColors = colors !== undefined
      ? ((typeof colors === 'string' ? colors.trim() : String(colors)) || null)
      : existingProduct.colors;

    if (nextStitchCount !== null && !Number.isFinite(Number(nextStitchCount))) {
      return res.status(400).json({ error: 'Quantidade de pontos inválida' });
    }

    const productionSheetFile = files['production_sheet']?.[0]?.filename
      ? `/uploads/${files['production_sheet'][0].filename}`
      : null;
    const nextProductionSheet = productionSheetFile
      ? productionSheetFile
      : (production_sheet !== undefined
        ? ((typeof production_sheet === 'string' ? production_sheet.trim() : '') || null)
        : existingProduct.production_sheet);

    try {
      db.run(`
        UPDATE products
        SET
          name = ?,
          slug = ?,
          description = ?,
          short_description = ?,
          price = ?,
          sale_price = ?,
          category_id = ?,
          stitch_count = ?,
          colors = ?,
          image = ?,
          production_sheet = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, nextName, nextSlug, nextDescription, nextShortDescription, nextPrice, nextSalePrice, nextCategoryId, nextStitchCount, nextColors, newImagePath, nextProductionSheet, productId);

      if (files['image']?.[0] && existingProduct.image && typeof existingProduct.image === 'string' && existingProduct.image.startsWith('/uploads/')) {
        const oldImageFsPath = path.join(process.cwd(), 'public', existingProduct.image.replace('/uploads/', 'uploads/'));
        try {
          if (fs.existsSync(oldImageFsPath)) {
            fs.unlinkSync(oldImageFsPath);
          }
        } catch (fileError) {
          console.warn('Falha ao remover imagem antiga:', fileError);
        }
      }

      if (productionSheetFile && existingProduct.production_sheet && typeof existingProduct.production_sheet === 'string' && existingProduct.production_sheet.startsWith('/uploads/')) {
        const oldSheetFsPath = path.join(process.cwd(), 'public', existingProduct.production_sheet.replace('/uploads/', 'uploads/'));
        try {
          if (fs.existsSync(oldSheetFsPath)) {
            fs.unlinkSync(oldSheetFsPath);
          }
        } catch (fileError) {
          console.warn('Falha ao remover folha de produÃ§Ã£o antiga:', fileError);
        }
      }

      const parsedTagIds = parseIdArray(tag_ids ?? tags);
      if (tags !== undefined || tag_ids !== undefined) {
        db.run('DELETE FROM product_tag_relations WHERE product_id = ?', productId);
        if (parsedTagIds.length > 0) {
          parsedTagIds.forEach((tagId) => db.run('INSERT IGNORE INTO product_tag_relations (product_id, tag_id) VALUES (?, ?)', productId, tagId));
        }
      }

      const parsedCategoryIds = parseIdArray(category_ids);
      const shouldUpdateCategoryRelations = category_ids !== undefined || category_id !== undefined;
      if (shouldUpdateCategoryRelations) {
        db.run('DELETE FROM product_category_relations WHERE product_id = ?', productId);

        const finalCategoryIds = parsedCategoryIds.length > 0
          ? parsedCategoryIds
          : (nextCategoryId ? [nextCategoryId] : []);

        if (finalCategoryIds.length > 0) {
          finalCategoryIds.forEach((cid) => db.run('INSERT IGNORE INTO product_category_relations (product_id, category_id) VALUES (?, ?)', productId, cid));
        }
      }

      const hasNewProductionFiles = Array.isArray(files['production_files']) && files['production_files'].length > 0;
      const hasDownloadableFilesJson = downloadable_files !== undefined;

      if (hasNewProductionFiles || hasDownloadableFilesJson) {
        db.run('DELETE FROM product_files WHERE product_id = ?', productId);

        if (hasNewProductionFiles) {
          files['production_files'].forEach((file) => {
            db.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, file.originalname, `/uploads/${file.filename}`, 'production');
          });
        }

        if (hasDownloadableFilesJson) {
          let parsedDownloadableFiles: any[] = [];
          if (Array.isArray(downloadable_files)) {
            parsedDownloadableFiles = downloadable_files;
          } else if (typeof downloadable_files === 'string' && downloadable_files.trim()) {
            try {
              const parsed = JSON.parse(downloadable_files);
              parsedDownloadableFiles = Array.isArray(parsed) ? parsed : [];
            } catch {
              parsedDownloadableFiles = [];
            }
          }

          parsedDownloadableFiles.forEach((file) => {
            if (typeof file === 'string') {
              const fileName = file.split('/').pop() || file;
              db.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, file, 'downloadable');
              return;
            }

            const filePath = file?.file_path || file?.path;
            if (!filePath) return;

            const fileName = file?.file_name || file?.name || filePath.split('/').pop() || 'arquivo';
            const fileType = file?.file_type || file?.type || 'downloadable';
            db.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, filePath, fileType);
          });
        }
      }

      const updatedProduct = db.get('SELECT * FROM products WHERE id = ?', productId) as any;
      const updatedTags = db.all(`
        SELECT t.*
        FROM product_tags t
        JOIN product_tag_relations pt ON t.id = pt.tag_id
        WHERE pt.product_id = ?
      `, productId);
      const updatedFiles = db.all('SELECT * FROM product_files WHERE product_id = ?', productId);
      const updatedCategoryIds = db.all('SELECT category_id FROM product_category_relations WHERE product_id = ?', productId);

      res.status(200).json({
        ...updatedProduct,
        tags: updatedTags,
        files: updatedFiles,
        category_ids: updatedCategoryIds.map((row: any) => row.category_id)
      });
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
  });

  app.get('/api/admin/products/:id', authenticate, isAdmin, (req, res) => {
    const product = db.get('SELECT * FROM products WHERE id = ?', req.params.id) as any;
    if (!product) return res.status(404).json({ error: 'Produto nÃ£o encontrado' });

    const images = db.all('SELECT * FROM product_images WHERE product_id = ?', req.params.id);
    const files = db.all('SELECT * FROM product_files WHERE product_id = ?', req.params.id);
    const categoryRelations = db.all('SELECT category_id FROM product_category_relations WHERE product_id = ?', req.params.id) as any[];
    const tags = db.all(`
      SELECT t.* 
      FROM product_tags t 
      JOIN product_tag_relations pt ON t.id = pt.tag_id 
      WHERE pt.product_id = ?
    `, req.params.id);

    res.json({ ...product, images, files, tags, category_ids: categoryRelations.map((row) => row.category_id) });
  });

  app.delete('/api/admin/products/:id', authenticate, isAdmin, (req, res) => {
    try {
      db.run('DELETE FROM products WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir produto' });
    }
  });

  // API Routes - ADMIN CATEGORIES
  app.get('/api/admin/categories', authenticate, isAdmin, (req, res) => {
    const categories = db.all(`
      SELECT 
        c.*, 
        p.name as parent_name,
        (
          SELECT COUNT(DISTINCT pcr.product_id)
          FROM product_category_relations pcr
          WHERE pcr.category_id = c.id
        ) as product_count
      FROM product_categories c 
      LEFT JOIN product_categories p ON c.parent_id = p.id 
      ORDER BY c.sort_order ASC, c.name ASC
    `);
    res.json(categories);
  });

  app.post('/api/admin/categories', authenticate, isAdmin, (req, res) => {
    const { name, slug: rawSlug, parent_id, sort_order, status, description } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome da categoria Ã© obrigatÃ³rio' });
    }

    const safeName = normalizedName.slice(0, 255);
    const slugSource = typeof rawSlug === 'string' && rawSlug.trim() ? rawSlug.trim() : safeName;
    const generatedSlug = slugify(slugSource, { lower: true, strict: false, trim: true });
    const slug = (generatedSlug || safeName.toLowerCase().replace(/\s+/g, '-')).slice(0, 191);

    try {
      const existingCategory = db.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE slug = ?
      `, slug) as any;

      if (existingCategory) {
        return res.status(200).json(existingCategory);
      }

      const result = db.run(`
        INSERT IGNORE INTO product_categories (name, slug, parent_id, sort_order, status, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `, safeName, slug, parent_id || null, sort_order || 0, status || 'active', description || null);

      const createdCategory = db.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE id = ?
      `, result.lastInsertRowid) as any;

      return res.status(200).json(createdCategory);
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        const existingCategory = db.get(`
          SELECT id, name, slug, parent_id, sort_order, status, description
          FROM product_categories
          WHERE slug = ?
        `, slug) as any;
        if (existingCategory) {
          return res.status(200).json(existingCategory);
        }
      }
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  });

  app.put('/api/admin/categories/:id', authenticate, isAdmin, (req, res) => {
    const { name, slug: rawSlug, parent_id, sort_order, status, description } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome da categoria Ã© obrigatÃ³rio' });
    }

    const safeName = normalizedName.slice(0, 255);
    const slugSource = typeof rawSlug === 'string' && rawSlug.trim() ? rawSlug.trim() : safeName;
    const generatedSlug = slugify(slugSource, { lower: true, strict: false, trim: true });
    const slug = (generatedSlug || safeName.toLowerCase().replace(/\s+/g, '-')).slice(0, 191);
    const categoryId = Number(req.params.id);

    try {
      const existingCategory = db.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE slug = ? AND id != ?
      `, slug, categoryId) as any;

      if (existingCategory) {
        return res.status(200).json(existingCategory);
      }

      db.run(`
        UPDATE product_categories 
        SET name = ?, slug = ?, parent_id = ?, sort_order = ?, status = ?, description = ?
        WHERE id = ?
      `, safeName, slug, parent_id || null, sort_order || 0, status || 'active', description || null, categoryId);

      const updatedCategory = db.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE id = ?
      `, categoryId) as any;

      if (!updatedCategory) {
        return res.status(404).json({ error: 'Categoria nÃ£o encontrada' });
      }

      return res.status(200).json(updatedCategory);
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        const existingCategory = db.get(`
          SELECT id, name, slug, parent_id, sort_order, status, description
          FROM product_categories
          WHERE slug = ?
        `, slug) as any;
        if (existingCategory) {
          return res.status(200).json(existingCategory);
        }
      }
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  });

  app.delete('/api/admin/categories/:id', authenticate, isAdmin, (req, res) => {
    try {
      db.run('DELETE FROM product_categories WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  });

  app.post('/api/admin/categories/bulk-delete', authenticate, isAdmin, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalizedIds = ids
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isInteger(value) && value > 0);

    if (normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma categoria vÃ¡lida foi informada' });
    }

    try {
      const placeholders = normalizedIds.map(() => '?').join(', ');
      const result = db.run(`DELETE FROM product_categories WHERE id IN (${placeholders})`, ...normalizedIds);
      res.json({ success: true, deleted: result.changes });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir categorias em massa' });
    }
  });

  // API Routes - ADMIN TAGS
  app.get('/api/admin/tags', authenticate, isAdmin, (req, res) => {
    try {
      const search = req.query.q;
      let query = 'SELECT * FROM product_tags';
      const params: any[] = [];

      if (search) {
        query += ' WHERE name LIKE ?';
        params.push(`%${search}%`);
      }

      query += ' ORDER BY name ASC LIMIT 100';
      const tags = db.all(query, ...params);
      res.json(tags);
    } catch (error) {
      console.error('Admin Fetch Tags Error:', error);
      res.status(500).json({ error: 'Erro ao buscar tags' });
    }
  });

  app.get('/api/admin/tags/most-used', authenticate, isAdmin, (req, res) => {
    const limitParam = Number(req.query.limit);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
    const tags = db.all(`
      SELECT
        t.id,
        t.name,
        t.slug,
        COUNT(ptr.product_id) AS usage_count
      FROM product_tags t
      LEFT JOIN product_tag_relations ptr ON ptr.tag_id = t.id
      GROUP BY t.id, t.name, t.slug
      ORDER BY usage_count DESC, t.name ASC
      LIMIT ?
    `, limit);
    res.json(tags);
  });

  // API Routes - CHECKOUT & ORDERS
  app.post('/api/checkout', authenticate, async (req, res) => {
    const {
      items,
      payment_method,
      payer = {},
      card_token,
      installments,
      issuer_id,
      payment_method_id,
    } = req.body || {};
    const user = (req as any).user;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }
    if (!['pix', 'credit_card', 'debit_card'].includes(payment_method)) {
      return res.status(400).json({ error: 'Método de pagamento inválido' });
    }

    try {
      let subtotal = 0;
      const orderItems: any[] = [];

      for (const item of items) {
        const productId = Number(item?.product_id);
        const quantity = Number(item?.quantity || 1);
        if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({ error: 'Itens inválidos no checkout' });
        }

        const product = db.get('SELECT id, name, slug, price, sale_price FROM products WHERE id = ?', productId) as any;
        if (!product) {
          return res.status(400).json({ error: `Produto ${productId} não encontrado` });
        }

        const unitPrice = product.sale_price !== null && product.sale_price !== undefined
          ? Number(product.sale_price)
          : Number(product.price);
        subtotal += unitPrice * quantity;

        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          product_slug: product.slug,
          price: unitPrice,
          quantity,
        });
      }

      if (orderItems.length === 0 || subtotal <= 0) {
        return res.status(400).json({ error: 'Não foi possível calcular o total do pedido' });
      }

      const payerEmail = String((payer as any)?.email || user?.email || '').trim().toLowerCase();
      const payerFirstName = String((payer as any)?.first_name || '').trim();
      const payerLastName = String((payer as any)?.last_name || '').trim();
      const payerCpf = normalizeCPF((payer as any)?.cpf);

      if (!payerEmail) {
        return res.status(400).json({ error: 'E-mail do pagador é obrigatório' });
      }
      if (!payerCpf) {
        return res.status(400).json({ error: 'CPF do pagador é obrigatório' });
      }

      const createOrderTransaction = db.transaction((payload: any) => {
        const orderResult = db.run(`
          INSERT INTO orders (user_id, total, status, payment_method, customer_email, customer_name)
          VALUES (?, ?, 'pending', ?, ?, ?)
        `, payload.userId, payload.total, payload.paymentMethod, payload.customerEmail, payload.customerName);

        const orderId = Number(orderResult.lastInsertRowid);
        payload.items.forEach((oi: any) => {
          db.run(`
            INSERT INTO order_items (order_id, product_id, product_name, product_slug, price, quantity)
            VALUES (?, ?, ?, ?, ?, ?)
          `, orderId, oi.product_id, oi.product_name, oi.product_slug, oi.price, oi.quantity);
        });

        return orderId;
      });

      const orderId = createOrderTransaction({
        userId: user.id,
        total: subtotal,
        paymentMethod: payment_method,
        customerEmail: payerEmail,
        customerName: `${payerFirstName} ${payerLastName}`.trim() || null,
        items: orderItems,
      });

      const { mode, accessToken } = resolveMercadoPagoSettings();
      if (!accessToken) {
        db.run(`UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, orderId);
        return res.status(400).json({
          error: 'Mercado Pago nao configurado. Preencha o Access Token em Configuracoes > Meios de Pagamento.',
        });
      }

      const paymentClient = createMercadoPagoPaymentClient();
      const notificationBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

      const commonBody: any = {
        transaction_amount: Number(subtotal.toFixed(2)),
        description: 'Matrizes de Bordado Digital',
        payer: {
          email: payerEmail,
          first_name: payerFirstName || undefined,
          last_name: payerLastName || undefined,
          identification: { type: 'CPF', number: payerCpf },
        },
        external_reference: String(orderId),
        notification_url: `${notificationBaseUrl}/api/webhooks/mercadopago`,
      };

      let payment: any;
      try {
        if (payment_method === 'pix') {
          payment = await paymentClient.create({
            body: {
              ...commonBody,
              payment_method_id: 'pix',
            },
          });
        } else {
          if (!card_token) {
            return res.status(400).json({ error: 'Token do cartao e obrigatorio' });
          }
          const requestedInstallments = payment_method === 'credit_card'
            ? Math.max(1, Number(installments || 1))
            : 1;

          payment = await paymentClient.create({
            body: {
              ...commonBody,
              token: card_token,
              installments: requestedInstallments,
              payment_method_id: payment_method_id || (payment_method === 'credit_card' ? 'visa' : undefined),
              issuer_id: issuer_id || undefined,
            },
          });
        }
      } catch (gatewayError: any) {
        const parsed = extractGatewayError(gatewayError);
        db.run(`UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, orderId);
        console.error('MercadoPago payment error:', parsed.details || gatewayError);
        return res.status(parsed.status >= 400 && parsed.status < 500 ? parsed.status : 400).json({
          error: parsed.message,
          details: parsed.details || null,
        });
      }

      const paymentId = payment?.id ? String(payment.id) : null;
      const paymentStatus = String(payment?.status || 'pending');

      if (paymentId) {
        db.run(`
          UPDATE orders
          SET transaction_id = ?, payment_method = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
          paymentId,
          payment_method,
          paymentStatus === 'approved' ? 'paid' : paymentStatus,
          orderId,
        );
      }

      if (paymentStatus === 'approved') {
        db.run(`
          UPDATE orders
          SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, orderId);
      }

      const pixData = payment?.point_of_interaction?.transaction_data || {};
      
      // TRIGGER EMAIL: order_created
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const itemsHtml = orderItems.map(i => `<li>${i.quantity}x ${i.product_name} - R$ ${i.price.toFixed(2)}</li>`).join('');
      sendEmail({
        to: payerEmail,
        templateKey: 'order_created',
        variables: {
          name: payerFirstName || 'Cliente',
          order_id: orderId,
          order_total: `R$ ${subtotal.toFixed(2)}`,
          order_status: paymentStatus,
          items: `<ul>${itemsHtml}</ul>`,
          payment_method: payment_method,
          account_url: `${appUrl}/conta`
        }
      }).catch(err => console.error('Failed to send order_created email:', err));

      return res.json({
        success: true,
        mode,
        order_id: orderId,
        payment_id: paymentId,
        status: paymentStatus,
        payment_method,
        qr_code: pixData.qr_code || null,
        qr_code_base64: pixData.qr_code_base64 || null,
      });
    } catch (error) {
      console.error('Checkout error:', error);
      return res.status(500).json({ error: 'Erro ao processar checkout' });
    }
  });

  app.get('/api/checkout/config', (req, res) => {
    const { publicKey, mode } = resolveMercadoPagoSettings();
    return res.json({ public_key: publicKey || '', mode });
  });

  app.get('/api/payments/:payment_id/status', authenticate, async (req, res) => {
    try {
      const paymentId = String(req.params.payment_id || '').trim();
      if (!paymentId) return res.status(400).json({ error: 'payment_id inválido' });

      const paymentClient = createMercadoPagoPaymentClient();
      const payment = await paymentClient.get({ id: paymentId });
      const status = String(payment?.status || 'pending');

      const order = db.get('SELECT id FROM orders WHERE transaction_id = ? LIMIT 1', paymentId) as any;
      const orderId = order?.id ? Number(order.id) : null;
      if (orderId && status === 'approved') {
        db.run(`
          UPDATE orders
          SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, orderId);
      }

      return res.json({ status, order_id: orderId });
    } catch (error) {
      console.error('Payment status error:', error);
      return res.status(500).json({ error: 'Erro ao consultar status do pagamento' });
    }
  });

  app.post('/api/webhooks/mercadopago', async (req, res) => {
    const payload = req.body || {};
    try {
      db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify(payload), 'received');

      const eventType = (payload as any)?.type || (payload as any)?.action;
      const paymentId = (payload as any)?.data?.id || (payload as any)?.id;
      if (eventType === 'payment' || eventType === 'payment.created' || eventType === 'payment.updated') {
        if (paymentId) {
          const paymentClient = createMercadoPagoPaymentClient();
          const payment = await paymentClient.get({ id: String(paymentId) });
          const paymentStatus = String(payment?.status || 'pending');
          const transactionId = String(payment?.id || paymentId);
          const order = db.get('SELECT * FROM orders WHERE transaction_id = ? LIMIT 1', transactionId) as any;
          if (order?.id) {
            const previousStatus = order.status;
            if (paymentStatus === 'approved') {
              db.run(`
                UPDATE orders
                SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `, Number(order.id));

              if (previousStatus !== 'paid') {
                // TRIGGER EMAIL: order_paid and downloads_available
                const appUrl = process.env.APP_URL || `http://${req.get('host')}`;
                const itemsList = db.all('SELECT product_name, quantity, price FROM order_items WHERE order_id = ?', order.id) as any[];
                const itemsHtml = itemsList.map(i => `<li>${i.quantity}x ${i.product_name} - R$ ${i.price.toFixed(2)}</li>`).join('');
                
                sendEmail({
                  to: order.customer_email,
                  templateKey: 'order_paid',
                  variables: {
                    name: order.customer_name || 'Cliente',
                    order_id: order.id,
                    order_total: `R$ ${order.total.toFixed(2)}`,
                    items: `<ul>${itemsHtml}</ul>`,
                    downloads_url: `${appUrl}/conta`
                  }
                }).catch(err => console.error('Failed to send order_paid email:', err));
              }
            } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
              db.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, paymentStatus, Number(order.id));
              
              if (previousStatus !== 'rejected' && previousStatus !== 'cancelled') {
                const appUrl = process.env.APP_URL || `http://${req.get('host')}`;
                sendEmail({
                  to: order.customer_email,
                  templateKey: 'payment_failed',
                  variables: {
                    name: order.customer_name || 'Cliente',
                    order_id: order.id,
                    order_total: `R$ ${order.total.toFixed(2)}`,
                    retry_url: `${appUrl}/checkout`
                  }
                }).catch(err => console.error('Failed to send payment_failed email:', err));
              }
            }
          }
          db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify({ eventType, paymentStatus, paymentId }), 'processed');
        }
      }
    } catch (error) {
      console.error('MercadoPago webhook error:', error);
      db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify(payload), 'error');
    }

    return res.sendStatus(200);
  });
  app.get('/api/customer/account', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const profile = db.get(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.first_name,
          u.last_name,
          u.phone,
          u.cpf,
          u.avatar_url,
          c.billing_address,
          c.billing_city,
          c.billing_state,
          c.billing_zip,
          c.billing_country,
          c.shipping_address,
          c.shipping_city,
          c.shipping_state,
          c.shipping_zip,
          c.shipping_country,
          c.address,
          c.city,
          c.state,
          c.zip,
          c.country
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
      `, user.id) as any;

      const summary = db.get(`
        SELECT
          (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS orders_count,
          (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorites_count,
          (
            SELECT COUNT(*)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.user_id = ? AND o.status = 'paid'
          ) AS purchased_items
      `, user.id, user.id, user.id) as any;

      return res.json({
        user: profile || null,
        summary: {
          orders_count: Number(summary?.orders_count || 0),
          favorites_count: Number(summary?.favorites_count || 0),
          purchased_items: Number(summary?.purchased_items || 0),
        },
      });
    } catch (error: any) {
      console.error('Customer Account Error Detail:', {
        message: error.message,
        stack: error.stack,
        userId: user.id
      });
      return res.status(500).json({ error: `Erro ao carregar dados da conta: ${error.message}` });
    }
  });

  app.get('/api/customer/orders', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const orders = db.all(`
        SELECT
          o.*,
          COALESCE(SUM(oi.quantity), 0) AS total_items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, user.id) as any[];
      return res.json(orders);
    } catch (error) {
      console.error('Customer Orders Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  });

  // API Routes - ADMIN ORDERS
  app.get('/api/admin/orders', authenticate, isAdmin, (req, res) => {
    try {
      const orders = db.all(`
        SELECT 
          o.*, 
          COALESCE(u.name, o.customer_name) as user_name, 
          COALESCE(u.email, o.customer_email) as user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);
      res.json(orders);
    } catch (error) {
      console.error('Admin Fetch Orders Error:', error);
      res.status(500).json({ error: 'Erro ao buscar pedidos do admin' });
    }
  });


  app.get('/api/customer/orders/:id', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: 'Pedido invalido' });
      }

      const order = db.get(`
        SELECT
          o.id,
          o.created_at,
          o.updated_at,
          o.status,
          o.total,
          o.payment_method,
          o.transaction_id
        FROM orders o
        WHERE o.id = ? AND o.user_id = ?
        LIMIT 1
      `, orderId, user.id) as any;

      if (!order) {
        return res.status(404).json({ error: 'Pedido nao encontrado' });
      }

      const items = db.all(`
        SELECT
          oi.id,
          oi.product_id,
          COALESCE(oi.product_name, p.name) AS product_name,
          COALESCE(oi.product_slug, p.slug) AS product_slug,
          p.image AS product_image,
          oi.quantity,
          oi.price
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `, orderId) as any[];

      return res.json({ order, items });
    } catch (error) {
      console.error('Customer Order Detail Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar detalhes do pedido' });
    }
  });

  // Rota de proxy para download seguro (resolve 403 em diretórios protegidos)
  app.get('/api/customer/download-file', authenticate, async (req, res) => {
    try {
      const { path: filePath } = req.query;
      if (!filePath || typeof filePath !== 'string') {
        return res.status(400).json({ error: 'Caminho do arquivo é obrigatório' });
      }

      // Segurança: Prevenir SSRF garantindo que apenas arquivos do domínio oficial sejam baixados
      let targetUrl = filePath.startsWith('http') ? filePath : `https://digitalbordados.com.br${filePath.startsWith('/') ? '' : '/'}${filePath}`;
      
      const allowedDomain = 'digitalbordados.com.br';
      try {
        const urlObj = new URL(targetUrl);
        if (!urlObj.hostname.includes(allowedDomain)) {
          return res.status(403).json({ error: 'Download não autorizado para este domínio.' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'URL de arquivo inválida.' });
      }

      console.log(`Iniciando download via proxy seguro: ${targetUrl}`);

      const response = await axios.get(targetUrl, { responseType: 'stream' });
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const fileName = targetUrl.split('/').pop() || 'matriz.zip';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      response.data.pipe(res);
    } catch (error: any) {
      console.error('Erro no proxy de download:', error.message);
      res.status(500).json({ error: 'Não foi possível processar o download. Tente novamente mais tarde.' });
    }
  });

  app.get('/api/customer/downloads', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const downloads = db.all(`
        SELECT
          oi.id AS download_id,
          o.id AS order_id,
          oi.product_id,
          COALESCE(oi.product_name, p.name) AS product_name,
          p.slug AS product_slug,
          p.image AS product_image,
          p.production_sheet,
          f.file_path,
          f.file_name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN product_files f ON f.product_id = oi.product_id
        WHERE o.user_id = ? AND o.status = 'paid'
        ORDER BY o.created_at DESC, oi.id DESC
      `, user.id) as any[];
      return res.json(downloads);
    } catch (error) {
      console.error('Customer Downloads Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar matrizes compradas' });
    }
  });

  app.put('/api/customer/profile', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        first_name = '',
        last_name = '',
        display_name = '',
        email = '',
        phone = '',
        cpf = '',
      } = req.body || {};

      const normalizedFirstName = String(first_name || '').trim();
      const normalizedLastName = String(last_name || '').trim();
      const normalizedDisplayName = String(display_name || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPhone = String(phone || '').trim();
      const normalizedCpf = String(cpf || '').trim();

      if (!normalizedDisplayName) {
        return res.status(400).json({ error: 'Nome de exibicao e obrigatorio' });
      }
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'E-mail invalido' });
      }

      const duplicate = db.get('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, user.id) as any;
      if (duplicate) {
        return res.status(409).json({ error: 'Este e-mail ja esta em uso por outra conta' });
      }

      db.transaction(() => {
        db.run(`
          UPDATE users
          SET
            name = ?,
            email = ?,
            first_name = ?,
            last_name = ?,
            phone = ?,
            cpf = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, normalizedDisplayName, normalizedEmail, normalizedFirstName || null, normalizedLastName || null, normalizedPhone || null, normalizedCpf || null, user.id);

        const customer = db.get('SELECT id FROM customers WHERE user_id = ?', user.id) as any;
        if (customer?.id) {
          db.run('UPDATE customers SET phone = ?, cpf = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', normalizedPhone || null, normalizedCpf || null, user.id);
        } else {
          db.run('INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)', user.id, normalizedPhone || null, normalizedCpf || null);
        }
      })();

      const updated = db.get(`
        SELECT id, name, email, role, first_name, last_name, phone, cpf, avatar_url
        FROM users WHERE id = ? LIMIT 1
      `, user.id) as any;

      return res.json({ success: true, user: updated });
    } catch (error) {
      console.error('Customer Update Profile Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  });

  app.put('/api/customer/password', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { current_password = '', new_password = '', confirm_new_password = '' } = req.body || {};

      if (!String(current_password).trim()) {
        return res.status(400).json({ error: 'Senha atual e obrigatoria' });
      }
      if (!String(new_password).trim() || String(new_password).length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter no minimo 6 caracteres' });
      }
      if (String(new_password) !== String(confirm_new_password)) {
        return res.status(400).json({ error: 'A confirmacao da nova senha nao confere' });
      }

      const dbUser = db.get('SELECT id, password, email, name FROM users WHERE id = ? LIMIT 1', user.id) as any;
      if (!dbUser) {
        return res.status(404).json({ error: 'Usuario nao encontrado' });
      }

      const isValidCurrentPassword = await comparePassword(String(current_password), String(dbUser.password || ''));
      if (!isValidCurrentPassword) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      const hashed = await hashPassword(String(new_password));
      db.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', hashed, user.id);

      return res.json({ success: true, message: 'Senha atualizada com sucesso' });
    } catch (error) {
      console.error('Customer Update Password Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
  });

  app.put('/api/customer/addresses', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const billing = req.body?.billing || {};
      const shipping = req.body?.shipping || {};

      const payload = {
        billing_address: String(billing.address || '').trim() || null,
        billing_city: String(billing.city || '').trim() || null,
        billing_state: String(billing.state || '').trim() || null,
        billing_zip: String(billing.zip || '').trim() || null,
        billing_country: String(billing.country || '').trim() || null,
        shipping_address: String(shipping.address || '').trim() || null,
        shipping_city: String(shipping.city || '').trim() || null,
        shipping_state: String(shipping.state || '').trim() || null,
        shipping_zip: String(shipping.zip || '').trim() || null,
        shipping_country: String(shipping.country || '').trim() || null,
      };

      const customer = db.get('SELECT id FROM customers WHERE user_id = ?', user.id) as any;
      if (customer?.id) {
        db.run(`
          UPDATE customers
          SET
            billing_address = ?,
            billing_city = ?,
            billing_state = ?,
            billing_zip = ?,
            billing_country = ?,
            shipping_address = ?,
            shipping_city = ?,
            shipping_state = ?,
            shipping_zip = ?,
            shipping_country = ?,
            address = COALESCE(?, address),
            city = COALESCE(?, city),
            state = COALESCE(?, state),
            zip = COALESCE(?, zip),
            country = COALESCE(?, country),
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
          payload.billing_address,
          payload.billing_city,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
          payload.shipping_address,
          payload.shipping_city,
          payload.shipping_state,
          payload.shipping_zip,
          payload.shipping_country,
          payload.billing_address,
          payload.billing_city,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
          user.id,
        );
      } else {
        db.run(`
          INSERT INTO customers (
            user_id, phone, cpf,
            billing_address, billing_city, billing_state, billing_zip, billing_country,
            shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country,
            address, city, state, zip, country
          )
          VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          user.id,
          payload.billing_address,
          payload.billing_city,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
          payload.shipping_address,
          payload.shipping_city,
          payload.shipping_state,
          payload.shipping_zip,
          payload.shipping_country,
          payload.billing_address,
          payload.billing_city,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
        );
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Customer Update Addresses Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar enderecos' });
    }
  });

  app.post('/api/customer/avatar', authenticate, upload.single('avatar'), (req, res) => {
    try {
      const user = (req as any).user;
      if (!req.file?.filename) {
        return res.status(400).json({ error: 'Arquivo de avatar nao enviado' });
      }
      const avatarUrl = `/uploads/${req.file.filename}`;
      db.run('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', avatarUrl, user.id);
      return res.json({ success: true, avatar_url: avatarUrl });
    } catch (error) {
      console.error('Customer Upload Avatar Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar foto do perfil' });
    }
  });

  // ROTA DE DESENVOLVIMENTO: Simular pagamento aprovado
  app.post('/api/dev/approve-order/:id', authenticate, (req, res) => {
    const orderId = req.params.id;
    try {
      db.run("UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?", orderId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao aprovar pedido' });
    }
  });

  app.post('/api/admin/tags', authenticate, isAdmin, (req, res) => {
    const { name } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome da tag Ã© obrigatÃ³rio' });
    }

    const safeName = normalizedName.slice(0, 255);
    const generatedSlug = slugify(safeName, { lower: true, strict: false, trim: true });
    const slug = (generatedSlug || safeName.toLowerCase().replace(/\s+/g, '-')).slice(0, 191);

    try {
      const existingTag = db.get('SELECT id, name, slug FROM product_tags WHERE slug = ?', slug) as any;
      if (existingTag) {
        return res.status(200).json(existingTag);
      }

      const result = db.run('INSERT IGNORE INTO product_tags (name, slug) VALUES (?, ?)', safeName, slug);
      const createdTag = db.get('SELECT id, name, slug FROM product_tags WHERE id = ?', result.lastInsertRowid) as any;
      return res.status(200).json(createdTag);
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        const existingTag = db.get('SELECT id, name, slug FROM product_tags WHERE slug = ?', slug) as any;
        if (existingTag) {
          return res.status(200).json(existingTag);
        }
      }
      res.status(500).json({ error: 'Erro ao criar tag' });
    }
  });

  app.delete('/api/admin/tags/:id', authenticate, isAdmin, (req, res) => {
    try {
      db.run('DELETE FROM product_tags WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Fetch Orders Error:', error);
      res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  });

  app.post('/api/admin/orders/import', authenticate, isAdmin, (req, res) => {
    const {
      user_id = null,
      customer_email = null,
      customer_name = null,
      total,
      status = 'pending',
      payment_method = null,
      transaction_id = null,
      billing_address = null,
      woo_order_id = null,
      created_at = null,
      paid_at = null,
      items = [],
    } = req.body || {};

    const orderTotal = Number(total);
    if (!Number.isFinite(orderTotal) || orderTotal < 0) {
      return res.status(400).json({ error: 'total inválido' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items é obrigatório e deve conter ao menos 1 item' });
    }

    let normalizedItems: Array<{
      product_id: number | null;
      product_name: string | null;
      quantity: number;
      price: number;
    }> = [];

    try {
      normalizedItems = items.map((item: any, index: number) => {
        const quantity = Number(item?.quantity);
        const price = Number(item?.price);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error(`item_${index}_invalid_quantity`);
        }
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`item_${index}_invalid_price`);
        }

        const rawProductId = item?.product_id;
        const parsedProductId = rawProductId === null || rawProductId === undefined || rawProductId === ''
          ? null
          : Number(rawProductId);

        if (parsedProductId !== null && (!Number.isInteger(parsedProductId) || parsedProductId <= 0)) {
          throw new Error(`item_${index}_invalid_product_id`);
        }

        return {
          product_id: parsedProductId,
          product_name: item?.product_name ? String(item.product_name) : null,
          quantity,
          price,
        };
      });
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.startsWith('item_')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(400).json({ error: 'items inválidos' });
    }

    const rawUserId = user_id === null || user_id === undefined || user_id === '' ? null : Number(user_id);
    if (rawUserId !== null && (!Number.isInteger(rawUserId) || rawUserId <= 0)) {
      return res.status(400).json({ error: 'user_id inválido' });
    }

    try {
      const importOrderTransaction = db.transaction((payload: any) => {
        let safeUserId: number | null = payload.userId;
        if (safeUserId !== null) {
          const existingUser = db.get('SELECT id FROM users WHERE id = ?', safeUserId) as any;
          if (!existingUser) {
            safeUserId = null;
          }
        }

        const orderResult = db.run(`
          INSERT INTO orders (
            user_id, customer_email, customer_name, total, status, payment_method, transaction_id,
            billing_address, woo_order_id, created_at, paid_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, CURRENT_TIMESTAMP)
        `,
          safeUserId,
          payload.customerEmail,
          payload.customerName,
          payload.total,
          payload.status,
          payload.paymentMethod,
          payload.transactionId,
          payload.billingAddress,
          payload.wooOrderId,
          payload.createdAt,
          payload.paidAt,
        );

        const orderId = Number(orderResult.lastInsertRowid);
        payload.items.forEach((item: any) => {
          let safeProductId: number | null = item.product_id;
          if (safeProductId !== null) {
            const existingProduct = db.get('SELECT id FROM products WHERE id = ?', safeProductId) as any;
            if (!existingProduct) {
              safeProductId = null;
            }
          }

          db.run(`
            INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
            VALUES (?, ?, ?, ?, ?)
          `, orderId, safeProductId, item.product_name, item.price, item.quantity);
        });

        return orderId;
      });

      const orderId = importOrderTransaction({
        userId: rawUserId,
        customerEmail: customer_email ? String(customer_email).trim().toLowerCase() : null,
        customerName: customer_name ? String(customer_name).trim() : null,
        total: Number(orderTotal.toFixed(2)),
        status: typeof status === 'string' && status.trim() ? status.trim() : 'pending',
        paymentMethod: payment_method ? String(payment_method) : null,
        transactionId: transaction_id ? String(transaction_id) : null,
        billingAddress: billing_address ? String(billing_address) : null,
        wooOrderId: woo_order_id ? String(woo_order_id) : null,
        createdAt: created_at || null,
        paidAt: paid_at || null,
        items: normalizedItems,
      });

      const createdOrder = db.get('SELECT id, status FROM orders WHERE id = ?', orderId) as any;
      return res.status(201).json({
        id: Number(createdOrder?.id || orderId),
        status: createdOrder?.status || 'pending',
      });
    } catch (error) {
      console.error('Admin Import Order Error:', error);
      return res.status(500).json({ error: 'Erro ao importar pedido' });
    }
  });

  app.get('/api/admin/orders/:id', authenticate, isAdmin, (req, res) => {
    try {
      const order = db.get(`
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
      `, req.params.id) as any;

      if (!order) return res.status(404).json({ error: 'Pedido nÃ£o encontrado' });

      const items = db.all(`
        SELECT oi.*, p.name 
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `, req.params.id);

      res.json({ order, items });
    } catch (error) {
      console.error('Admin Fetch Order Details Error:', error);
      res.status(500).json({ error: 'Erro ao buscar detalhes do pedido' });
    }
  });

  app.put('/api/admin/orders/:id/status', authenticate, isAdmin, (req, res) => {
    const { status } = req.body;
    try {
      const updateData: any[] = [status, req.params.id];
      let query = 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP';
      
      if (status === 'paid') {
        query += ', paid_at = CURRENT_TIMESTAMP';
      }
      
      query += ' WHERE id = ?';
      
      db.run(query, ...updateData);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Update Order Status Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
    }
  });

  // API Routes - ADMIN USERS
  app.get('/api/admin/users', authenticate, isAdmin, (req, res) => {
    try {
      const users = db.all(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
          (SELECT SUM(total) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') as total_spent
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        ORDER BY u.created_at DESC
      `);
      res.json(users);
    } catch (error) {
      console.error('Admin Fetch Users Error:', error);
      res.status(500).json({ error: 'Erro ao buscar usuÃ¡rios' });
    }
  });

  app.post('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    const {
      name,
      email,
      password,
      role = 'customer',
      status = 'ativo',
      phone = null,
      cpf = null,
      first_name = null,
      last_name = null,
      date_registered = null,
      address = null,
      city = null,
      state = null,
      zip = null,
      country = null,
    } = req.body || {};

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedRole = role === 'admin' ? 'admin' : 'customer';
    const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'ativo';

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha sÃ£o obrigatÃ³rios' });
    }

    const existingUser = db.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
    if (existingUser) {
      return res.status(409).json({ error: 'E-mail jÃ¡ cadastrado' });
    }

    const hashedPassword = await hashPassword(String(password));

    try {
      const trans = db.transaction(() => {
        const userResult = db.run(`
          INSERT INTO users (
            name, email, password, role, status, phone, cpf, first_name, last_name, date_registered
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          normalizedName,
          normalizedEmail,
          hashedPassword,
          normalizedRole,
          normalizedStatus,
          phone || null,
          cpf || null,
          first_name || null,
          last_name || null,
          date_registered || null,
        );

        const userId = Number(userResult.lastInsertRowid);
        const existingCustomer = db.get('SELECT id FROM customers WHERE user_id = ? LIMIT 1', userId) as any;

        if (existingCustomer) {
          db.run(`
            UPDATE customers
            SET phone = ?, cpf = ?, address = ?, city = ?, state = ?, zip = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
            userId,
          );
        } else {
          db.run(`
            INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
            userId,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
          );
        }

        return userId;
      });

      const userId = trans();
      const createdUser = db.get(`
        SELECT
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?
      `, userId) as any;

      return res.status(201).json(createdUser);
    } catch (error: any) {
      if (error?.message?.includes('Duplicate entry') || error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'E-mail jÃ¡ cadastrado' });
      }
      console.error('Admin Create User Error:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar usuÃ¡rio' });
    }
  });

  app.post('/api/admin/users/import', authenticate, isAdmin, (req, res) => {
    const {
      name,
      email,
      password,
      role = 'customer',
      status = 'ativo',
      phone = null,
      cpf = null,
      address = null,
      city = null,
      state = null,
      zip = null,
      country = null,
      date_registered = null,
      first_name = null,
      last_name = null,
      woo_user_id = null,
    } = req.body || {};

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedRole = role === 'admin' ? 'admin' : 'customer';
    const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'ativo';

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'name, email e password são obrigatórios' });
    }

    const existingUser = db.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
    if (existingUser) {
      return res.status(409).json({ error: 'already_exists', id: Number(existingUser.id) });
    }

    try {
      const importUserTransaction = db.transaction((payload: any) => {
        const userResult = db.run(`
          INSERT INTO users (
            name, email, password, role, status, phone, cpf, date_registered, first_name, last_name, woo_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          payload.name,
          payload.email,
          payload.password,
          payload.role,
          payload.status,
          payload.phone,
          payload.cpf,
          payload.dateRegistered,
          payload.firstName,
          payload.lastName,
          payload.wooUserId,
        );

        const userId = Number(userResult.lastInsertRowid);
        db.run(`
          INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          userId,
          payload.phone,
          payload.cpf,
          payload.address,
          payload.city,
          payload.state,
          payload.zip,
          payload.country,
        );

        return userId;
      });

      const userId = importUserTransaction({
        name: normalizedName,
        email: normalizedEmail,
        password: String(password),
        role: normalizedRole,
        status: normalizedStatus,
        phone: phone || null,
        cpf: cpf || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || null,
        dateRegistered: date_registered || null,
        firstName: first_name || null,
        lastName: last_name || null,
        wooUserId: woo_user_id ? String(woo_user_id) : null,
      });

      return res.status(201).json({ id: userId, status: 'created' });
    } catch (error: any) {
      if (error?.message?.includes('Duplicate entry') || error?.code === 'ER_DUP_ENTRY') {
        const duplicate = db.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
        return res.status(409).json({ error: 'already_exists', id: duplicate ? Number(duplicate.id) : null });
      }
      console.error('Admin Import User Error:', error);
      return res.status(500).json({ error: 'Erro ao importar usuário' });
    }
  });

  const adminUpdateUserHandler = async (req: express.Request, res: express.Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    const {
      name,
      email,
      password = '',
      role = 'customer',
      status = 'ativo',
      phone = null,
      cpf = null,
      first_name = null,
      last_name = null,
      date_registered = null,
      address = null,
      city = null,
      state = null,
      zip = null,
      country = null,
    } = req.body || {};

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedRole = role === 'admin' ? 'admin' : 'customer';
    const normalizedStatus = typeof status === 'string' && status.trim() ? status.trim() : 'ativo';
    const normalizedPassword = typeof password === 'string' ? password.trim() : '';

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
    }

    const existingUser = db.get('SELECT id FROM users WHERE id = ?', userId) as any;
    if (!existingUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const duplicateEmail = db.get('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, userId) as any;
    if (duplicateEmail) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    try {
      let hashedPassword: string | undefined;
      if (normalizedPassword) {
        hashedPassword = await hashPassword(normalizedPassword);
      }

      const trans = db.transaction(() => {
        if (normalizedPassword) {
          db.run(`
            UPDATE users
            SET
              name = ?,
              email = ?,
              password = ?,
              role = ?,
              status = ?,
              phone = ?,
              cpf = ?,
              first_name = ?,
              last_name = ?,
              date_registered = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            normalizedName,
            normalizedEmail,
            hashedPassword,
            normalizedRole,
            normalizedStatus,
            phone || null,
            cpf || null,
            first_name || null,
            last_name || null,
            date_registered || null,
            userId,
          );
        } else {
          db.run(`
            UPDATE users
            SET
              name = ?,
              email = ?,
              role = ?,
              status = ?,
              phone = ?,
              cpf = ?,
              first_name = ?,
              last_name = ?,
              date_registered = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            normalizedName,
            normalizedEmail,
            normalizedRole,
            normalizedStatus,
            phone || null,
            cpf || null,
            first_name || null,
            last_name || null,
            date_registered || null,
            userId,
          );
        }

        const existingCustomer = db.get('SELECT id FROM customers WHERE user_id = ? LIMIT 1', userId) as any;
        if (existingCustomer) {
          db.run(`
            UPDATE customers
            SET phone = ?, cpf = ?, address = ?, city = ?, state = ?, zip = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
            userId,
          );
        } else {
          db.run(`
            INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
            userId,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
          );
        }
      });

      trans();

      const updatedUser = db.get(`
        SELECT
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
          (SELECT SUM(total) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') as total_spent
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?
      `, userId) as any;

      return res.json(updatedUser);
    } catch (error) {
      console.error('Admin Update User Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  };

  app.put('/api/admin/users/:id', authenticate, isAdmin, adminUpdateUserHandler);
  app.post('/api/admin/users/:id/update', authenticate, isAdmin, adminUpdateUserHandler);

  app.put('/api/admin/users/:id/role', authenticate, isAdmin, (req, res) => {
    const { role } = req.body;
    try {
      db.run('UPDATE users SET role = ? WHERE id = ?', role, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Update User Role Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar cargo do usuÃ¡rio' });
    }
  });

  app.delete('/api/admin/users/:id', authenticate, isAdmin, (req, res) => {
    try {
      // Don't allow deleting self
      if (req.params.id === (req as any).user.id.toString()) {
        return res.status(400).json({ error: 'VocÃª nÃ£o pode excluir a si mesmo' });
      }
      db.run('DELETE FROM users WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Delete User Error:', error);
      res.status(500).json({ error: 'Erro ao excluir usuÃ¡rio' });
    }
  });
  
  app.get('/api/admin/settings', authenticate, isAdmin, (req, res) => {
    try {
      const rows = db.all('SELECT `key`, value FROM settings') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);
    } catch (error) {
      console.error('Fetch Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃ§Ãµes' });
    }
  });

  app.post('/api/admin/settings', authenticate, isAdmin, (req, res) => {
    const settings = req.body;
    try {
      const trans = db.transaction((data) => {
        for (const [key, value] of Object.entries(data)) {
          db.run(
            'INSERT INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\')) ON DUPLICATE KEY UPDATE value = COALESCE(VALUES(value), \'\')',
            key,
            value == null ? '' : String(value),
          );
        }
      });
      trans(settings);
      apiCache.delete('public_settings');
      res.json({ success: true });
    } catch (error) {
      console.error('Update Settings Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
  });

  app.post('/api/admin/payments/test-connection', authenticate, isAdmin, async (req, res) => {
    try {
      const requestBody = req.body || {};
      const resolved = resolveMercadoPagoSettings();
      const accessToken = String(
        requestBody.mp_access_token ||
        requestBody.mercadopago_access_token ||
        resolved.accessToken ||
        ''
      ).trim();

      if (!accessToken) {
        return res.status(400).json({ connected: false, error: 'Access Token não informado.' });
      }

      const testResult = await fetchMercadoPagoAccountInfo(accessToken);
      if (!testResult.ok) {
        return res.status(400).json({
          connected: false,
          error: testResult.message,
          details: testResult.details,
        });
      }

      return res.json({
        connected: true,
        account: testResult.account,
      });
    } catch (error: any) {
      console.error('Mercado Pago test-connection error:', error);
      return res.status(500).json({
        connected: false,
        error: 'Erro ao testar conexão com Mercado Pago.',
      });
    }
  });

  // API Routes - EMAIL TEMPLATES
  app.get('/api/admin/email-templates', authenticate, isAdmin, (req, res) => {
    try {
      const templates = db.all('SELECT * FROM email_templates ORDER BY id ASC');
      res.json(templates);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ error: 'Erro ao buscar templates' });
    }
  });

  app.get('/api/admin/email-templates/:key', authenticate, isAdmin, (req, res) => {
    try {
      const template = db.get('SELECT * FROM email_templates WHERE `key` = ?', req.params.key);
      if (!template) return res.status(404).json({ error: 'Template não encontrado' });
      res.json(template);
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: 'Erro ao buscar template' });
    }
  });

  app.put('/api/admin/email-templates/:key', authenticate, isAdmin, (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) return res.status(400).json({ error: 'Subject e body são obrigatórios' });

      const changes = db.run(
        'UPDATE email_templates SET subject = ?, body = ? WHERE `key` = ?',
        subject, body, req.params.key
      );

      if (changes.changes === 0) return res.status(404).json({ error: 'Template não encontrado' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating email template:', error);
      res.status(500).json({ error: 'Erro ao atualizar template' });
    }
  });

  app.post('/api/admin/email/test-connection', authenticate, isAdmin, async (req, res) => {
    try {
      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_secure")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: Number(settings.smtp_port) || 587,
        secure: settings.smtp_secure === 'true' || settings.smtp_secure === '1',
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      await transporter.verify();
      res.json({ ok: true });
    } catch (error: any) {
      console.error('SMTP Test Error:', error);
      res.json({
        ok: false,
        error: error?.message || 'Falha ao conectar no servidor SMTP',
        code: error?.code || null,
        name: error?.name || null,
        stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 3).join('\n') : null,
      });
    }
  });

  app.post('/api/admin/email/send-test', authenticate, isAdmin, async (req, res) => {
    try {
      const { to, template_key } = req.body;
      if (!to || !template_key) return res.status(400).json({ error: 'Destinatário e template_key são obrigatórios' });

      const testVars = {
        name: 'Usuário Teste',
        email: to,
        login_url: 'https://digitalbordados.com.br/login',
        reset_url: 'https://digitalbordados.com.br/redefinir-senha?token=test',
        order_id: '9999',
        order_total: 'R$ 150,00',
        order_status: 'Pendente',
        items: '<li>1x Produto Teste - R$ 150,00</li>',
        payment_method: 'PIX',
        account_url: 'https://digitalbordados.com.br/conta',
        downloads_url: 'https://digitalbordados.com.br/conta',
        retry_url: 'https://digitalbordados.com.br/checkout',
        pix_code: '00020126580014br.gov.bcb.pix...',
        expires_at: new Date(Date.now() + 3600000).toLocaleString('pt-BR'),
        temp_password: 'SenhaTemporaria123',
        change_password_url: 'https://digitalbordados.com.br/conta',
        expires_in: '2'
      };

      const result = await sendEmail({ to, templateKey: template_key, variables: testVars });
      
      if (result.success) {
        res.json({ success: true, message: 'E-mail enviado com sucesso!' });
      } else {
        res.status(500).json({ error: result.error || 'Falha ao enviar o e-mail de teste' });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      res.status(500).json({ error: 'Erro interno ao disparar e-mail' });
    }
  });

  app.post('/api/admin/email-templates/seed', authenticate, isAdmin, (req, res) => {
    try {
      const seedTemplates = [
        {
          key: 'user_welcome',
          name: 'Boas-vindas (Novo Cadastro)',
          subject: 'Bem-vindo(a) à {{store_name}}! 🎉',
          variables: '["name", "email", "login_url"]',
          body: `<div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    {{#if store_logo}}<img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 60px;">{{else}}<h2>{{store_name}}</h2>{{/if}}
  </div>
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    <h1 style="color: #1e293b; margin-top: 0;">Olá, {{name}}!</h1>
    <p style="color: #475569; font-size: 16px; line-height: 1.6;">Que alegria ter você conosco. Sua conta foi criada com sucesso e você já pode explorar todas as nossas matrizes de bordado.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{login_url}}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar Minha Conta</a>
    </div>
    <p style="color: #475569; font-size: 14px;">Seu e-mail de acesso é: <strong>{{email}}</strong></p>
  </div>
</div>`
        }
      ];

      db.transaction((templates) => {
        for (const t of templates) {
          db.run(
            'INSERT IGNORE INTO email_templates (`key`, name, subject, body, variables, active) VALUES (?, ?, ?, ?, ?, 1)',
            t.key, t.name, t.subject, t.body, t.variables
          );
        }
      })(seedTemplates);

      res.json({ success: true });
    } catch (error) {
      console.error('Error seeding templates:', error);
      res.status(500).json({ error: 'Erro ao gerar templates' });
    }
  });

  app.get('/api/admin/email-logs', authenticate, isAdmin, (req, res) => {
    try {
      const logs = db.all('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 100');
      res.json(logs);
    } catch (error) {
      console.error('Error fetching email logs:', error);
      res.status(500).json({ error: 'Erro ao buscar logs' });
    }
  });

  app.get('/api/admin/dashboard/stats', authenticate, isAdmin, (req, res) => {
    const cached = apiCache.get('admin_dashboard_stats');
    if (cached) return res.json(cached);

    try {
      // Período Atual (30 dias)
      const currentStats = db.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // Período Anterior (30-60 dias atrás) para cálculo de tendência
      const previousStats = db.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      const activeProducts = db.get("SELECT COUNT(*) as count FROM products WHERE status = 'active'") as any;
      const totalCustomers = db.get("SELECT COUNT(*) as count FROM users WHERE role = 'customer'") as any;
      
      const prevCustomers = db.get(`
        SELECT COUNT(*) as count FROM users 
        WHERE role = 'customer' 
        AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // Funções de cálculo de tendência
      const calcTrend = (curr: number, prev: number) => {
        if (!prev || prev === 0) return curr > 0 ? '+100%' : '0%';
        const diff = ((curr - prev) / prev) * 100;
        return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
      };

      const recentOrders = db.all(`
        SELECT o.*, COALESCE(o.customer_name, u.name) as display_name, u.email as customer_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC 
        LIMIT 6
      `);

      const salesChart = db.all(`
        SELECT DATE_FORMAT(created_at, '%d/%m') as date, SUM(total) as total 
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY date
        ORDER BY MIN(created_at) ASC
      `);

      const activities = db.all(`
        SELECT * FROM (
          (SELECT 'order' as type, CONCAT('Novo pedido #', id) as message, created_at FROM orders ORDER BY created_at DESC LIMIT 5)
          UNION ALL
          (SELECT 'email' as type, CONCAT('E-mail enviado: ', subject) as message, created_at FROM email_logs ORDER BY created_at DESC LIMIT 5)
          UNION ALL
          (SELECT 'user' as type, CONCAT('Novo cliente: ', name) as message, created_at FROM users WHERE role = 'customer' ORDER BY created_at DESC LIMIT 5)
        ) as combined_logs
        ORDER BY created_at DESC
        LIMIT 10
      `);

      const responseData = {
        stats: {
          totalSales: currentStats?.totalSales || 0,
          paidOrders: currentStats?.paidOrders || 0,
          activeProducts: activeProducts?.count || 0,
          totalCustomers: totalCustomers?.count || 0,
          trends: {
            sales: calcTrend(currentStats?.totalSales || 0, previousStats?.totalSales || 0),
            orders: calcTrend(currentStats?.paidOrders || 0, previousStats?.paidOrders || 0),
            customers: (totalCustomers?.count - prevCustomers?.count >= 0 ? '+' : '') + (totalCustomers?.count - prevCustomers?.count)
          }
        },
        recentOrders,
        salesChart,
        activities
      };
      apiCache.set('admin_dashboard_stats', responseData, 300); // Cache por 5 minutos
      res.json(responseData);
    } catch (error) {
      console.error('Admin Dashboard Stats Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados reais do dashboard' });
    }
  });

  app.get('/api/admin/reports', authenticate, isAdmin, (req, res) => {
    try {
      const { period } = req.query;
      let interval = 'INTERVAL 30 DAY';
      let dateFormat = '%d/%m';

      if (period === '7d') interval = 'INTERVAL 7 DAY';
      else if (period === '90d') interval = 'INTERVAL 90 DAY';
      else if (period === '12m') {
        interval = 'INTERVAL 1 YEAR';
        dateFormat = '%m/%Y';
      }

      // Receita e Pedidos
      const revenueData = db.get(`
        SELECT 
          SUM(total) as total, 
          AVG(total) as average,
          COUNT(*) as orderCount
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), ${interval})
      `) as any;

      // Gráfico de Vendas
      const salesChart = db.all(`
        SELECT DATE_FORMAT(created_at, '${dateFormat}') as name, SUM(total) as value
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), ${interval})
        GROUP BY name
        ORDER BY MIN(created_at) ASC
      `);

      // Top Matrizes
      const topProducts = db.all(`
        SELECT 
          COALESCE(p.name, oi.product_name, 'Produto Indefinido') as name, 
          COUNT(oi.id) as sales
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND o.created_at >= DATE_SUB(CURDATE(), ${interval})
        GROUP BY name
        ORDER BY sales DESC
        LIMIT 5
      `);

      // Métodos de Pagamento
      const paymentMethods = db.all(`
        SELECT payment_method as name, COUNT(*) as value
        FROM orders
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), ${interval})
        GROUP BY payment_method
      `);

      // Performance por Categoria
      const categoryUsage = db.all(`
        SELECT pc.name, COUNT(oi.id) as count
        FROM order_items oi
        LEFT JOIN products p ON (oi.product_id = p.id OR oi.product_name = p.name)
        JOIN product_categories pc ON p.category_id = pc.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND o.created_at >= DATE_SUB(CURDATE(), ${interval})
        GROUP BY pc.name
        ORDER BY count DESC
        LIMIT 6
      `);

      res.json({
        revenue: {
          total: revenueData?.total || 0,
          average: revenueData?.average || 0
        },
        orders: {
          total: revenueData?.orderCount || 0
        },
        salesChart,
        topProducts,
        paymentMethods,
        categoryUsage
      });
    } catch (error) {
      console.error('Reports Stats Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados dos relatórios' });
    }
  });

  // API Routes - CONTENT
  app.get('/api/settings', (req, res) => {
    try {
      const cached = apiCache.get('public_settings');
      if (cached) return res.json(cached);

      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "new_badge_days", "brand_logos", "facebook_url", "instagram_url", "youtube_url")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);
    } catch (error) {
      console.error('Fetch Public Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃ§Ãµes' });
    }
  });

  app.get('/api/categories', (req, res) => {
    try {
      const cached = apiCache.get('public_categories');
      if (cached) return res.json(cached);

      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");
      apiCache.set('public_categories', categories, 600); // 10 minutes cache
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/matrix-requests', upload.single('reference_image'), async (req, res) => {
    try {
      const { name, email, whatsapp, details = '' } = req.body || {};

      const normalizedName = typeof name === 'string' ? name.trim() : '';
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const normalizedWhatsapp = typeof whatsapp === 'string' ? whatsapp.trim() : '';
      const normalizedDetails = typeof details === 'string' ? details.trim() : '';

      if (!normalizedName || !normalizedEmail || !normalizedWhatsapp) {
        return res.status(400).json({ error: 'name, email e whatsapp sao obrigatorios' });
      }

      const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
      if (!emailIsValid) {
        return res.status(400).json({ error: 'email invalido' });
      }

      const referenceImagePath = req.file?.filename ? `/uploads/${req.file.filename}` : null;

      const insertResult = db.run(`
        INSERT INTO matrix_requests (name, email, whatsapp, details, reference_image, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, normalizedName, normalizedEmail, normalizedWhatsapp, normalizedDetails || null, referenceImagePath);

      const settings = loadSettingsMap(['app_url', 'email_contact', 'matrix_request_team_email']);
      const appUrl = settings.app_url || `${req.protocol}://${req.get('host')}`;
      const referenceImageUrl = referenceImagePath ? `${appUrl}${referenceImagePath}` : '';
      const requestId = Number(insertResult.lastInsertRowid || 0);
      const teamEmail = String(settings.matrix_request_team_email || settings.email_contact || '').trim().toLowerCase();

      if (teamEmail) {
        const teamEmailResult = await sendEmail({
          to: teamEmail,
          templateKey: 'matrix_request_team_received',
          variables: {
            request_id: requestId,
            name: normalizedName,
            email: normalizedEmail,
            whatsapp: normalizedWhatsapp,
            details: normalizedDetails,
            reference_image: referenceImageUrl,
          },
        });
        if (!teamEmailResult.success) {
          console.error('Matrix request team email failed:', teamEmailResult.error);
        }
      }

      const customerEmailResult = await sendEmail({
        to: normalizedEmail,
        templateKey: 'matrix_request_in_analysis',
        variables: {
          request_id: requestId,
          name: normalizedName,
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          details: normalizedDetails,
          reference_image: referenceImageUrl,
        },
      });
      if (!customerEmailResult.success) {
        return res.status(500).json({ error: customerEmailResult.error || 'Falha ao enviar email de confirmacao' });
      }

      return res.status(201).json({
        success: true,
        id: requestId,
        message: 'Solicitacao de matriz enviada com sucesso',
      });
    } catch (error) {
      console.error('Matrix request submit error:', error);
      return res.status(500).json({ error: 'Erro ao enviar solicitacao de matriz' });
    }
  });



  app.get('/api/products', (req, res) => {
    try {
      const { category, q, page = '1', limit = '12' } = req.query;
      const currentPage = Math.max(1, parseInt(page as string));
      const itemsPerPage = Math.max(1, parseInt(limit as string));
      const offset = (currentPage - 1) * itemsPerPage;

      let whereClause = `WHERE p.status = 'active'`;
      const params: any[] = [];

      if (category) {
        whereClause += `
          AND EXISTS (
            SELECT 1
            FROM product_category_relations pcrf
            JOIN product_categories cf ON cf.id = pcrf.category_id
            WHERE pcrf.product_id = p.id
              AND (
                cf.slug = ?
                OR cf.parent_id IN (SELECT id FROM product_categories WHERE slug = ?)
              )
          )
        `;
        params.push(category, category);
      }

      if (q) {
        whereClause += ` AND (p.name LIKE ? OR p.description LIKE ? OR EXISTS (
          SELECT 1 FROM product_tag_relations ptr 
          JOIN product_tags t ON ptr.tag_id = t.id 
          WHERE ptr.product_id = p.id AND t.name LIKE ?
        ))`;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }

      const totalCountRow = db.get(`
        SELECT COUNT(DISTINCT p.id) as total 
        FROM products p 
        ${whereClause}
      `, ...params) as any;
      
      const totalItems = totalCountRow?.total || 0;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      const query = `
        SELECT DISTINCT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN product_categories c ON p.category_id = c.id
        ${whereClause}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
      `;

      const newBadgeDays = resolveNewBadgeDays();
      const products = (db.all(query, ...params, itemsPerPage, offset) as any[]).map((product) => ({
        ...product,
        is_new: (Number(product.is_new) === 1 || isProductWithinNewWindow(product.created_at || product.updated_at, newBadgeDays)) ? 1 : 0,
      }));
      
      res.json({
        products,
        pagination: {
          total: totalItems,
          pages: totalPages,
          currentPage,
          limit: itemsPerPage
        }
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // API Routes - UPLOAD LOGO
  app.post('/api/admin/upload-logo', authenticate, isAdmin, upload.single('logo'), (req, res) => {
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      if (req.file?.filename) {
        return res.json({ url: `/uploads/${req.file.filename}` });
      }

      const image = String(req.body?.image || '').trim();
      if (!image) return res.status(400).json({ error: 'Imagem nao enviada' });

      const base64Match = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!base64Match) {
        return res.status(400).json({ error: 'Formato de imagem invalido. Envie base64 ou arquivo.' });
      }

      const mimeExt = base64Match[1].toLowerCase();
      const ext = mimeExt.includes('svg') ? 'svg' : (mimeExt.includes('jpeg') ? 'jpg' : 'png');
      const base64Data = base64Match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      if (!buffer.length) {
        return res.status(400).json({ error: 'Conteudo da imagem invalido' });
      }

      const fileName = `logo-${Date.now()}.${ext}`;
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);

      return res.json({ url: `/uploads/${fileName}` });
    } catch (error) {
      console.error('Logo Upload Error:', error);
      return res.status(500).json({ error: 'Erro ao fazer upload da logo' });
    }
  });

  app.get('/api/products/:slug', (req, res) => {
    try {
      const productRow = db.get(`
        SELECT p.*, pc.name as category_name, pc.slug as category_slug
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE p.slug = ?
      `, req.params.slug) as any;

      if (!productRow) return res.status(404).json({ error: 'Produto nao encontrado' });
      const newBadgeDays = resolveNewBadgeDays();
      const product = {
        ...productRow,
        is_new: (Number(productRow.is_new) === 1 || isProductWithinNewWindow(productRow.created_at || productRow.updated_at, newBadgeDays)) ? 1 : 0,
      };

      // Related products (same category)
      const relatedProducts = (db.all(`
        SELECT * FROM products 
        WHERE category_id = ? AND id != ? AND status = 'active'
        LIMIT 4
      `, product.category_id, product.id) as any[]).map((relatedProduct) => ({
        ...relatedProduct,
        is_new: (Number(relatedProduct.is_new) === 1 || isProductWithinNewWindow(relatedProduct.created_at || relatedProduct.updated_at, newBadgeDays)) ? 1 : 0,
      }));

      // Gallery images
      const galleryRows = db.all(`
        SELECT url FROM product_images
        WHERE product_id = ?
          AND (
            file_type = 'gallery'
            OR file_type IS NULL
            OR file_type = ''
          )
        ORDER BY id ASC
      `, product.id) as any[];
      const gallery = Array.from(new Set(galleryRows.map(row => row.url).filter(Boolean)));

      res.json({ ...product, gallery, relatedProducts });
    } catch (error) {
      console.error('Error fetching product detail:', error);
      res.status(500).json({ error: 'Erro interno ao buscar produto' });
    }
  });

  // ─── Reviews ────────────────────────────────────────────────────────────────
  app.get('/api/products/:slug/reviews', (req, res) => {
    try {
      const { slug } = req.params;
      const product = db.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

      const reviews = db.all(`
        SELECT r.*, u.name as user_name 
        FROM reviews r 
        LEFT JOIN users u ON r.user_id = u.id 
        WHERE r.product_id = ? AND r.status = 'approved'
        ORDER BY r.created_at DESC
      `, product.id);

      const stats = db.get('SELECT AVG(rating) as avgRating FROM reviews WHERE product_id = ? AND status = "approved"', product.id) as any;

      res.json({ reviews, avgRating: stats?.avgRating || 0 });
    } catch (error) {
      console.error('Fetch reviews error:', error);
      res.status(500).json({ error: 'Erro ao buscar avaliações' });
    }
  });

  app.post('/api/products/:slug/reviews', authenticate, (req, res) => {
    try {
      const { slug } = req.params;
      const { rating, comment } = req.body;
      const user = (req as any).user;

      if (!rating || !comment) {
        return res.status(400).json({ error: 'Nota e comentário são obrigatórios' });
      }

      const product = db.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

      db.run(`
        INSERT INTO reviews (user_id, product_id, rating, comment, status) 
        VALUES (?, ?, ?, ?, 'approved')
      `, user.id, product.id, rating, comment);

      res.json({ success: true });
    } catch (error) {
      console.error('Submit review error:', error);
      res.status(500).json({ error: 'Erro ao enviar avaliação' });
    }
  });



  // ─── PayPal Utilities ────────────────────────────────────────────────────────

  function getPayPalConfig() {
    const s = loadSettingsMap([
      'paypal_enabled', 'paypal_mode',
      'paypal_sandbox_client_id', 'paypal_sandbox_client_secret',
      'paypal_production_client_id', 'paypal_production_client_secret',
      'paypal_default_currency', 'paypal_brl_usd_rate', 'paypal_webhook_id',
    ]);
    const mode = (process.env.PAYPAL_MODE || s.paypal_mode || 'sandbox').toLowerCase() as 'sandbox' | 'production';
    const clientId = mode === 'production'
      ? (process.env.PAYPAL_PRODUCTION_CLIENT_ID || s.paypal_production_client_id || '')
      : (process.env.PAYPAL_SANDBOX_CLIENT_ID || s.paypal_sandbox_client_id || '');
    const clientSecret = mode === 'production'
      ? (process.env.PAYPAL_PRODUCTION_CLIENT_SECRET || s.paypal_production_client_secret || '')
      : (process.env.PAYPAL_SANDBOX_CLIENT_SECRET || s.paypal_sandbox_client_secret || '');
    const currency = process.env.PAYPAL_DEFAULT_CURRENCY || s.paypal_default_currency || 'USD';
    const rate = parseFloat(process.env.PAYPAL_BRL_USD_RATE || s.paypal_brl_usd_rate || '5.20');
    const webhookId = process.env.PAYPAL_WEBHOOK_ID || s.paypal_webhook_id || '';
    const enabled = (s.paypal_enabled === 'true');
    return { mode, clientId, clientSecret, currency, rate, webhookId, enabled };
  }

  function getPayPalBaseUrl(mode: string) {
    return mode === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  async function getPayPalAccessToken(clientId: string, clientSecret: string, baseUrl: string): Promise<string> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const axios = (await import('axios')).default;
    const res = await axios.post(`${baseUrl}/v1/oauth2/token`, 'grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return res.data.access_token as string;
  }

  function convertBrlToUsd(totalBrl: number, rate: number) {
    return Math.round((totalBrl / rate) * 100) / 100;
  }

  // ─── PayPal Endpoints ────────────────────────────────────────────────────────

  // POST /api/paypal/create-order
  app.post('/api/paypal/create-order', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { items } = req.body || {};
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Carrinho vazio' });
      }

      const cfg = getPayPalConfig();
      if (!cfg.enabled) return res.status(400).json({ error: 'PayPal não está habilitado' });
      if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ error: 'Credenciais PayPal não configuradas' });

      // Validate products and calculate total in BRL
      let totalBrl = 0;
      const validatedItems: any[] = [];
      for (const item of items) {
        const product = db.get('SELECT id, name, price, sale_price, status FROM products WHERE id = ?', item.product_id) as any;
        if (!product || product.status !== 'active') {
          return res.status(400).json({ error: `Produto ID ${item.product_id} não encontrado ou inativo` });
        }
        const price = product.sale_price || product.price;
        totalBrl += price;
        validatedItems.push({ product_id: product.id, product_name: product.name, price });
      }

      const totalUsd = convertBrlToUsd(totalBrl, cfg.rate);
      const baseUrl = getPayPalBaseUrl(cfg.mode);
      const appUrl = process.env.APP_URL || loadSettingsMap(['app_url']).app_url || 'https://digitalbordados.com.br';

      // Create internal order
      const orderResult = db.run(`
        INSERT INTO orders (user_id, total, status, payment_method, payment_provider, currency,
          original_total_brl, converted_total_usd, exchange_rate, customer_email, customer_name)
        VALUES (?, ?, 'pending', 'paypal', 'paypal', ?, ?, ?, ?, ?, ?)
      `, user.id, totalBrl, cfg.currency, totalBrl, totalUsd, cfg.rate,
         user.email || '', user.name || '');
      const orderId = Number(orderResult.lastInsertRowid);

      for (const it of validatedItems) {
        db.run('INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, 1)',
          orderId, it.product_id, it.product_name, it.price);
      }

      // Create PayPal order
      const accessToken = await getPayPalAccessToken(cfg.clientId, cfg.clientSecret, baseUrl);
      const axios = (await import('axios')).default;
      const ppRes = await axios.post(`${baseUrl}/v2/checkout/orders`, {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(orderId),
          amount: {
            currency_code: cfg.currency,
            value: totalUsd.toFixed(2),
          },
          description: `Digital Bordados - Pedido #${orderId}`,
        }],
        application_context: {
          brand_name: 'Digital Bordados',
          locale: 'pt-BR',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${appUrl}/checkout/paypal/success`,
          cancel_url: `${appUrl}/checkout/paypal/cancel`,
        },
      }, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });

      const paypalOrderId = ppRes.data.id as string;
      const approvalLink = (ppRes.data.links as any[]).find((l: any) => l.rel === 'approve')?.href || '';

      db.run('UPDATE orders SET paypal_order_id = ?, paypal_status = ? WHERE id = ?', paypalOrderId, 'CREATED', orderId);

      db.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
        'paypal', orderId, paypalOrderId, 'created', 'PayPal order created');

      return res.json({
        success: true,
        order_id: orderId,
        paypal_order_id: paypalOrderId,
        approval_url: approvalLink,
        total_brl: totalBrl,
        total_usd: totalUsd,
        exchange_rate: cfg.rate,
        currency: cfg.currency,
      });
    } catch (error: any) {
      console.error('PayPal create-order error:', error?.response?.data || error?.message || error);
      return res.status(500).json({ error: 'Erro ao criar pedido PayPal' });
    }
  });

  // POST /api/paypal/capture-order
  app.post('/api/paypal/capture-order', authenticate, async (req, res) => {
    try {
      const { paypal_order_id } = req.body || {};
      if (!paypal_order_id) return res.status(400).json({ error: 'paypal_order_id é obrigatório' });

      const order = db.get('SELECT * FROM orders WHERE paypal_order_id = ?', paypal_order_id) as any;
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

      const cfg = getPayPalConfig();
      const baseUrl = getPayPalBaseUrl(cfg.mode);
      const accessToken = await getPayPalAccessToken(cfg.clientId, cfg.clientSecret, baseUrl);
      const axios = (await import('axios')).default;

      const captureRes = await axios.post(
        `${baseUrl}/v2/checkout/orders/${paypal_order_id}/capture`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );

      const captureData = captureRes.data;
      const captureStatus = captureData?.status as string;
      const capture = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture?.id || '';
      const payerEmail = captureData?.payer?.email_address || '';

      if (captureStatus === 'COMPLETED') {
        db.run(`UPDATE orders SET status = 'paid', paypal_status = 'COMPLETED', paypal_capture_id = ?,
          paypal_payer_email = ?, paid_at = NOW() WHERE id = ?`, captureId, payerEmail, order.id);
        db.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
          'paypal', order.id, captureId, 'completed', 'Pagamento capturado com sucesso');
        return res.json({ success: true, status: 'paid', order_id: order.id, capture_id: captureId });
      } else {
        db.run("UPDATE orders SET paypal_status = ? WHERE id = ?", captureStatus, order.id);
        db.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
          'paypal', order.id, captureId || paypal_order_id, captureStatus, `Captura com status: ${captureStatus}`);
        return res.status(400).json({ success: false, status: captureStatus, error: 'Pagamento não foi completado' });
      }
    } catch (error: any) {
      console.error('PayPal capture-order error:', error?.response?.data || error?.message || error);
      return res.status(500).json({ error: 'Erro ao capturar pagamento PayPal' });
    }
  });

  // POST /api/webhooks/paypal (público)
  app.post('/api/webhooks/paypal', async (req, res) => {
    try {
      const payload = req.body || {};
      const eventId = payload?.id || '';
      const eventType = payload?.event_type || '';
      const resourceId = payload?.resource?.id || '';

      db.run(`INSERT INTO paypal_webhook_logs (event_id, event_type, resource_id, payload_json, verification_status)
        VALUES (?, ?, ?, ?, 'unverified')`, eventId, eventType, resourceId, JSON.stringify(payload));

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const captureId = resourceId;
        const order = db.get('SELECT * FROM orders WHERE paypal_capture_id = ? OR paypal_order_id = ?',
          captureId, payload?.resource?.supplementary_data?.related_ids?.order_id || '') as any;
        if (order && order.status !== 'paid') {
          db.run("UPDATE orders SET status = 'paid', paypal_status = 'COMPLETED', paid_at = NOW() WHERE id = ?", order.id);
          db.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
            'paypal', order.id, captureId, 'webhook_completed', 'Pago via webhook PAYMENT.CAPTURE.COMPLETED');
        }
      } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
        const captureId = resourceId;
        const order = db.get('SELECT * FROM orders WHERE paypal_capture_id = ?', captureId) as any;
        if (order) {
          db.run("UPDATE orders SET status = 'failed', paypal_status = 'DENIED' WHERE id = ?", order.id);
          db.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
            'paypal', order.id, captureId, 'denied', 'Captura negada via webhook PAYMENT.CAPTURE.DENIED');
        }
      }
      // CHECKOUT.ORDER.APPROVED: só registra log, não libera download sem captura
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      return res.status(200).json({ received: true }); // Always 200 to PayPal
    }
  });

  // GET /api/admin/paypal/test
  app.get('/api/admin/paypal/test', authenticate, isAdmin, async (req, res) => {
    try {
      const cfg = getPayPalConfig();
      if (!cfg.clientId || !cfg.clientSecret) {
        return res.status(400).json({ ok: false, error: 'Credenciais PayPal não configuradas no painel' });
      }
      const baseUrl = getPayPalBaseUrl(cfg.mode);
      const token = await getPayPalAccessToken(cfg.clientId, cfg.clientSecret, baseUrl);
      if (token) {
        return res.json({ ok: true, mode: cfg.mode, message: `Conexão PayPal (${cfg.mode}) estabelecida com sucesso!` });
      }
      return res.status(400).json({ ok: false, error: 'Não foi possível obter access token' });
    } catch (error: any) {
      console.error('PayPal test error:', error?.response?.data || error?.message);
      return res.status(400).json({ ok: false, error: error?.response?.data?.error_description || error?.message || 'Falha na conexão PayPal' });
    }
  });

  // GET /api/admin/paypal/webhook-logs
  app.get('/api/admin/paypal/webhook-logs', authenticate, isAdmin, (req, res) => {
    try {
      const logs = db.all('SELECT id, event_id, event_type, resource_id, verification_status, created_at FROM paypal_webhook_logs ORDER BY created_at DESC LIMIT 100');
      return res.json(logs);
    } catch (error) {
      console.error('PayPal webhook-logs error:', error);
      return res.status(500).json({ error: 'Erro ao buscar logs PayPal' });
    }
  });

  // GET /api/checkout/paypal/config (público - retorna apenas client_id e modo)
  app.get('/api/checkout/paypal/config', (req, res) => {
    try {
      const cfg = getPayPalConfig();
      return res.json({
        enabled: cfg.enabled,
        mode: cfg.mode,
        client_id: cfg.clientId,
        currency: cfg.currency,
        brl_usd_rate: cfg.rate,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar config PayPal' });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    console.log('Vite middleware integrated.');
    app.use(vite.middlewares);
  } else {
    console.log('Serving production build.');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Cron Job: Pending PIX Reminder (Runs every 30 minutes)
  setInterval(() => {
    try {
      console.log('[Cron] Checking for pending PIX payments...');
      
      const pendingOrders = db.all(`
        SELECT * FROM orders 
        WHERE status = 'pending' 
        AND payment_method = 'pix'
        AND created_at <= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `) as any[];

      const notifiedLogs = db.all(`SELECT subject FROM email_logs WHERE template_key = 'payment_pending_pix'`) as any[];
      const notifiedOrderIds = notifiedLogs.map(log => {
        const match = log.subject.match(/#(\d+)/);
        return match ? Number(match[1]) : null;
      }).filter(Boolean);

      const _settings = (db.all('SELECT * FROM settings LIMIT 1') as any[])[0] || null;
      const appUrl = process.env.APP_URL || _settings?.app_url || `https://digitalbordados.com.br`;

      pendingOrders.forEach(order => {
        if (!notifiedOrderIds.includes(order.id)) {
          console.log(`[Cron] Sending PIX reminder for order #${order.id}`);
          
          sendEmail({
            to: order.customer_email,
            templateKey: 'payment_pending_pix',
            variables: {
              name: order.customer_name || 'Cliente',
              order_id: order.id,
              order_total: `R$ ${order.total.toFixed(2)}`,
              pix_code: 'O código PIX foi enviado no momento do checkout. Acesse sua conta para ver os detalhes.',
              expires_at: '24 horas após a compra',
            }
          }).catch(err => console.error(`[Cron] Failed to send reminder for order #${order.id}:`, err));
        }
      });
    } catch (error) {
      console.error('[Cron] Error checking pending PIX:', error);
    }
  }, 30 * 60 * 1000);

  if (!process.env.VERCEL) {
    console.log(`Starting express server on port ${PORT}...`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server successfully started and listening on http://0.0.0.0:${PORT}`);
    });
  }
  

  // ===== Static Files Servicing (Production) =====
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    console.log('Serving static files from:', distPath);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({error: 'Not found'});
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  // ===============================================

  return app;
}

const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};



