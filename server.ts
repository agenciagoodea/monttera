process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import { createServer as createViteServer } from 'vite';
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
    matrix_request_team_email: ''
  };

  Object.entries(defaultSettings).forEach(([key, value]) => {
    db.run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\'))', key, value);
  });
}

function initTestData() {
  initSettings();
  const hashedPassword = hashPassword('123456');
  const adrianoPassword = hashPassword('04039866');

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
    initTestData();

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
  app.post('/api/auth/register', (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos sÃ£o obrigatÃ³rios' });
    }

    try {
      const name = `${firstName} ${lastName}`;
      const hashedPassword = hashPassword(password);
      
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
      const appUrl = settings.app_url || 'http://localhost:3000';
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

  app.post('/api/auth/login', (req, res) => {
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
        passwordIsValid = comparePassword(normalizedPassword, user.password);
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
    
    res.json({ user: decoded });
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
      const appUrl = settings.app_url || 'http://localhost:3000';
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

      const hashedPassword = hashPassword(new_password);
      db.run('UPDATE users SET password = ? WHERE id = ?', hashedPassword, resetRequest.user_id);
      db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', resetRequest.id);

      const user = db.get('SELECT * FROM users WHERE id = ?', resetRequest.user_id) as any;
      if (user) {
        const settings = loadSettingsMap(['app_url']);
        const appUrl = settings.app_url || 'http://localhost:3000';
        
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
    const products = db.all(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN product_categories c ON p.category_id = c.id 
      ORDER BY p.created_at DESC
    `);
    res.json(products);
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
    const tags = db.all('SELECT * FROM product_tags ORDER BY name ASC');
    res.json(tags);
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
          const requestedInstallments = payment_method === 'debit_card'
            ? 1
            : Math.max(1, Number(installments || 1));

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
  app.get('/api/customer/orders', authenticate, (req, res) => {
    const user = (req as any).user;
    const orders = db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', user.id);
    res.json(orders);
  });

  app.get('/api/customer/downloads', authenticate, (req, res) => {
    const user = (req as any).user;
    // Seleciona produtos de pedidos pagos
    const downloads = db.all(`
      SELECT p.*, f.file_path, f.file_name, o.id as order_id
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      JOIN product_files f ON p.id = f.product_id
      WHERE o.user_id = ? AND o.status = 'paid'
    `, user.id);
    res.json(downloads);
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
      res.status(500).json({ error: 'Erro ao excluir tag' });
    }
  });
  
  // API Routes - ADMIN ORDERS
  app.get('/api/admin/orders', authenticate, isAdmin, (req, res) => {
    try {
      const orders = db.all(`
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);
      res.json(orders);
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

  app.get('/api/admin/reports', authenticate, isAdmin, (req, res) => {
    const period = req.query.period as string || '30d';
    let days = 30;
    if (period === '7d') days = 7;
    else if (period === '90d') days = 90;
    else if (period === '12m') days = 365;

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateLimitStr = dateLimit.toISOString();

    try {
      // 1. Revenue & Orders Summary
      const summary = db.get(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(total) as total_revenue,
          AVG(total) as avg_ticket
        FROM orders
        WHERE status = 'paid' AND created_at >= ?
      `, dateLimitStr) as any;

      // 2. Sales Chart (Daily)
      // For simplicity, we'll return daily data for the selected period
      const salesHistory = db.all(`
        SELECT 
          date(created_at) as date,
          SUM(total) as value
        FROM orders 
        WHERE status = 'paid' AND created_at >= ?
        GROUP BY date(created_at)
        ORDER BY date ASC
      `, dateLimitStr);

      // 3. Top Products
      const topProducts = db.all(`
        SELECT p.name, SUM(oi.quantity) as sales
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'paid' AND o.created_at >= ?
        GROUP BY p.id
        ORDER BY sales DESC
        LIMIT 5
      `, dateLimitStr);

      // 4. Payment Methods
      const paymentMethods = db.all(`
        SELECT payment_method as name, COUNT(*) as value
        FROM orders
        WHERE status = 'paid' AND created_at >= ?
        GROUP BY payment_method
      `, dateLimitStr);

      // 5. Category Performance
      const categoryUsage = db.all(`
        SELECT c.name, COUNT(*) as count
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN product_category_relations pc ON p.id = pc.product_id
        JOIN product_categories c ON pc.category_id = c.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'paid' AND o.created_at >= ?
        GROUP BY c.id
        ORDER BY count DESC
        LIMIT 5
      `, dateLimitStr);

      res.json({
        revenue: {
          total: summary.total_revenue || 0,
          average: summary.avg_ticket || 0
        },
        orders: {
          total: summary.total_orders || 0
        },
        salesChart: salesHistory.map((s: any) => ({
          name: new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          value: s.value
        })),
        topProducts,
        paymentMethods: paymentMethods.map((pm: any) => ({
          name: pm.name || 'Outro',
          value: pm.value
        })),
        categoryUsage
      });
    } catch (error) {
      console.error('Admin Reports Error:', error);
      res.status(500).json({ error: 'Erro ao gerar relatÃ³rios' });
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

  app.post('/api/admin/users', authenticate, isAdmin, (req, res) => {
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

    const hashedPassword = hashPassword(String(password));

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

  const adminUpdateUserHandler = (req: express.Request, res: express.Response) => {
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
      const trans = db.transaction(() => {
        if (normalizedPassword) {
          const hashedPassword = hashPassword(normalizedPassword);
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
        login_url: 'http://localhost:3000/login',
        reset_url: 'http://localhost:3000/redefinir-senha?token=test',
        order_id: '9999',
        order_total: 'R$ 150,00',
        order_status: 'Pendente',
        items: '<li>1x Produto Teste - R$ 150,00</li>',
        payment_method: 'PIX',
        account_url: 'http://localhost:3000/conta',
        downloads_url: 'http://localhost:3000/conta',
        retry_url: 'http://localhost:3000/checkout',
        pix_code: '00020126580014br.gov.bcb.pix...',
        expires_at: new Date(Date.now() + 3600000).toLocaleString('pt-BR'),
        temp_password: 'SenhaTemporaria123',
        change_password_url: 'http://localhost:3000/conta',
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
    try {
      const totalSales = db.get("SELECT SUM(total) as total FROM orders WHERE status IN ('paid', 'completed', 'success', 'pago')") as any;
      const paidOrders = db.get("SELECT COUNT(*) as count FROM orders WHERE status IN ('paid', 'completed', 'success', 'pago')") as any;
      const activeProducts = db.get("SELECT COUNT(*) as count FROM products WHERE status = 'active'") as any;
      const totalCustomers = db.get("SELECT COUNT(*) as count FROM users WHERE role = 'customer'") as any;

      const recentOrders = db.all(`
        SELECT o.*, COALESCE(o.customer_name, u.name) as display_name, u.email as customer_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC 
        LIMIT 6
      `);

      const salesChart = db.all(`
        SELECT DATE(created_at) as date, SUM(total) as total 
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // Atividade recente combinando logs
      const activities = db.all(`
        (SELECT 'order' as type, CONCAT('Novo pedido #', id) as message, created_at FROM orders ORDER BY created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'email' as type, CONCAT('E-mail enviado para ', to_email) as message, created_at FROM email_logs WHERE status = 'sent' ORDER BY created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'user' as type, CONCAT('Novo cliente: ', name) as message, created_at FROM users WHERE role = 'customer' ORDER BY created_at DESC LIMIT 5)
        ORDER BY created_at DESC
        LIMIT 8
      `);

      res.json({
        stats: {
          totalSales: totalSales?.total || 0,
          paidOrders: paidOrders?.count || 0,
          activeProducts: activeProducts?.count || 0,
          totalCustomers: totalCustomers?.count || 0,
        },
        recentOrders,
        salesChart,
        activities
      });
    } catch (error) {
      console.error('Dashboard Stats Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
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
      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "new_badge_days")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json(settings);
    } catch (error) {
      console.error('Fetch Public Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃ§Ãµes' });
    }
  });

  app.get('/api/categories', (req, res) => {
    try {
      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");
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


  // Vite Integration
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    console.log('Vite middleware integrated.');
    app.use(vite.middlewares);
  } else {
    console.log('Serving production build...');
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

      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

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
  
  return app;
}

const appPromise = startServer();
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};



