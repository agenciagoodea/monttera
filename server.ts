if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
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
import { pipeline } from 'stream/promises';
import { sendEmail } from './src/server/mailer';
import nodemailer from 'nodemailer';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import axios from 'axios';

const isProduction = process.env.NODE_ENV === 'production';
const EMAIL_VERIFICATION_TOKEN_TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || '24');
const LOGIN_ATTEMPT_WINDOW_MINUTES = Number(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES || '15');
const LOGIN_ATTEMPT_MAX_FAILS = Number(process.env.LOGIN_ATTEMPT_MAX_FAILS || '7');

function getAuthCookieOptions(req: express.Request): express.CookieOptions {
  const secure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

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
    throw new Error('MERCADOPAGO_ACCESS_TOKEN nÃƒÂ£o configurado em settings');
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
        message: error?.message || 'Erro de comunicaÃƒÂ§ÃƒÂ£o com Mercado Pago',
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

// ConfiguraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do Multer para Uploads
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
  return 10;
}

function isProductWithinNewWindow(createdAt: any, days: number) {
  if (!createdAt || days <= 0) return false;
  const raw = String(createdAt).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const normalizedDateString = typeof createdAt === 'string'
    ? (hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`)
    : createdAt;
  const createdDate = new Date(normalizedDateString as any);
  if (Number.isNaN(createdDate.getTime())) return false;

  const ageMs = Date.now() - createdDate.getTime();
  if (ageMs < 0) return true;

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < days;
}

function resolveProductIsNew(product: any, newBadgeDays: number) {
  const manualOverride = Number(product?.is_new) === 1;
  const autoByCreatedAt = isProductWithinNewWindow(product?.created_at, newBadgeDays);
  return (manualOverride || autoByCreatedAt) ? 1 : 0;
}

function extractMercadoPagoSignature(signatureHeader: string) {
  const parts = String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      values[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  });
  return {
    ts: values.ts || '',
    v1: values.v1 || '',
  };
}

function verifyMercadoPagoWebhookSignature(req: express.Request, payload: any) {
  const settings = loadSettingsMap(['mp_webhook_secret']);
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || settings.mp_webhook_secret || '').trim();
  if (!secret) {
    return { ok: true, reason: 'secret_not_configured' };
  }

  const signatureHeader = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const dataId = String(payload?.data?.id || payload?.id || '');
  if (!signatureHeader || !requestId || !dataId) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  const { ts, v1 } = extractMercadoPagoSignature(signatureHeader);
  if (!ts || !v1) {
    return { ok: false, reason: 'invalid_signature_format' };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (expected !== v1) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, reason: 'verified' };
}

function isWebhookAlreadyProcessed(provider: string, eventId: string) {
  if (!eventId) return false;
  const row = db.get('SELECT id FROM processed_webhooks WHERE provider = ? AND event_id = ? LIMIT 1', provider, eventId) as any;
  return Boolean(row?.id);
}

function markWebhookProcessed(provider: string, eventId: string, resourceId?: string | null) {
  if (!eventId) return;
  db.run(
    `INSERT IGNORE INTO processed_webhooks (provider, event_id, resource_id)
     VALUES (?, ?, ?)`,
    provider,
    eventId,
    resourceId || null,
  );
}

async function verifyPayPalWebhookSignature(req: express.Request, payload: any) {
  const s = loadSettingsMap([
    'paypal_mode',
    'paypal_sandbox_client_id',
    'paypal_sandbox_client_secret',
    'paypal_production_client_id',
    'paypal_production_client_secret',
    'paypal_webhook_id',
  ]);
  const mode = (process.env.PAYPAL_MODE || s.paypal_mode || 'sandbox').toLowerCase();
  const clientId = mode === 'production'
    ? (process.env.PAYPAL_PRODUCTION_CLIENT_ID || s.paypal_production_client_id || '')
    : (process.env.PAYPAL_SANDBOX_CLIENT_ID || s.paypal_sandbox_client_id || '');
  const clientSecret = mode === 'production'
    ? (process.env.PAYPAL_PRODUCTION_CLIENT_SECRET || s.paypal_production_client_secret || '')
    : (process.env.PAYPAL_SANDBOX_CLIENT_SECRET || s.paypal_sandbox_client_secret || '');
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || s.paypal_webhook_id || '';

  if (!webhookId) {
    return { ok: true, reason: 'webhook_id_not_configured' };
  }
  if (!clientId || !clientSecret) {
    return { ok: false, reason: 'paypal_credentials_not_configured' };
  }

  const transmissionId = String(req.headers['paypal-transmission-id'] || '');
  const transmissionTime = String(req.headers['paypal-transmission-time'] || '');
  const certUrl = String(req.headers['paypal-cert-url'] || '');
  const authAlgo = String(req.headers['paypal-auth-algo'] || '');
  const transmissionSig = String(req.headers['paypal-transmission-sig'] || '');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return { ok: false, reason: 'missing_paypal_headers' };
  }

  try {
    const baseUrl = mode === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await axios.post(
      `${baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const accessToken = String(tokenResponse?.data?.access_token || '');
    if (!accessToken) {
      return { ok: false, reason: 'paypal_access_token_unavailable' };
    }

    const verifyPayload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: payload,
    };
    const verification = await axios.post(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      verifyPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const status = String(verification?.data?.verification_status || '').toUpperCase();
    return { ok: status === 'SUCCESS', reason: status || 'unknown' };
  } catch (error: any) {
    return { ok: false, reason: error?.message || 'verification_error' };
  }
}

function resolveEmailVerificationRequired() {
  const settings = loadSettingsMap(['email_verification_required']);
  const raw = String(settings.email_verification_required || 'true').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

const DOWNLOAD_ALLOWED_STATUSES = [
  'paid',
  'completed',
  'success',
  'pago',
  'wc-completed',
  'wc-processing',
  'processing',
] as const;

function getDownloadStatusPlaceholders() {
  return DOWNLOAD_ALLOWED_STATUSES.map(() => '?').join(', ');
}

function canUserAccessDownloads(userId: number, userEmail: string, emailVerifiedAt: unknown) {
  if (!resolveEmailVerificationRequired()) return true;
  if (emailVerifiedAt) return true;

  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  const statusPlaceholders = getDownloadStatusPlaceholders();
  const hasPaidOrder = db.get(
    `SELECT COUNT(1) AS total
     FROM orders o
     WHERE (
       o.user_id = ?
       OR LOWER(TRIM(COALESCE(o.customer_email, ''))) = LOWER(TRIM(?))
     )
       AND LOWER(COALESCE(o.status, '')) IN (${statusPlaceholders})`,
    userId,
    normalizedEmail || '___nomail___',
    ...DOWNLOAD_ALLOWED_STATUSES,
  ) as any;

  return Number(hasPaidOrder?.total || 0) > 0;
}

function escapeCsvValue(value: unknown) {
  const raw = String(value ?? '');
  if (/[",;\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildUsersBaseQuery({
  searchTerm,
  roleFilter,
}: {
  searchTerm: string;
  roleFilter: string;
}) {
  const where: string[] = [];
  const params: any[] = [];

  if (searchTerm) {
    where.push('(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)');
    const like = `%${searchTerm}%`;
    params.push(like, like);
  }

  if (roleFilter === 'admin') {
    where.push("u.role = 'admin'");
  } else if (roleFilter === 'customer') {
    where.push("u.role IN ('customer', 'user')");
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, params };
}

function getOrderNotificationEmail() {
  const settings = loadSettingsMap(['order_notifications_email', 'email_contact']);
  return String(settings.order_notifications_email || settings.email_contact || '').trim().toLowerCase();
}

function decodePathComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toNormalizedSlashes(value: string) {
  return String(value || '').replace(/\\/g, '/');
}

function extractWooUploadsRelativePath(rawInput: string): string | null {
  let candidate = String(rawInput || '').trim();
  if (!candidate) return null;

  candidate = decodePathComponentSafe(candidate);

  if (/^https?:\/\//i.test(candidate)) {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname || '';
    } catch {
      return null;
    }
  }

  candidate = toNormalizedSlashes(candidate);
  candidate = candidate.split('?')[0]?.split('#')[0] || '';

  const marker = '/woocommerce_uploads/';
  const lower = candidate.toLowerCase();
  const markerIdx = lower.indexOf(marker);

  if (markerIdx >= 0) {
    candidate = candidate.slice(markerIdx + marker.length);
  } else {
    const prefixes = [
      'woocommerce_uploads/',
      '/woocommerce_uploads/',
      'wp-content/uploads/woocommerce_uploads/',
      '/wp-content/uploads/woocommerce_uploads/',
      'uploads/woocommerce_uploads/',
      '/uploads/woocommerce_uploads/',
    ];
    const matched = prefixes.find((prefix) => lower.startsWith(prefix.toLowerCase()));
    if (matched) {
      candidate = candidate.slice(matched.length);
    }
  }

  const normalized = path.posix.normalize(candidate).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) {
    return null;
  }

  return normalized;
}

function getDownloadRoots(): string[] {
  const configured = [
    process.env.WOO_UPLOADS_DIR,
    process.env.WOOCOMMERCE_UPLOADS_DIR,
    process.env.DOWNLOADS_BASE_DIR,
    process.env.PROTECTED_DOWNLOADS_DIR,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));

  const defaults = [
    path.resolve(process.cwd(), 'wp-content', 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), '..', 'wp-content', 'uploads', 'woocommerce_uploads'),
    path.resolve(process.cwd(), '..', 'uploads', 'woocommerce_uploads'),
    // DiretÃ³rio de uploads local (arquivos enviados pelo admin)
    path.resolve(process.cwd(), 'uploads'),
    // Raiz do projeto (para paths como /uploads/arquivo.zip)
    path.resolve(process.cwd()),
  ];

  return Array.from(new Set([...configured, ...defaults]));
}

function isInsideRoot(absPath: string, absRoot: string) {
  const rel = path.relative(absRoot, absPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveDownloadAbsolutePath(rawInput: string): { absolutePath: string; relativePath: string } | null {
  const roots = getDownloadRoots();

  // Tentativa 1: Extrai path relativo no formato WooCommerce
  const wooRelativePath = extractWooUploadsRelativePath(rawInput);
  if (wooRelativePath) {
    for (const root of roots) {
      const absolutePath = path.resolve(root, wooRelativePath);
      if (!isInsideRoot(absolutePath, root)) continue;
      if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
        return { absolutePath, relativePath: wooRelativePath };
      }
    }
  }

  // Tentativa 2: Resolve path direto (para uploads locais como /uploads/arquivo.zip)
  let directPath = decodePathComponentSafe(String(rawInput || '').trim());
  // Remove URL completa, mantendo apenas o pathname
  if (/^https?:\/\//i.test(directPath)) {
    try {
      const parsed = new URL(directPath);
      directPath = parsed.pathname || '';
    } catch { /* ignora */ }
  }
  // Remove barra inicial para montar path relativo
  const cleanRelative = directPath.replace(/^\/+/, '');
  if (cleanRelative && !cleanRelative.startsWith('..') && !cleanRelative.includes('/../')) {
    for (const root of roots) {
      const absolutePath = path.resolve(root, cleanRelative);
      if (!isInsideRoot(absolutePath, root)) continue;
      if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
        return { absolutePath, relativePath: cleanRelative };
      }
    }
  }

  return null;
}

function getRequestIpAddress(req: express.Request) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.socket.remoteAddress || '';
}

function logDownloadAttempt(payload: {
  userId?: number | null;
  orderId?: number | null;
  orderItemId?: number | null;
  productId?: number | null;
  fileName?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  sha256?: string | null;
  status: 'success' | 'denied' | 'error';
  error?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    db.run(
      `INSERT INTO download_logs
       (user_id, order_id, order_item_id, product_id, file_name, file_path, file_size, sha256, status, error, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.userId ?? null,
      payload.orderId ?? null,
      payload.orderItemId ?? null,
      payload.productId ?? null,
      payload.fileName ?? null,
      payload.filePath ?? null,
      payload.fileSize ?? null,
      payload.sha256 ?? null,
      payload.status,
      payload.error ?? null,
      payload.ip ?? null,
      payload.userAgent ?? null,
    );
  } catch (error) {
    console.error('Falha ao registrar log de download:', error);
  }
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function buildBaseAppUrl(req: express.Request) {
  const settings = loadSettingsMap(['app_url']);
  return process.env.APP_URL || settings.app_url || `${req.protocol}://${req.get('host')}`;
}

function normalizePublicMediaUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) return raw;

  const domain = String(process.env.APP_DOMAIN || 'digitalbordados.com.br').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const base = `https://${domain}`;
  const noLeadingSlash = raw.replace(/^\/+/, '');

  if (raw.startsWith('/wp-content/uploads/')) return `${base}${raw}`;
  if (raw.startsWith('wp-content/uploads/')) return `${base}/${noLeadingSlash}`;

  return raw;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createEmailVerificationToken(userId: number, email: string) {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = sha256(rawToken);
  db.run('UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND used = 0', userId);
  db.run(
    `INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at, used)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), 0)`,
    userId,
    email,
    tokenHash,
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
  );
  return rawToken;
}

async function sendVerificationEmail(user: { id: number; name: string; email: string }, req: express.Request) {
  const rawToken = createEmailVerificationToken(Number(user.id), String(user.email).trim().toLowerCase());
  const appUrl = buildBaseAppUrl(req);
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendEmail({
    to: user.email,
    templateKey: 'email_verification',
    variables: {
      name: user.name || 'Cliente',
      email: user.email,
      verify_url: verifyUrl,
      expires_in: String(EMAIL_VERIFICATION_TOKEN_TTL_HOURS),
    },
  });
}

function getClientIp(req: express.Request) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const remote = req.socket?.remoteAddress || '';
  return (xff || remote || 'unknown').slice(0, 64);
}

function getLoginAttemptStats(email: string, ip: string) {
  const row = db.get(
    `SELECT
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
      MAX(attempted_at) AS last_attempt_at
     FROM login_attempts
     WHERE attempted_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND (email = ? OR ip = ?)`,
    LOGIN_ATTEMPT_WINDOW_MINUTES,
    email,
    ip,
  ) as any;

  return {
    failCount: Number(row?.fail_count || 0),
    lastAttemptAt: row?.last_attempt_at || null,
  };
}

function recordLoginAttempt(email: string, ip: string, success: boolean) {
  db.run(
    'INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)',
    email || null,
    ip || null,
    success ? 1 : 0,
  );
}

function getUserById(userId: number) {
  return db.get(
    'SELECT id, name, email, role, status, email_verified_at, privacy_reaccept_required FROM users WHERE id = ? LIMIT 1',
    userId,
  ) as any;
}

function parseBooleanSetting(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

function resolveLgpdSettings() {
  const keys = [
    'lgpd_enabled',
    'lgpd_require_consent_register',
    'lgpd_require_checkout_consent',
    'lgpd_require_marketing_optin',
    'lgpd_require_cookie_consent',
    'lgpd_require_policy_acceptance',
    'lgpd_require_terms_acceptance',
    'lgpd_require_reaccept_on_policy_update',
    'lgpd_dpo_name',
    'lgpd_dpo_email',
    'lgpd_dpo_phone',
    'lgpd_privacy_url',
    'lgpd_terms_url',
    'lgpd_cookie_policy_url',
    'lgpd_policy_version_privacy',
    'lgpd_policy_version_terms',
    'lgpd_policy_version_cookies',
  ];
  const s = loadSettingsMap(keys);
  return {
    enabled: parseBooleanSetting(s.lgpd_enabled, true),
    requireConsentRegister: parseBooleanSetting(s.lgpd_require_consent_register, true),
    requireCheckoutConsent: parseBooleanSetting(s.lgpd_require_checkout_consent, true),
    requireMarketingOptin: parseBooleanSetting(s.lgpd_require_marketing_optin, false),
    requireCookieConsent: parseBooleanSetting(s.lgpd_require_cookie_consent, true),
    requirePolicyAcceptance: parseBooleanSetting(s.lgpd_require_policy_acceptance, true),
    requireTermsAcceptance: parseBooleanSetting(s.lgpd_require_terms_acceptance, true),
    requireReacceptOnPolicyUpdate: parseBooleanSetting(s.lgpd_require_reaccept_on_policy_update, true),
    dpoName: String(s.lgpd_dpo_name || ''),
    dpoEmail: String(s.lgpd_dpo_email || ''),
    dpoPhone: String(s.lgpd_dpo_phone || ''),
    privacyUrl: String(s.lgpd_privacy_url || '/politica'),
    termsUrl: String(s.lgpd_terms_url || '/politica'),
    cookiePolicyUrl: String(s.lgpd_cookie_policy_url || '/politica'),
    policyVersionPrivacy: String(s.lgpd_policy_version_privacy || '1.0'),
    policyVersionTerms: String(s.lgpd_policy_version_terms || '1.0'),
    policyVersionCookies: String(s.lgpd_policy_version_cookies || '1.0'),
  };
}

function getActivePolicyVersion(policyType: 'privacy' | 'terms' | 'cookies') {
  const row = db.get(
    `SELECT version
     FROM lgpd_policies
     WHERE policy_type = ?
       AND is_active = 1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    policyType,
  ) as any;
  const version = String(row?.version || '').trim();
  return version || null;
}

function resolveRequiredPolicyVersions(lgpd = resolveLgpdSettings()) {
  return {
    privacy: getActivePolicyVersion('privacy') || lgpd.policyVersionPrivacy,
    terms: getActivePolicyVersion('terms') || lgpd.policyVersionTerms,
    cookies: getActivePolicyVersion('cookies') || lgpd.policyVersionCookies,
  };
}

function logLgpdEvent(params: {
  req?: express.Request;
  userId?: number | null;
  actorUserId?: number | null;
  eventType: string;
  action: string;
  details?: Record<string, any> | null;
}) {
  try {
    db.run(
      `INSERT INTO lgpd_logs (user_id, actor_user_id, event_type, action, details_json, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params.userId || null,
      params.actorUserId || null,
      params.eventType,
      params.action,
      params.details ? JSON.stringify(params.details) : null,
      params.req ? getClientIp(params.req) : null,
      params.req ? String(params.req.headers['user-agent'] || '').slice(0, 500) : null,
    );
  } catch (error) {
    console.error('LGPD log error:', error);
  }
}

function upsertUserConsent(params: {
  userId: number;
  consentKey: string;
  granted: boolean;
  req?: express.Request;
  source?: string;
  legalBasis?: string;
  purpose?: string;
  policyVersion?: string | null;
}) {
  const ip = params.req ? getClientIp(params.req) : null;
  const userAgent = params.req ? String(params.req.headers['user-agent'] || '').slice(0, 500) : null;
  db.run(
    `INSERT INTO lgpd_consents (
      user_id, consent_key, granted, legal_basis, purpose, source, policy_version, ip, user_agent, revoked_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      granted = VALUES(granted),
      legal_basis = VALUES(legal_basis),
      purpose = VALUES(purpose),
      source = VALUES(source),
      policy_version = VALUES(policy_version),
      ip = VALUES(ip),
      user_agent = VALUES(user_agent),
      revoked_at = VALUES(revoked_at),
      updated_at = CURRENT_TIMESTAMP`,
    params.userId,
    params.consentKey,
    params.granted ? 1 : 0,
    params.legalBasis || null,
    params.purpose || null,
    params.source || 'web',
    params.policyVersion || null,
    ip,
    userAgent,
    params.granted ? null : new Date().toISOString().slice(0, 19).replace('T', ' '),
  );

  logLgpdEvent({
    req: params.req,
    userId: params.userId,
    actorUserId: params.userId,
    eventType: 'consent',
    action: params.granted ? 'consent_granted' : 'consent_revoked',
    details: { consent_key: params.consentKey, policy_version: params.policyVersion || null },
  });
}

function recordPolicyAcceptance(params: {
  userId: number;
  policyType: 'privacy' | 'terms' | 'cookies';
  policyVersion: string;
  req?: express.Request;
  source?: string;
}) {
  db.run(
    `INSERT INTO lgpd_user_acceptances (user_id, policy_type, policy_version, ip, user_agent, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    params.userId,
    params.policyType,
    params.policyVersion,
    params.req ? getClientIp(params.req) : null,
    params.req ? String(params.req.headers['user-agent'] || '').slice(0, 500) : null,
    params.source || 'web',
  );
  db.run('UPDATE users SET privacy_reaccept_required = 0 WHERE id = ?', params.userId);
  logLgpdEvent({
    req: params.req,
    userId: params.userId,
    actorUserId: params.userId,
    eventType: 'policy',
    action: 'policy_accepted',
    details: { policy_type: params.policyType, policy_version: params.policyVersion },
  });
}

function normalizePolicyVersion(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^v+/, '');
}

function userHasAcceptedPolicyVersion(userId: number, policyType: 'privacy' | 'terms' | 'cookies', policyVersion: string) {
  const normalizedTarget = normalizePolicyVersion(policyVersion);
  if (!normalizedTarget) return false;

  const candidateVersions = Array.from(new Set([
    String(policyVersion || '').trim().toLowerCase(),
    normalizedTarget,
    `v${normalizedTarget}`,
  ])).filter(Boolean);
  const placeholders = candidateVersions.map(() => '?').join(', ');

  const row = db.get(
    `SELECT id
     FROM lgpd_user_acceptances
     WHERE user_id = ?
       AND policy_type = ?
       AND LOWER(TRIM(COALESCE(policy_version, ''))) IN (${placeholders})
     ORDER BY accepted_at DESC
     LIMIT 1`,
    userId,
    policyType,
    ...candidateVersions,
  ) as any;

  return Boolean(row?.id);
}

function userHasGrantedConsentVersion(
  userId: number,
  consentKeys: string[],
  policyVersion: string,
) {
  const normalizedTarget = normalizePolicyVersion(policyVersion);
  if (!consentKeys.length || !normalizedTarget) return false;

  const consentPlaceholders = consentKeys.map(() => '?').join(', ');
  const rows = db.all(
    `SELECT consent_key, policy_version
     FROM lgpd_consents
     WHERE user_id = ?
       AND granted = 1
       AND LOWER(TRIM(COALESCE(consent_key, ''))) IN (${consentPlaceholders})
     ORDER BY updated_at DESC`,
    userId,
    ...consentKeys.map((key) => String(key || '').trim().toLowerCase()),
  ) as any[];

  return rows.some((row) => {
    const normalizedStored = normalizePolicyVersion(row?.policy_version);
    return normalizedStored === normalizedTarget;
  });
}

function hasAnyGrantedConsent(userId: number, consentKeys: string[]) {
  if (!Array.isArray(consentKeys) || consentKeys.length === 0) return false;
  const placeholders = consentKeys.map(() => '?').join(', ');
  const row = db.get(
    `SELECT id
     FROM lgpd_consents
     WHERE user_id = ?
       AND granted = 1
       AND LOWER(TRIM(COALESCE(consent_key, ''))) IN (${placeholders})
     ORDER BY updated_at DESC
     LIMIT 1`,
    userId,
    ...consentKeys.map((key) => String(key || '').trim().toLowerCase()),
  ) as any;
  return Boolean(row?.id);
}

function hasAnyPolicyAcceptance(
  userId: number,
  policyType: 'privacy' | 'terms' | 'cookies',
) {
  const row = db.get(
    `SELECT id
     FROM lgpd_user_acceptances
     WHERE user_id = ?
       AND policy_type = ?
     ORDER BY accepted_at DESC
     LIMIT 1`,
    userId,
    policyType,
  ) as any;
  return Boolean(row?.id);
}

function getActivePolicies() {
  const policies = db.all(
    `SELECT id, policy_type, version, title, content, is_active, force_reaccept, published_at, created_at, updated_at
     FROM lgpd_policies
     WHERE is_active = 1
     ORDER BY policy_type ASC, updated_at DESC`,
  ) as any[];
  return policies;
}

function ensureUserLgpdCompliance(userId: number) {
  const lgpd = resolveLgpdSettings();
  if (!lgpd.enabled || !lgpd.requirePolicyAcceptance) {
    return { ok: true };
  }

  const userRow = db.get(
    'SELECT id, privacy_reaccept_required FROM users WHERE id = ? LIMIT 1',
    userId,
  ) as any;
  const userRequiresReaccept = Number(userRow?.privacy_reaccept_required || 0) === 1;
  const enforceVersionMatch = lgpd.requireReacceptOnPolicyUpdate && userRequiresReaccept;

  const requiredVersions = resolveRequiredPolicyVersions(lgpd);
  const missing: string[] = [];
  const hasTermsAccepted = enforceVersionMatch
    ? (
      userHasAcceptedPolicyVersion(userId, 'terms', requiredVersions.terms) ||
      userHasGrantedConsentVersion(userId, ['terms_of_use', 'terms'], requiredVersions.terms)
    )
    : (
      hasAnyGrantedConsent(userId, ['terms_of_use', 'terms']) ||
      hasAnyPolicyAcceptance(userId, 'terms')
    );
  if (lgpd.requireTermsAcceptance && !hasTermsAccepted) {
    missing.push('terms');
  }

  const hasPrivacyAccepted = enforceVersionMatch
    ? (
      userHasAcceptedPolicyVersion(userId, 'privacy', requiredVersions.privacy) ||
      userHasGrantedConsentVersion(userId, ['privacy_policy', 'privacy'], requiredVersions.privacy)
    )
    : (
      hasAnyGrantedConsent(userId, ['privacy_policy', 'privacy']) ||
      hasAnyPolicyAcceptance(userId, 'privacy')
    );
  if (!hasPrivacyAccepted) {
    missing.push('privacy');
  }

  const hasCookiesAccepted = enforceVersionMatch
    ? (
      userHasAcceptedPolicyVersion(userId, 'cookies', requiredVersions.cookies) ||
      userHasGrantedConsentVersion(userId, ['cookies_policy', 'cookie_consent', 'cookies'], requiredVersions.cookies)
    )
    : (
      hasAnyGrantedConsent(userId, ['cookies_policy', 'cookie_consent', 'cookies']) ||
      hasAnyPolicyAcceptance(userId, 'cookies')
    );
  if (lgpd.requireCookieConsent && !hasCookiesAccepted) {
    missing.push('cookies');
  }

  if (missing.length > 0) {
    return { ok: false, missing, code: 'LGPD_REACCEPT_REQUIRED' };
  }
  return { ok: true };
}

function normalizeDateFilter(input: any, endOfDay = false) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}${endOfDay ? ' 23:59:59' : ' 00:00:00'}`
    : raw;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return '';
  return normalized;
}

function notifyCustomersPolicyUpdated(params: {
  policyType: 'privacy' | 'terms' | 'cookies';
  policyVersion: string;
  policyUrl: string;
  actorUserId?: number;
  req?: express.Request;
}) {
  const recipients = db.all(
    `SELECT id, name, email
     FROM users
     WHERE role = 'customer'
       AND status = 'active'
       AND email IS NOT NULL
       AND email <> ''`,
  ) as any[];

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return;
  }

  // Fire-and-forget, without blocking admin policy operations.
  setImmediate(async () => {
    let sent = 0;
    for (const user of recipients) {
      try {
        const result = await sendEmail({
          to: String(user.email),
          templateKey: 'lgpd_policy_updated',
          variables: {
            name: user.name || 'Cliente',
            policy_type: params.policyType,
            policy_version: params.policyVersion,
            policy_url: params.policyUrl,
          },
        });
        if (result?.success) sent += 1;
      } catch (error) {
        console.error('LGPD policy notification error:', error);
      }
    }

    logLgpdEvent({
      req: params.req,
      actorUserId: params.actorUserId || null,
      eventType: 'policy',
      action: 'policy_notification_sent',
      details: {
        policy_type: params.policyType,
        policy_version: params.policyVersion,
        recipients: recipients.length,
        sent,
      },
    });
  });
}

function computePolicyLineDiff(oldText: string, newText: string) {
  const normalize = (value: string) =>
    String(value || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  const before = normalize(oldText);
  const after = normalize(newText);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const added: string[] = [];
  const removed: string[] = [];

  for (const line of after) {
    if (!beforeSet.has(line)) added.push(line);
  }
  for (const line of before) {
    if (!afterSet.has(line)) removed.push(line);
  }

  return {
    added,
    removed,
    added_count: added.length,
    removed_count: removed.length,
    before_count: before.length,
    after_count: after.length,
    unchanged_count: Math.max(0, Math.min(before.length, after.length) - Math.max(added.length, removed.length)),
  };
}

function buildUserLgpdExportPayload(userId: number) {
  const user = db.get('SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = ?', userId) as any;
  if (!user) return null;
  const profile = db.get('SELECT * FROM customers WHERE user_id = ?', userId) as any;
  const orders = db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', userId);
  const orderItems = db.all(
    `SELECT oi.* FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ?
     ORDER BY oi.order_id DESC`,
    userId,
  );
  const favorites = db.all('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', userId);
  const consents = db.all('SELECT * FROM lgpd_consents WHERE user_id = ? ORDER BY updated_at DESC', userId);
  const acceptances = db.all('SELECT * FROM lgpd_user_acceptances WHERE user_id = ? ORDER BY accepted_at DESC', userId);
  const requests = db.all('SELECT * FROM lgpd_requests WHERE user_id = ? ORDER BY created_at DESC', userId);

  return {
    exported_at: new Date().toISOString(),
    user,
    profile,
    orders,
    order_items: orderItems,
    favorites,
    consents,
    policy_acceptances: acceptances,
    lgpd_requests: requests,
  };
}

function initSettings() {
  const defaultSettings = {
    site_name: 'Digital Bordados',
    site_description: 'ExcelÃƒÆ’Ã‚Âªncia em Matrizes de Bordado',
    logo_url: '',
    primary_color: '#3b82f6',
    secondary_color: '#1e293b',
    email_contact: 'contato@digitalbordados.com',
    phone: '',
    address: 'Atendimento online em todo o Brasil',
    contact_hours: 'Seg a Sex, 8h as 18h',
    contact_whatsapp: '',
    support_whatsapp: '',
    support_email: '',
    order_notifications_email: '',
    mp_mode: 'sandbox',
    modo_operacao: 'sandbox',
    mp_public_key: '',
    mp_access_token: '',
    mp_webhook_secret: '',
    mercadopago_public_key: '',
    mercadopago_access_token: '',
    new_badge_days: '10',
    redirect_to_checkout_after_add_to_cart: 'false',
    smtp_from_name: '',
    smtp_from_email: '',
    matrix_request_team_email: '',
    email_verification_required: 'true',
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
    lgpd_enabled: 'true',
    lgpd_require_consent_register: 'true',
    lgpd_require_checkout_consent: 'true',
    lgpd_require_marketing_optin: 'false',
    lgpd_require_cookie_consent: 'true',
    lgpd_require_policy_acceptance: 'true',
    lgpd_require_terms_acceptance: 'true',
    lgpd_require_reaccept_on_policy_update: 'true',
    lgpd_dpo_name: '',
    lgpd_dpo_email: '',
    lgpd_dpo_phone: '',
    lgpd_privacy_url: '/politica',
    lgpd_terms_url: '/politica',
    lgpd_cookie_policy_url: '/politica',
    lgpd_policy_version_privacy: '1.0',
    lgpd_policy_version_terms: '1.0',
    lgpd_policy_version_cookies: '1.0',
    lgpd_export_ttl_hours: '24',
  };

  Object.entries(defaultSettings).forEach(([key, value]) => {
    db.run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\'))', key, value);
  });

  const defaultPolicies = [
    {
      policy_type: 'privacy',
      version: '1.0',
      title: 'Politica de Privacidade',
      content: '<h2>Politica de Privacidade</h2><p>Utilizamos seus dados para processar pedidos, suporte e obrigacoes legais.</p>',
    },
    {
      policy_type: 'terms',
      version: '1.0',
      title: 'Termos de Uso',
      content: '<h2>Termos de Uso</h2><p>Ao utilizar a plataforma, voce concorda com os termos de compra e uso dos arquivos digitais.</p>',
    },
    {
      policy_type: 'cookies',
      version: '1.0',
      title: 'Politica de Cookies',
      content: '<h2>Politica de Cookies</h2><p>Utilizamos cookies necessarios e opcionais conforme suas preferencias.</p>',
    },
  ];

  defaultPolicies.forEach((policy) => {
    db.run(
      `INSERT IGNORE INTO lgpd_policies (policy_type, version, title, content, is_active, force_reaccept)
       VALUES (?, ?, ?, ?, 1, 0)`,
      policy.policy_type,
      policy.version,
      policy.title,
      policy.content,
    );
  });
}

async function initTestData() {
  initSettings();
  const hashedPassword = await hashPassword('123456');
  const adrianoPassword = await hashPassword('04039866');

  // 1. Novo UsuÃƒÆ’Ã‚Â¡rio Admin (Adriano Amorim)
  const adrianoAdmin = db.get('SELECT * FROM users WHERE email = ?', 'contato@agenciagoodea.com');
  if (!adrianoAdmin) {
    db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Adriano Amorim', 'contato@agenciagoodea.com', adrianoPassword, 'admin', 'ativo');
    console.log('Admin Adriano created: contato@agenciagoodea.com / 04039866');
  } else {
    db.run('UPDATE users SET name = ?, password = ?, role = "admin", status = "ativo" WHERE email = ?', 'Adriano Amorim', adrianoPassword, 'contato@agenciagoodea.com');
  }

  // 2. Antigo UsuÃƒÆ’Ã‚Â¡rio Admin (Digital Bordados)
  const admin = db.get('SELECT * FROM users WHERE email = ?', 'admin@digitalbordados.com');
  if (!admin) {
    db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Administrador', 'admin@digitalbordados.com', hashedPassword, 'admin', 'ativo');
    console.log('Test Admin created: admin@digitalbordados.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃƒÆ’Ã‚Â¡ existir
    db.run('UPDATE users SET password = ?, role = "admin", status = "ativo" WHERE email = ?', hashedPassword, 'admin@digitalbordados.com');
  }

  // 3. UsuÃƒÆ’Ã‚Â¡rio Cliente
  const customerUser = db.get('SELECT * FROM users WHERE email = ?', 'cliente@teste.com');
  if (!customerUser) {
    const result = db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Cliente Teste', 'cliente@teste.com', hashedPassword, 'customer', 'ativo');
    
    // Inserir dados complementares na tabela customers
    db.run('INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)', result.lastInsertRowid, '(11) 98888-7777', '123.456.789-00');
    console.log('Test Customer created: cliente@teste.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃƒÆ’Ã‚Â¡ existir
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
  const PORT = Number(process.env.PORT || 3000);
  app.set('trust proxy', 1);

  const settingsForCors = loadSettingsMap(['app_url']);
  const configuredAppUrl = String(process.env.APP_URL || settingsForCors.app_url || '').trim();
  const localOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const allowedOrigins = new Set<string>(localOrigins);
  if (configuredAppUrl) allowedOrigins.add(configuredAppUrl);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static('public/uploads'));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON invÃƒÂ¡lido no corpo da requisiÃƒÂ§ÃƒÂ£o' });
    }
    return next(err);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes - AUTH
  // Busca inteligente de produtos (Posicionada no inÃƒÂ­cio para evitar conflitos)
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
    const {
      firstName,
      lastName,
      email,
      password,
      terms_accepted,
      privacy_accepted,
      cookie_accepted,
      marketing_accepted,
    } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos sao obrigatorios' });
    }

    try {
      const lgpd = resolveLgpdSettings();
      if (lgpd.enabled && lgpd.requireConsentRegister) {
        if (lgpd.requireTermsAcceptance && !parseBooleanSetting(terms_accepted, false)) {
          return res.status(400).json({ error: 'Voce precisa aceitar os Termos de Uso para continuar.', code: 'TERMS_REQUIRED' });
        }
        if (!parseBooleanSetting(privacy_accepted, false)) {
          return res.status(400).json({ error: 'Voce precisa aceitar a Politica de Privacidade para continuar.', code: 'PRIVACY_REQUIRED' });
        }
        if (lgpd.requireCookieConsent && !parseBooleanSetting(cookie_accepted, false)) {
          return res.status(400).json({ error: 'Voce precisa definir o consentimento de cookies para continuar.', code: 'COOKIES_REQUIRED' });
        }
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const trimmedFirstName = String(firstName).trim();
      const trimmedLastName = String(lastName).trim();
      const name = `${trimmedFirstName} ${trimmedLastName}`.trim();
      const hashedPassword = await hashPassword(String(password));
      const verificationRequired = resolveEmailVerificationRequired();
      const emailVerifiedAt = verificationRequired ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');

      const userResult = db.run(`
        INSERT INTO users (name, email, password, role, email_verified_at)
        VALUES (?, ?, ?, 'customer', ?)
      `, name, normalizedEmail, hashedPassword, emailVerifiedAt);

      const userId = Number(userResult.lastInsertRowid);
      db.run('INSERT INTO customers (user_id) VALUES (?)', userId);

      if (lgpd.enabled) {
        if (parseBooleanSetting(privacy_accepted, false)) {
          recordPolicyAcceptance({
            userId,
            policyType: 'privacy',
            policyVersion: lgpd.policyVersionPrivacy,
            req,
            source: 'register',
          });
          upsertUserConsent({
            userId,
            consentKey: 'privacy_policy',
            granted: true,
            req,
            source: 'register',
            legalBasis: 'consent',
            purpose: 'Criacao de conta e uso da plataforma.',
            policyVersion: lgpd.policyVersionPrivacy,
          });
        }
        if (parseBooleanSetting(terms_accepted, false)) {
          recordPolicyAcceptance({
            userId,
            policyType: 'terms',
            policyVersion: lgpd.policyVersionTerms,
            req,
            source: 'register',
          });
          upsertUserConsent({
            userId,
            consentKey: 'terms_of_use',
            granted: true,
            req,
            source: 'register',
            legalBasis: 'consent',
            purpose: 'Aceite dos termos de uso da plataforma.',
            policyVersion: lgpd.policyVersionTerms,
          });
        }
        if (parseBooleanSetting(cookie_accepted, false)) {
          recordPolicyAcceptance({
            userId,
            policyType: 'cookies',
            policyVersion: lgpd.policyVersionCookies,
            req,
            source: 'register',
          });
          upsertUserConsent({
            userId,
            consentKey: 'cookies_policy',
            granted: true,
            req,
            source: 'register',
            legalBasis: 'consent',
            purpose: 'Aceite da politica de cookies.',
            policyVersion: lgpd.policyVersionCookies,
          });
        }

        upsertUserConsent({
          userId,
          consentKey: 'marketing_communications',
          granted: parseBooleanSetting(marketing_accepted, false),
          req,
          source: 'register',
          legalBasis: 'consent',
          purpose: 'Envio de ofertas e comunicacoes comerciais.',
          policyVersion: lgpd.policyVersionPrivacy,
        });
      }

      const tokenPayload = {
        id: userId,
        email: normalizedEmail,
        type: 'customer',
        name,
        role: 'customer',
        email_verified: Boolean(emailVerifiedAt),
      };
      const token = generateToken(tokenPayload);
      res.cookie('auth_token', token, getAuthCookieOptions(req));

      const appUrl = buildBaseAppUrl(req);
      sendEmail({
        to: normalizedEmail,
        templateKey: 'user_welcome',
        variables: {
          name: trimmedFirstName || name,
          email: normalizedEmail,
          login_url: `${appUrl}/login`,
        },
      }).catch((err) => console.error('Failed to send welcome email:', err));

      if (verificationRequired) {
        sendVerificationEmail({ id: userId, name, email: normalizedEmail }, req).catch((err) =>
          console.error('Failed to send verification email:', err),
        );
      }

      return res.json({
        success: true,
        verification_required: verificationRequired,
        user: {
          id: userId,
          name,
          email: normalizedEmail,
          type: 'customer',
          role: 'customer',
          email_verified: !verificationRequired,
        },
      });
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Este e-mail ja esta cadastrado' });
      }
      console.error('Register error:', error);
      return res.status(500).json({ error: 'Erro ao criar conta' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const normalizedPassword = typeof password === 'string' ? password : '';
      const ip = getClientIp(req);
      const verificationRequired = resolveEmailVerificationRequired();

      if (!normalizedEmail || !normalizedPassword) {
        return res.status(400).json({ error: 'E-mail e senha sao obrigatorios' });
      }

      const attemptStats = getLoginAttemptStats(normalizedEmail, ip);
      if (attemptStats.failCount >= LOGIN_ATTEMPT_MAX_FAILS) {
        return res.status(429).json({
          error: 'Muitas tentativas invalidas. Aguarde alguns minutos e tente novamente.',
          retry_in_minutes: LOGIN_ATTEMPT_WINDOW_MINUTES,
        });
      }

      console.log(`Tentativa de login: ${normalizedEmail}`);
      const user = db.get('SELECT * FROM users WHERE email = ?', normalizedEmail) as any;

      if (!user) {
        console.log(`Falha no login: Usuario nao encontrado - ${normalizedEmail}`);
        recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (!user.password || typeof user.password !== 'string') {
        console.error('Falha no login: usuario sem hash de senha valido', { userId: user.id, email: normalizedEmail });
        recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(500).json({ error: 'Conta sem senha valida. Redefina a senha do usuario.' });
      }

      let passwordIsValid = false;
      try {
        passwordIsValid = await comparePassword(normalizedPassword, user.password);
      } catch (compareError) {
        console.error('Erro ao validar senha:', compareError);
        recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(500).json({ error: 'Erro ao validar credenciais' });
      }

      if (!passwordIsValid) {
        console.log(`Falha no login: Senha incorreta para ${normalizedEmail}`);
        recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (user.status !== 'ativo' && user.status !== 'active') {
        console.log(`Falha no login: Usuario inativo (${user.status}) - ${normalizedEmail}`);
        recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(403).json({ error: 'Esta conta esta inativa' });
      }

      const isEmailVerified = Boolean(user.email_verified_at);
      const type = user.role === 'admin' ? 'user' : 'customer';
      const tokenPayload = {
        id: user.id,
        email: user.email,
        type,
        name: user.name,
        role: user.role,
        email_verified: isEmailVerified,
      };

      console.log(`Login bem-sucedido: ${normalizedEmail} como ${type}`);
      const token = generateToken(tokenPayload);
      res.cookie('auth_token', token, getAuthCookieOptions(req));
      recordLoginAttempt(normalizedEmail, ip, true);
      return res.json({
        success: true,
        verification_required: verificationRequired,
        needs_email_verification: verificationRequired && !isEmailVerified,
        needs_policy_reaccept: Boolean(user.privacy_reaccept_required),
        user: tokenPayload,
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Erro interno ao processar login' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https',
    });
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ user: null });

    const decoded = verifyToken(token) as any;
    if (!decoded || typeof decoded === 'string' || !decoded.id) {
      res.clearCookie('auth_token');
      return res.json({ user: null });
    }

    // Consulta o DB para retornar dados atualizados (incluindo avatar_url)
    try {
      const fresh = db.get('SELECT id, name, email, role, avatar_url, email_verified_at, privacy_reaccept_required FROM users WHERE id = ?', Number(decoded.id)) as any;
      if (!fresh) return res.json({ user: null });
      const type = fresh.role === 'admin' ? 'user' : 'customer';
      return res.json({
        user: {
          id: fresh.id,
          name: fresh.name,
          email: fresh.email,
          type,
          role: fresh.role,
          avatar_url: fresh.avatar_url || null,
          email_verified: Boolean(fresh.email_verified_at),
          privacy_reaccept_required: Boolean(fresh.privacy_reaccept_required),
        },
      });
    } catch {
      // fallback: retorna o token decodificado
      return res.json({ user: decoded });
    }
  });

  app.post('/api/auth/resend-verification', async (req, res) => {
    try {
      const { email } = req.body || {};
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'E-mail obrigatorio' });
      }

      const verificationRequired = resolveEmailVerificationRequired();
      if (!verificationRequired) {
        return res.json({ success: true, message: 'Verificacao de e-mail desativada nas configuracoes.' });
      }

      const user = db.get('SELECT id, name, email, status, email_verified_at FROM users WHERE email = ? LIMIT 1', normalizedEmail) as any;
      if (!user) {
        return res.json({ success: true });
      }
      if (user.status !== 'ativo' && user.status !== 'active') {
        return res.status(403).json({ error: 'Conta inativa' });
      }
      if (user.email_verified_at) {
        return res.json({ success: true, message: 'E-mail ja confirmado.' });
      }

      const result = await sendVerificationEmail({ id: Number(user.id), name: String(user.name || ''), email: normalizedEmail }, req);
      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Falha ao reenviar e-mail de verificacao' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Resend verification error:', error);
      return res.status(500).json({ error: 'Erro ao reenviar verificacao' });
    }
  });

  app.get('/api/auth/verify-email', (req, res) => {
    try {
      const token = String(req.query.token || '').trim();
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token ausente' });
      }

      const tokenHash = sha256(token);
      const verification = db.get(
        `SELECT *
         FROM email_verification_tokens
         WHERE token_hash = ?
           AND used = 0
           AND expires_at > NOW()
         LIMIT 1`,
        tokenHash,
      ) as any;

      if (!verification) {
        return res.status(400).json({ success: false, error: 'Token invalido ou expirado' });
      }

      db.transaction(() => {
        db.run(
          'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          Number(verification.user_id),
        );
        db.run('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', Number(verification.id));
      })();

      return res.json({ success: true, message: 'E-mail confirmado com sucesso' });
    } catch (error) {
      console.error('Verify email error:', error);
      return res.status(500).json({ success: false, error: 'Erro ao confirmar e-mail' });
    }
  });

  // API Routes - FAVORITES
  app.get('/api/favorites', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const newBadgeDays = resolveNewBadgeDays();
      const favorites = db.all(`
        SELECT
          f.product_id,
          f.created_at,
          p.name,
          p.slug,
          p.image,
          p.price,
          p.sale_price,
          p.status,
          p.is_new,
          p.created_at AS product_created_at
        FROM favorites f
        JOIN products p ON p.id = f.product_id
        WHERE f.user_id = ?
          AND p.status = 'active'
        ORDER BY f.created_at DESC
      `, user.id) as any[];

      const normalizedFavorites = favorites.map((item) => ({
        ...item,
        image: normalizePublicMediaUrl(item?.image),
        is_new: resolveProductIsNew({ is_new: item?.is_new, created_at: item?.product_created_at }, newBadgeDays),
      }));

      const favoriteIds = normalizedFavorites.map((item) => Number(item.product_id));
      return res.json({ favorites: normalizedFavorites, favorite_ids: favoriteIds });
    } catch (error) {
      console.error('Fetch Favorites Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar favoritos' });
    }
  });

  app.post('/api/favorites/:productId', authenticate, (req, res) => {
    const user = (req as any).user;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'product_id invÃƒÂ¡lido' });
    }

    const product = db.get('SELECT id, status FROM products WHERE id = ?', productId) as any;
    if (!product || product.status !== 'active') {
      return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });
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
      return res.status(400).json({ error: 'product_id invÃƒÂ¡lido' });
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
      if (!email) return res.status(400).json({ error: 'E-mail obrigatÃƒÂ³rio' });

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
      res.status(500).json({ error: 'Erro interno ao solicitar recuperaÃƒÂ§ÃƒÂ£o de senha' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, new_password } = req.body || {};
      if (!token || !new_password) return res.status(400).json({ error: 'Token e nova senha sÃƒÂ£o obrigatÃƒÂ³rios' });

      const resetRequest = db.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP',
        token
      ) as any;

      if (!resetRequest) {
        return res.status(400).json({ error: 'Token invÃƒÂ¡lido ou expirado' });
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
      `, ...params, limit, offset) as any[];

      const normalizedProducts = products.map((product) => ({
        ...product,
        image: normalizePublicMediaUrl(product?.image),
      }));

      const totalResult = db.get(`
        SELECT COUNT(*) as total 
        FROM products p 
        ${whereClause}
      `, ...params) as any;

      const total = totalResult?.total || 0;

      res.json({
        products: normalizedProducts,
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
      return res.status(400).json({ error: 'Nome do produto ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const mainImage = files['image']?.[0]?.filename ? `/uploads/${files['image'][0].filename}` : null;
    const productionSheetFile = files['production_sheet']?.[0]?.filename ? `/uploads/${files['production_sheet'][0].filename}` : null;
    const productionSheetValue = productionSheetFile || (typeof production_sheet === 'string' ? production_sheet.trim() : '') || null;
    const finalPrice = Number(price);
    if (!Number.isFinite(finalPrice)) {
      return res.status(400).json({ error: 'PreÃƒÆ’Ã‚Â§o invÃƒÆ’Ã‚Â¡lido' });
    }
    const finalSalePriceRaw = promotional_price ?? sale_price ?? null;
    const finalSalePrice = finalSalePriceRaw === null || finalSalePriceRaw === '' ? null : Number(finalSalePriceRaw);
    if (finalSalePrice !== null && !Number.isFinite(finalSalePrice)) {
      return res.status(400).json({ error: 'PreÃƒÆ’Ã‚Â§o promocional invÃƒÆ’Ã‚Â¡lido' });
    }
    const normalizedStitchCount = stitch_count === undefined || stitch_count === null || stitch_count === ''
      ? null
      : Number(stitch_count);
    if (normalizedStitchCount !== null && !Number.isFinite(normalizedStitchCount)) {
      return res.status(400).json({ error: 'Quantidade de pontos invÃƒÆ’Ã‚Â¡lida' });
    }
    const normalizedCategoryId = category_id === undefined || category_id === null || category_id === ''
      ? null
      : Number(category_id);
    if (normalizedCategoryId !== null && !Number.isFinite(normalizedCategoryId)) {
      return res.status(400).json({ error: 'Categoria principal invÃƒÆ’Ã‚Â¡lida' });
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

      // Arquivos de ProduÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
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
      return res.status(404).json({ error: 'Produto nÃƒÆ’Ã‚Â£o encontrado' });
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
      downloadable_files,
      gallery_urls
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
      return res.status(400).json({ error: 'Quantidade de pontos invÃƒÂ¡lida' });
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
          console.warn('Falha ao remover folha de produÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o antiga:', fileError);
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

      const hasNewGalleryFiles = Array.isArray(files['gallery']) && files['gallery'].length > 0;
      const hasGalleryUrlsPayload = gallery_urls !== undefined;
      if (hasNewGalleryFiles || hasGalleryUrlsPayload) {
        db.run(`
          DELETE FROM product_images
          WHERE product_id = ?
            AND (file_type = 'gallery' OR file_type IS NULL OR file_type = '')
        `, productId);

        if (hasGalleryUrlsPayload) {
          let parsedGalleryUrls: string[] = [];
          if (Array.isArray(gallery_urls)) {
            parsedGalleryUrls = gallery_urls.map((value) => String(value).trim()).filter(Boolean);
          } else if (typeof gallery_urls === 'string' && gallery_urls.trim()) {
            try {
              const parsed = JSON.parse(gallery_urls);
              parsedGalleryUrls = Array.isArray(parsed) ? parsed.map((value) => String(value).trim()).filter(Boolean) : [];
            } catch {
              parsedGalleryUrls = gallery_urls.split(',').map((value) => value.trim()).filter(Boolean);
            }
          }

          parsedGalleryUrls.forEach((url) => {
            db.run('INSERT INTO product_images (product_id, url, file_type) VALUES (?, ?, ?)', productId, url, 'gallery');
          });
        }

        if (hasNewGalleryFiles) {
          files['gallery'].forEach((file) => {
            db.run('INSERT INTO product_images (product_id, url, file_type) VALUES (?, ?, ?)', productId, `/uploads/${file.filename}`, 'gallery');
          });
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
    if (!product) return res.status(404).json({ error: 'Produto nÃƒÆ’Ã‚Â£o encontrado' });

    const images = (db.all('SELECT * FROM product_images WHERE product_id = ?', req.params.id) as any[]).map((image) => ({
      ...image,
      url: normalizePublicMediaUrl(image?.url),
    }));
    const files = db.all('SELECT * FROM product_files WHERE product_id = ?', req.params.id);
    const categoryRelations = db.all('SELECT category_id FROM product_category_relations WHERE product_id = ?', req.params.id) as any[];
    const tags = db.all(`
      SELECT t.* 
      FROM product_tags t 
      JOIN product_tag_relations pt ON t.id = pt.tag_id 
      WHERE pt.product_id = ?
    `, req.params.id);

    const normalizedProduct = {
      ...product,
      image: normalizePublicMediaUrl(product?.image),
      production_sheet: normalizePublicMediaUrl(product?.production_sheet),
    };
    res.json({ ...normalizedProduct, images, files, tags, category_ids: categoryRelations.map((row) => row.category_id) });
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
      return res.status(400).json({ error: 'Nome da categoria ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
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
      return res.status(400).json({ error: 'Nome da categoria ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
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
        return res.status(404).json({ error: 'Categoria nÃƒÆ’Ã‚Â£o encontrada' });
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
      return res.status(400).json({ error: 'Nenhuma categoria vÃƒÆ’Ã‚Â¡lida foi informada' });
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
      checkout_data_processing_accepted,
      card_token,
      installments,
      issuer_id,
      payment_method_id,
    } = req.body || {};
    const user = (req as any).user;
    const freshUser = getUserById(Number(user?.id || 0));
    if (!freshUser) {
      return res.status(401).json({ error: 'Usuario nao encontrado' });
    }
    if (freshUser.status !== 'ativo' && freshUser.status !== 'active') {
      return res.status(403).json({ error: 'Conta inativa' });
    }
    if (resolveEmailVerificationRequired() && !freshUser.email_verified_at) {
      return res.status(403).json({
        error: 'Confirme seu e-mail para finalizar compras.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const lgpd = resolveLgpdSettings();
    if (lgpd.enabled) {
      const compliance = ensureUserLgpdCompliance(Number(freshUser.id));
      if (!compliance.ok) {
        return res.status(403).json({
          error: 'Aceite as politicas de privacidade/termos para continuar.',
          code: compliance.code,
          missing: compliance.missing,
        });
      }
      if (lgpd.requireCheckoutConsent && !parseBooleanSetting(checkout_data_processing_accepted, false)) {
        return res.status(400).json({
          error: 'Voce precisa autorizar o processamento de dados para finalizar a compra.',
          code: 'CHECKOUT_CONSENT_REQUIRED',
        });
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }
    if (!['pix', 'credit_card', 'debit_card'].includes(payment_method)) {
      return res.status(400).json({ error: 'MÃƒÂ©todo de pagamento invÃƒÂ¡lido' });
    }

    try {
      let subtotal = 0;
      const orderItems: any[] = [];

      for (const item of items) {
        const productId = Number(item?.product_id);
        const quantity = Number(item?.quantity || 1);
        if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({ error: 'Itens invÃƒÂ¡lidos no checkout' });
        }

        const product = db.get('SELECT id, name, slug, price, sale_price FROM products WHERE id = ?', productId) as any;
        if (!product) {
          return res.status(400).json({ error: `Produto ${productId} nÃƒÂ£o encontrado` });
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
        return res.status(400).json({ error: 'NÃƒÂ£o foi possÃƒÂ­vel calcular o total do pedido' });
      }

      const payerEmail = String((payer as any)?.email || user?.email || '').trim().toLowerCase();
      const payerFirstName = String((payer as any)?.first_name || '').trim();
      const payerLastName = String((payer as any)?.last_name || '').trim();
      const payerCpf = normalizeCPF((payer as any)?.cpf);

      if (!payerEmail) {
        return res.status(400).json({ error: 'E-mail do pagador ÃƒÂ© obrigatÃƒÂ³rio' });
      }
      if (!payerCpf) {
        return res.status(400).json({ error: 'CPF do pagador ÃƒÂ© obrigatÃƒÂ³rio' });
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

      if (lgpd.enabled && parseBooleanSetting(checkout_data_processing_accepted, false)) {
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'checkout_data_processing',
          granted: true,
          req,
          source: 'checkout',
          legalBasis: 'consent',
          purpose: `Processamento de pagamento para pedido #${orderId}.`,
          policyVersion: lgpd.policyVersionPrivacy,
        });
      }

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

      const orderNotificationEmail = getOrderNotificationEmail();
      if (orderNotificationEmail) {
        sendEmail({
          to: orderNotificationEmail,
          templateKey: 'order_created',
          variables: {
            name: 'Equipe',
            order_id: orderId,
            order_total: `R$ ${subtotal.toFixed(2)}`,
            order_status: paymentStatus,
            items: `<ul>${itemsHtml}</ul>`,
            payment_method: payment_method,
            account_url: `${appUrl}/admin/pedidos`,
          },
        }).catch((err) => console.error('Failed to send order_created team email:', err));
      }

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
      const user = (req as any).user;
      const paymentId = String(req.params.payment_id || '').trim();
      if (!paymentId) return res.status(400).json({ error: 'payment_id invÃƒÂ¡lido' });

      const paymentClient = createMercadoPagoPaymentClient();
      const payment = await paymentClient.get({ id: paymentId });
      const status = String(payment?.status || 'pending');

      const order = db.get('SELECT id, user_id FROM orders WHERE transaction_id = ? LIMIT 1', paymentId) as any;
      const orderId = order?.id ? Number(order.id) : null;
      if (orderId && Number(order.user_id) !== Number(user?.id)) {
        return res.status(403).json({ error: 'Pagamento nao pertence ao usuario autenticado' });
      }
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
      const signatureCheck = verifyMercadoPagoWebhookSignature(req, payload);
      if (!signatureCheck.ok) {
        db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify({ payload, reason: signatureCheck.reason }), 'invalid_signature');
        return res.status(401).json({ error: 'invalid_signature' });
      }

      const eventType = String((payload as any)?.type || (payload as any)?.action || '');
      const paymentId = String((payload as any)?.data?.id || (payload as any)?.id || '');
      const eventId = String(req.headers['x-request-id'] || `${eventType}:${paymentId || 'unknown'}`);
      if (isWebhookAlreadyProcessed('mercadopago', eventId)) {
        return res.sendStatus(200);
      }

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
                    downloads_url: `${appUrl}/conta`,
                  },
                }).catch(err => console.error('Failed to send order_paid email:', err));

                const orderNotificationEmail = getOrderNotificationEmail();
                if (orderNotificationEmail) {
                  sendEmail({
                    to: orderNotificationEmail,
                    templateKey: 'order_paid',
                    variables: {
                      name: 'Equipe',
                      order_id: order.id,
                      order_total: `R$ ${order.total.toFixed(2)}`,
                      items: `<ul>${itemsHtml}</ul>`,
                      downloads_url: `${appUrl}/admin/pedidos`,
                    },
                  }).catch((err) => console.error('Failed to send order_paid team email:', err));
                }
              }
            } else if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') {
              db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', paymentStatus, Number(order.id));

              if (previousStatus !== 'rejected' && previousStatus !== 'cancelled') {
                const appUrl = process.env.APP_URL || `http://${req.get('host')}`;
                sendEmail({
                  to: order.customer_email,
                  templateKey: 'payment_failed',
                  variables: {
                    name: order.customer_name || 'Cliente',
                    order_id: order.id,
                    order_total: `R$ ${order.total.toFixed(2)}`,
                    retry_url: `${appUrl}/checkout`,
                  },
                }).catch(err => console.error('Failed to send payment_failed email:', err));
              }
            }
          }

          markWebhookProcessed('mercadopago', eventId, paymentId);
          db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify({ eventType, paymentStatus, paymentId, eventId }), 'processed');
        }
      }
    } catch (error) {
      console.error('MercadoPago webhook error:', error);
      db.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify(payload), 'error');
    }

    return res.sendStatus(200);
  });
  app.get('/api/customer/account', authenticate, (req, res) => {
    const user = (req as any).user;
    try {
      const lgpd = resolveLgpdSettings();
      const profile = db.get(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.first_name,
          u.last_name,
          u.email_verified_at,
          u.privacy_reaccept_required,
          c.phone,
          c.cpf,
          u.avatar_url,
          c.billing_address,
          c.billing_city,
          c.billing_neighborhood,
          c.billing_state,
          c.billing_zip,
          c.billing_country,
          c.shipping_address,
          c.shipping_city,
          c.shipping_neighborhood,
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
          (
            SELECT COUNT(*)
            FROM orders
            WHERE user_id = ?
               OR LOWER(TRIM(COALESCE(customer_email, ''))) = LOWER(TRIM(?))
          ) AS orders_count,
          (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorites_count,
          (
            SELECT COUNT(*)
            FROM (
              SELECT DISTINCT oi.id
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              LEFT JOIN products p_by_id ON p_by_id.id = oi.product_id
              LEFT JOIN products p_by_slug ON oi.product_id IS NULL
                AND LOWER(TRIM(COALESCE(p_by_slug.slug, ''))) = LOWER(TRIM(COALESCE(oi.product_slug, '')))
              LEFT JOIN products p_by_name ON oi.product_id IS NULL
                AND (oi.product_slug IS NULL OR TRIM(oi.product_slug) = '')
                AND LOWER(TRIM(COALESCE(p_by_name.name, ''))) = LOWER(TRIM(COALESCE(oi.product_name, '')))
              LEFT JOIN product_files f
                ON f.product_id = COALESCE(p_by_id.id, p_by_slug.id, p_by_name.id)
              WHERE (
                o.user_id = ?
                OR LOWER(TRIM(COALESCE(o.customer_email, ''))) = LOWER(TRIM(?))
              )
                AND LOWER(COALESCE(o.status, '')) IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
                AND f.file_path IS NOT NULL
                AND f.file_path <> ''
            ) purchased
          ) AS purchased_items
      `, user.id, profile?.email || '___nomail___', user.id, user.id, profile?.email || '___nomail___') as any;

      return res.json({
        user: profile || null,
        lgpd: {
          enabled: lgpd.enabled,
          compliance: ensureUserLgpdCompliance(Number(user.id)),
        },
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
        userId: user?.id || null
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

  // Download seguro de matrizes compradas (stream binario)
  app.get('/api/customer/download-file', authenticate, async (req, res) => {
    const user = (req as any).user;
    const requestIp = getRequestIpAddress(req);
    const requestUserAgent = String(req.get('user-agent') || '').slice(0, 2048);
    const rawFilePath = String(req.query.path || '').trim();
    const mode = String(req.query.mode || '').trim().toLowerCase();
    const decodedFilePath = decodePathComponentSafe(rawFilePath);
    const normalizedUserEmail = String(user?.email || '').trim().toLowerCase();
    const logContext: {
      userId?: number | null;
      orderId?: number | null;
      orderItemId?: number | null;
      productId?: number | null;
      fileName?: string | null;
      filePath?: string | null;
      fileSize?: number | null;
    } = {
      userId: Number(user?.id || 0) || null,
      filePath: rawFilePath,
    };

    const deny = (
      statusCode: number,
      message: string,
      extra: Record<string, unknown> = {},
      ownedDownload?: any,
    ) => {
      logDownloadAttempt({
        userId: Number(user?.id || 0) || null,
        orderId: ownedDownload?.order_id ? Number(ownedDownload.order_id) : null,
        orderItemId: ownedDownload?.order_item_id ? Number(ownedDownload.order_item_id) : null,
        productId: ownedDownload?.product_id ? Number(ownedDownload.product_id) : null,
        fileName: String(ownedDownload?.file_name || ''),
        filePath: String(ownedDownload?.file_path || rawFilePath || ''),
        status: 'denied',
        error: message,
        ip: requestIp,
        userAgent: requestUserAgent,
      });
      return res.status(statusCode).json({ error: message, ...extra });
    };

    try {
      if (!rawFilePath) {
        return deny(400, 'Caminho do arquivo e obrigatorio');
      }

      const freshUser = getUserById(Number(user?.id || 0));
      if (!freshUser) {
        return deny(401, 'Usuario nao encontrado');
      }
      if (!canUserAccessDownloads(Number(freshUser.id), String(freshUser.email || ''), freshUser.email_verified_at)) {
        return deny(403, 'Confirme seu e-mail para acessar downloads.', { code: 'EMAIL_NOT_VERIFIED' });
      }

      const lgpdCompliance = ensureUserLgpdCompliance(Number(freshUser.id));
      if (!lgpdCompliance.ok) {
        return deny(403, 'Aceite as politicas LGPD para acessar seus downloads.', {
          code: lgpdCompliance.code,
          missing: lgpdCompliance.missing,
        });
      }

      const allowedDomain = String(process.env.APP_DOMAIN || 'digitalbordados.com.br')
        .trim()
        .toLowerCase();
      const toAbsoluteUrl = (value: string) => {
        if (!value) return '';
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith('//')) return `https:${value}`;
        return `https://${allowedDomain}${value.startsWith('/') ? '' : '/'}${value}`;
      };

      const candidateValues = new Set<string>([
        rawFilePath,
        decodedFilePath,
        toAbsoluteUrl(rawFilePath),
        toAbsoluteUrl(decodedFilePath),
      ]);

      for (const candidate of Array.from(candidateValues)) {
        if (!candidate) continue;
        try {
          const parsed = new URL(candidate);
          if (parsed.pathname) {
            candidateValues.add(parsed.pathname);
            candidateValues.add(`${parsed.pathname}${parsed.search || ''}`);
            candidateValues.add(decodePathComponentSafe(parsed.pathname));
            candidateValues.add(decodePathComponentSafe(`${parsed.pathname}${parsed.search || ''}`));
          }
        } catch {
          // valor nao e URL absoluta, ignora
        }
      }

      const filePathCandidates = Array.from(candidateValues)
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      if (!filePathCandidates.length) {
        return deny(400, 'Caminho do arquivo invalido');
      }

      const placeholders = filePathCandidates.map(() => '?').join(', ');
      const statusPlaceholders = getDownloadStatusPlaceholders();
      const ownedDownload = db.get(`
        SELECT
          o.id AS order_id,
          oi.id AS order_item_id,
          COALESCE(p_by_id.id, p_by_slug.id, p_by_name.id, oi.product_id) AS product_id,
          o.status AS order_status,
          f.file_path,
          f.file_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p_by_id ON p_by_id.id = oi.product_id
        LEFT JOIN products p_by_slug ON oi.product_id IS NULL
          AND LOWER(TRIM(COALESCE(p_by_slug.slug, ''))) = LOWER(TRIM(COALESCE(oi.product_slug, '')))
        LEFT JOIN products p_by_name ON oi.product_id IS NULL
          AND (oi.product_slug IS NULL OR TRIM(oi.product_slug) = '')
          AND LOWER(TRIM(COALESCE(p_by_name.name, ''))) = LOWER(TRIM(COALESCE(oi.product_name, '')))
        JOIN product_files f
          ON f.product_id = COALESCE(p_by_id.id, p_by_slug.id, p_by_name.id)
        WHERE (
          o.user_id = ?
          OR LOWER(TRIM(COALESCE(o.customer_email, ''))) = LOWER(TRIM(?))
        )
          AND LOWER(COALESCE(o.status, '')) IN (${statusPlaceholders})
          AND f.file_path IN (${placeholders})
        ORDER BY o.created_at DESC, oi.id DESC
        LIMIT 1
      `, Number(user.id), normalizedUserEmail || '___nomail___', ...DOWNLOAD_ALLOWED_STATUSES, ...filePathCandidates) as any;

      if (!ownedDownload) {
        return deny(403, 'Download nao autorizado para este usuario.');
      }

      logContext.orderId = Number(ownedDownload.order_id || 0) || null;
      logContext.orderItemId = Number(ownedDownload.order_item_id || 0) || null;
      logContext.productId = Number(ownedDownload.product_id || 0) || null;
      logContext.fileName = String(ownedDownload.file_name || '');
      logContext.filePath = String(ownedDownload.file_path || rawFilePath || '');

      const resolved = resolveDownloadAbsolutePath(String(ownedDownload.file_path || decodedFilePath || rawFilePath));
      if (!resolved) {
        return deny(404, 'Arquivo ZIP nao encontrado no servidor.', { code: 'FILE_NOT_FOUND' }, ownedDownload);
      }

      const fileStats = fs.statSync(resolved.absolutePath);
      if (!fileStats.isFile() || fileStats.size <= 0) {
        return deny(404, 'Arquivo invalido para download.', { code: 'INVALID_FILE' }, ownedDownload);
      }

      const fileNameRaw = String(ownedDownload.file_name || path.basename(resolved.absolutePath) || 'matriz.zip');
      const fileName = fileNameRaw.replace(/[/\\?%*:|"<>]/g, '_');
      const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
      const ext = path.extname(fileName).toLowerCase();
      logContext.fileName = fileName;
      logContext.fileSize = Number(fileStats.size);

      if (ext !== '.zip') {
        return deny(400, 'Somente arquivos ZIP sao permitidos para este endpoint.', { code: 'INVALID_EXTENSION' }, ownedDownload);
      }

      if (mode === 'meta') {
        const sha256Hex = await computeFileSha256(resolved.absolutePath);
        logDownloadAttempt({
          userId: Number(freshUser.id),
          orderId: Number(ownedDownload.order_id || 0) || null,
          orderItemId: Number(ownedDownload.order_item_id || 0) || null,
          productId: Number(ownedDownload.product_id || 0) || null,
          fileName,
          filePath: String(ownedDownload.file_path || ''),
          fileSize: Number(fileStats.size),
          sha256: sha256Hex,
          status: 'success',
          ip: requestIp,
          userAgent: requestUserAgent,
        });
        return res.json({
          file_name: fileName,
          file_path: String(ownedDownload.file_path || ''),
          size: Number(fileStats.size),
          sha256: sha256Hex,
        });
      }

      const hash = crypto.createHash('sha256');
      const readStream = fs.createReadStream(resolved.absolutePath);

      readStream.on('data', (chunk) => {
        hash.update(chunk);
      });

      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('Content-Length', String(fileStats.size));
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      await pipeline(readStream, res);

      const sha256Hex = hash.digest('hex');
      logDownloadAttempt({
        userId: Number(freshUser.id),
        orderId: Number(ownedDownload.order_id || 0) || null,
        orderItemId: Number(ownedDownload.order_item_id || 0) || null,
        productId: Number(ownedDownload.product_id || 0) || null,
        fileName,
        filePath: String(ownedDownload.file_path || ''),
        fileSize: Number(fileStats.size),
        sha256: sha256Hex,
        status: 'success',
        ip: requestIp,
        userAgent: requestUserAgent,
      });
      return;
    } catch (error: any) {
      const errorMessage = String(error?.message || error || 'Erro desconhecido');
      console.error('Erro no stream de download:', errorMessage);
      logDownloadAttempt({
        userId: logContext.userId ?? null,
        orderId: logContext.orderId ?? null,
        orderItemId: logContext.orderItemId ?? null,
        productId: logContext.productId ?? null,
        fileName: logContext.fileName ?? null,
        filePath: logContext.filePath ?? rawFilePath,
        fileSize: logContext.fileSize ?? null,
        status: 'error',
        error: errorMessage,
        ip: requestIp,
        userAgent: requestUserAgent,
      });
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Nao foi possivel processar o download. Tente novamente mais tarde.' });
      }
      return;
    }
  });

  app.get('/api/customer/downloads', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const freshUser = getUserById(Number(user?.id || 0));
      if (!freshUser) {
        return res.status(401).json({ error: 'Usuario nao encontrado' });
      }
      if (!canUserAccessDownloads(Number(freshUser.id), String(freshUser.email || ''), freshUser.email_verified_at)) {
        return res.status(403).json({ error: 'Confirme seu e-mail para acessar downloads.', code: 'EMAIL_NOT_VERIFIED' });
      }
      const lgpdCompliance = ensureUserLgpdCompliance(Number(freshUser.id));
      if (!lgpdCompliance.ok) {
        return res.status(403).json({ error: 'Aceite as politicas LGPD para acessar seus downloads.', code: lgpdCompliance.code, missing: lgpdCompliance.missing });
      }

      const statusPlaceholders = getDownloadStatusPlaceholders();
      const downloads = db.all(`
        SELECT
          oi.id AS download_id,
          o.id AS order_id,
          COALESCE(p_by_id.id, p_by_slug.id, p_by_name.id, oi.product_id) AS product_id,
          COALESCE(oi.product_name, p_by_id.name, p_by_slug.name, p_by_name.name) AS product_name,
          COALESCE(oi.product_slug, p_by_id.slug, p_by_slug.slug, p_by_name.slug) AS product_slug,
          COALESCE(p_by_id.image, p_by_slug.image, p_by_name.image) AS product_image,
          COALESCE(p_by_id.production_sheet, p_by_slug.production_sheet, p_by_name.production_sheet) AS production_sheet,
          f.file_path,
          f.file_name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p_by_id ON p_by_id.id = oi.product_id
        LEFT JOIN products p_by_slug ON oi.product_id IS NULL
          AND LOWER(TRIM(COALESCE(p_by_slug.slug, ''))) = LOWER(TRIM(COALESCE(oi.product_slug, '')))
        LEFT JOIN products p_by_name ON oi.product_id IS NULL
          AND (oi.product_slug IS NULL OR TRIM(oi.product_slug) = '')
          AND LOWER(TRIM(COALESCE(p_by_name.name, ''))) = LOWER(TRIM(COALESCE(oi.product_name, '')))
        LEFT JOIN product_files f
          ON f.product_id = COALESCE(p_by_id.id, p_by_slug.id, p_by_name.id)
        WHERE (
          o.user_id = ?
          OR LOWER(TRIM(COALESCE(o.customer_email, ''))) = LOWER(TRIM(?))
        )
          AND LOWER(COALESCE(o.status, '')) IN (${statusPlaceholders})
          AND f.file_path IS NOT NULL
          AND f.file_path <> ''
        ORDER BY o.created_at DESC, oi.id DESC
      `, user.id, String(freshUser.email || '___nomail___').trim().toLowerCase(), ...DOWNLOAD_ALLOWED_STATUSES) as any[];

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
        billing_neighborhood: String(billing.neighborhood || '').trim() || null,
        billing_state: String(billing.state || '').trim() || null,
        billing_zip: String(billing.zip || '').trim() || null,
        billing_country: String(billing.country || '').trim() || null,
        shipping_address: String(shipping.address || '').trim() || null,
        shipping_city: String(shipping.city || '').trim() || null,
        shipping_neighborhood: String(shipping.neighborhood || '').trim() || null,
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
            billing_neighborhood = ?,
            billing_state = ?,
            billing_zip = ?,
            billing_country = ?,
            shipping_address = ?,
            shipping_city = ?,
            shipping_neighborhood = ?,
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
          payload.billing_neighborhood,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
          payload.shipping_address,
          payload.shipping_city,
          payload.shipping_neighborhood,
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
            billing_address, billing_city, billing_neighborhood, billing_state, billing_zip, billing_country,
            shipping_address, shipping_city, shipping_neighborhood, shipping_state, shipping_zip, shipping_country,
            address, city, state, zip, country
          )
          VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          user.id,
          payload.billing_address,
          payload.billing_city,
          payload.billing_neighborhood,
          payload.billing_state,
          payload.billing_zip,
          payload.billing_country,
          payload.shipping_address,
          payload.shipping_city,
          payload.shipping_neighborhood,
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

  app.get('/api/lgpd/policies/active', (req, res) => {
    try {
      const lgpd = resolveLgpdSettings();
      const policies = getActivePolicies();
      res.json({
        enabled: lgpd.enabled,
        versions: {
          privacy: lgpd.policyVersionPrivacy,
          terms: lgpd.policyVersionTerms,
          cookies: lgpd.policyVersionCookies,
        },
        policies,
      });
    } catch (error) {
      console.error('LGPD active policies error:', error);
      res.status(500).json({ error: 'Erro ao carregar politicas LGPD' });
    }
  });

  app.post('/api/lgpd/cookies/consent', (req, res) => {
    try {
      const {
        necessary = true,
        statistics = false,
        marketing = false,
        preferences = false,
        consent_id,
      } = req.body || {};
      const user = (req as any).user || null;
      const consentId = String(consent_id || crypto.randomBytes(16).toString('hex'));
      const lgpd = resolveLgpdSettings();
      db.run(
        `INSERT INTO lgpd_cookie_consents (
          user_id, consent_id, necessary, statistics, marketing, preferences, consent_version, ip, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          necessary = VALUES(necessary),
          statistics = VALUES(statistics),
          marketing = VALUES(marketing),
          preferences = VALUES(preferences),
          consent_version = VALUES(consent_version),
          ip = VALUES(ip),
          user_agent = VALUES(user_agent),
          updated_at = CURRENT_TIMESTAMP`,
        user?.id || null,
        consentId,
        parseBooleanSetting(necessary, true) ? 1 : 0,
        parseBooleanSetting(statistics, false) ? 1 : 0,
        parseBooleanSetting(marketing, false) ? 1 : 0,
        parseBooleanSetting(preferences, false) ? 1 : 0,
        lgpd.policyVersionCookies,
        getClientIp(req),
        String(req.headers['user-agent'] || '').slice(0, 500),
      );
      if (user?.id) {
        recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'cookies',
          policyVersion: lgpd.policyVersionCookies,
          req,
          source: 'cookie_banner',
        });
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'cookies_policy',
          granted: true,
          req,
          source: 'cookie_banner',
          legalBasis: 'consent',
          purpose: 'Aceite da politica de cookies via banner.',
          policyVersion: lgpd.policyVersionCookies,
        });
      }
      return res.json({ success: true, consent_id: consentId });
    } catch (error) {
      console.error('LGPD cookie consent error:', error);
      return res.status(500).json({ error: 'Erro ao registrar consentimento de cookies' });
    }
  });

  app.get('/api/customer/privacy', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const lgpd = resolveLgpdSettings();
      const consents = db.all(
        `SELECT consent_key, granted, legal_basis, purpose, source, policy_version, updated_at, revoked_at
         FROM lgpd_consents
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
        user.id,
      );
      const acceptances = db.all(
        `SELECT policy_type, policy_version, accepted_at, source
         FROM lgpd_user_acceptances
         WHERE user_id = ?
         ORDER BY accepted_at DESC`,
        user.id,
      );
      const requests = db.all(
        `SELECT id, request_type, status, payload, response_notes, created_at, handled_at
         FROM lgpd_requests
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        user.id,
      );
      const compliance = ensureUserLgpdCompliance(Number(user.id));
      res.json({
        settings: lgpd,
        compliance,
        consents,
        acceptances,
        requests,
      });
    } catch (error) {
      console.error('Customer privacy error:', error);
      res.status(500).json({ error: 'Erro ao carregar dados de privacidade' });
    }
  });

  app.put('/api/customer/privacy/consents', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const lgpd = resolveLgpdSettings();
      const requiredVersions = resolveRequiredPolicyVersions(lgpd);

      const hasMarketingInput =
        Object.prototype.hasOwnProperty.call(body, 'marketing') ||
        Object.prototype.hasOwnProperty.call(body, 'marketing_accepted');

      const marketingAccepted = parseBooleanSetting(
        Object.prototype.hasOwnProperty.call(body, 'marketing')
          ? body.marketing
          : body.marketing_accepted,
        false,
      );

      // "aceitar politicas obrigatorias" aceita privacidade + termos + cookies
      const acceptRequired = parseBooleanSetting(
        Object.prototype.hasOwnProperty.call(body, 'accept_required')
          ? body.accept_required
          : (Object.prototype.hasOwnProperty.call(body, 'accept_policies_required') ? body.accept_policies_required : body.policy_accept),
        false,
      );

      const privacyAccepted = acceptRequired || parseBooleanSetting(
        Object.prototype.hasOwnProperty.call(body, 'policy_accept')
          ? body.policy_accept
          : body.privacy_accepted,
        false,
      );
      const termsAccepted = acceptRequired || parseBooleanSetting(
        Object.prototype.hasOwnProperty.call(body, 'terms_accept')
          ? body.terms_accept
          : body.terms_accepted,
        false,
      );
      const cookiesAccepted = acceptRequired || parseBooleanSetting(
        Object.prototype.hasOwnProperty.call(body, 'cookies_accept')
          ? body.cookies_accept
          : (Object.prototype.hasOwnProperty.call(body, 'cookie_accepted') ? body.cookie_accepted : body.cookies_accepted),
        false,
      );

      if (hasMarketingInput) {
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'marketing_communications',
          granted: marketingAccepted,
          req,
          source: 'my_account',
          legalBasis: 'consent',
          purpose: 'Envio de comunicacoes e ofertas.',
          policyVersion: lgpd.policyVersionPrivacy,
        });
      }

      const shouldAcceptPrivacy = acceptRequired ? true : privacyAccepted;
      const shouldAcceptTerms = acceptRequired ? lgpd.requireTermsAcceptance : termsAccepted;
      const shouldAcceptCookies = acceptRequired ? lgpd.requireCookieConsent : cookiesAccepted;

      if (shouldAcceptPrivacy) {
        recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'privacy',
          policyVersion: requiredVersions.privacy,
          req,
          source: 'my_account',
        });
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'privacy_policy',
          granted: true,
          req,
          source: 'my_account',
          legalBasis: 'consent',
          purpose: 'Aceite da politica de privacidade.',
          policyVersion: requiredVersions.privacy,
        });
      }

      if (shouldAcceptTerms) {
        recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'terms',
          policyVersion: requiredVersions.terms,
          req,
          source: 'my_account',
        });
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'terms_of_use',
          granted: true,
          req,
          source: 'my_account',
          legalBasis: 'consent',
          purpose: 'Aceite dos termos de uso da plataforma.',
          policyVersion: requiredVersions.terms,
        });
      }
      if (shouldAcceptCookies) {
        recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'cookies',
          policyVersion: requiredVersions.cookies,
          req,
          source: 'my_account',
        });
        upsertUserConsent({
          userId: Number(user.id),
          consentKey: 'cookies_policy',
          granted: true,
          req,
          source: 'my_account',
          legalBasis: 'consent',
          purpose: 'Aceite da politica de cookies.',
          policyVersion: requiredVersions.cookies,
        });
      }

      const freshUser = db.get('SELECT id, name, email FROM users WHERE id = ?', Number(user.id)) as any;
      if (hasMarketingInput && freshUser?.email) {
        sendEmail({
          to: freshUser.email,
          templateKey: 'lgpd_consent_confirmation',
          variables: {
            name: freshUser.name || 'Cliente',
            consent_key: 'marketing_communications',
            consent_status: marketingAccepted ? 'aceito' : 'revogado',
          },
        }).catch((err) => console.error('LGPD consent email error:', err));
      }

      res.json({
        success: true,
        accepted: {
          privacy: shouldAcceptPrivacy,
          terms: shouldAcceptTerms,
          cookies: shouldAcceptCookies,
          marketing: hasMarketingInput ? marketingAccepted : null,
        },
        compliance: ensureUserLgpdCompliance(Number(user.id)),
      });
    } catch (error) {
      console.error('Update privacy consents error:', error);
      res.status(500).json({ error: 'Erro ao atualizar consentimentos' });
    }
  });

  app.post('/api/customer/privacy/request', authenticate, (req, res) => {
    try {
      const user = (req as any).user;
      const { request_type, details = '' } = req.body || {};
      const allowed = ['export', 'delete', 'correction', 'revoke'];
      const normalizedType = String(request_type || '').trim().toLowerCase();
      if (!allowed.includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de solicitacao invalido' });
      }

      const result = db.run(
        `INSERT INTO lgpd_requests (user_id, request_type, status, payload)
         VALUES (?, ?, 'pending', ?)`,
        Number(user.id),
        normalizedType,
        JSON.stringify({ details: String(details || '').slice(0, 4000) }),
      );

      const requestId = Number(result.lastInsertRowid);
      logLgpdEvent({
        req,
        userId: Number(user.id),
        actorUserId: Number(user.id),
        eventType: 'request',
        action: 'request_created',
        details: { request_id: requestId, request_type: normalizedType },
      });

      const freshUser = db.get('SELECT id, name, email FROM users WHERE id = ?', Number(user.id)) as any;
      if (freshUser?.email) {
        sendEmail({
          to: freshUser.email,
          templateKey: 'lgpd_request_received',
          variables: {
            name: freshUser.name || 'Cliente',
            request_type: normalizedType,
            request_id: String(requestId),
          },
        }).catch((err) => console.error('LGPD request email error:', err));
      }

      res.status(201).json({ success: true, id: requestId, status: 'pending' });
    } catch (error) {
      console.error('Create LGPD request error:', error);
      res.status(500).json({ error: 'Erro ao criar solicitacao LGPD' });
    }
  });

  app.get('/api/customer/privacy/export', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const format = String(req.query.format || 'json').toLowerCase();
      const payload = buildUserLgpdExportPayload(Number(user.id));
      if (!payload?.user) return res.status(404).json({ error: 'Usuario nao encontrado' });

      logLgpdEvent({
        req,
        userId: Number(user.id),
        actorUserId: Number(user.id),
        eventType: 'export',
        action: 'self_export',
        details: { format },
      });

      if (format === 'csv') {
        const csvLines = [
          'section,key,value',
          ...Object.entries(payload.user || {}).map(([k, v]) => `user,${k},"${String(v ?? '').replace(/"/g, '""')}"`),
          ...Object.entries(payload.profile || {}).map(([k, v]) => `profile,${k},"${String(v ?? '').replace(/"/g, '""')}"`),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-lgpd.csv"');
        return res.send(csvLines.join('\n'));
      }

      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginX = 40;
        const marginY = 44;
        let cursorY = marginY;

        const addLine = (text: string, isTitle = false) => {
          const fontSize = isTitle ? 14 : 10;
          doc.setFont('helvetica', isTitle ? 'bold' : 'normal');
          doc.setFontSize(fontSize);
          const wrapped = doc.splitTextToSize(text, pageWidth - marginX * 2);
          const estimatedHeight = wrapped.length * (fontSize + 2);
          if (cursorY + estimatedHeight > pageHeight - marginY) {
            doc.addPage();
            cursorY = marginY;
          }
          doc.text(wrapped, marginX, cursorY);
          cursorY += estimatedHeight + 6;
        };

        addLine('Digital Bordados - ExportaÃƒÂ§ÃƒÂ£o LGPD', true);
        addLine(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
        addLine(`UsuÃƒÂ¡rio: ${String(payload.user?.name || '')} (${String(payload.user?.email || '')})`);
        addLine(`Status da conta: ${String(payload.user?.status || '')}`);
        addLine('', false);

        addLine('Dados cadastrais', true);
        Object.entries(payload.user || {}).forEach(([key, value]) => addLine(`${key}: ${String(value ?? '-')}`));
        if (payload.profile) {
          addLine('Perfil do cliente', true);
          Object.entries(payload.profile).forEach(([key, value]) => addLine(`${key}: ${String(value ?? '-')}`));
        }

        addLine(`Pedidos: ${Array.isArray(payload.orders) ? payload.orders.length : 0}`, true);
        (payload.orders as any[]).forEach((order) => {
          addLine(`#${order.id} Ã¢â‚¬Â¢ ${order.status} Ã¢â‚¬Â¢ Total: R$ ${Number(order.total || 0).toFixed(2)} Ã¢â‚¬Â¢ ${String(order.created_at || '')}`);
        });

        addLine(`Itens comprados: ${Array.isArray(payload.order_items) ? payload.order_items.length : 0}`, true);
        (payload.order_items as any[]).forEach((item) => {
          addLine(`#${item.order_id} Ã¢â‚¬Â¢ ${item.product_name} Ã¢â‚¬Â¢ Qtde: ${item.quantity} Ã¢â‚¬Â¢ R$ ${Number(item.price || 0).toFixed(2)}`);
        });

        addLine(`Favoritos: ${Array.isArray(payload.favorites) ? payload.favorites.length : 0}`, true);
        (payload.favorites as any[]).forEach((fav) => addLine(`${fav.product_name || fav.product_id} Ã¢â‚¬Â¢ ${String(fav.created_at || '')}`));

        addLine(`Consentimentos: ${Array.isArray(payload.consents) ? payload.consents.length : 0}`, true);
        (payload.consents as any[]).forEach((consent) => {
          addLine(`${consent.consent_key} Ã¢â‚¬Â¢ ${Number(consent.granted) ? 'ativo' : 'revogado'} Ã¢â‚¬Â¢ versÃƒÂ£o ${consent.policy_version || '-'} Ã¢â‚¬Â¢ ${String(consent.updated_at || '')}`);
        });

        addLine(`Aceites de polÃƒÂ­ticas: ${Array.isArray(payload.policy_acceptances) ? payload.policy_acceptances.length : 0}`, true);
        (payload.policy_acceptances as any[]).forEach((acceptance) => {
          addLine(`${acceptance.policy_type} Ã¢â‚¬Â¢ v${acceptance.policy_version} Ã¢â‚¬Â¢ ${String(acceptance.accepted_at || '')}`);
        });

        addLine(`SolicitaÃƒÂ§ÃƒÂµes LGPD: ${Array.isArray(payload.lgpd_requests) ? payload.lgpd_requests.length : 0}`, true);
        (payload.lgpd_requests as any[]).forEach((requestItem) => {
          addLine(`#${requestItem.id} Ã¢â‚¬Â¢ ${requestItem.request_type} Ã¢â‚¬Â¢ ${requestItem.status} Ã¢â‚¬Â¢ ${String(requestItem.created_at || '')}`);
        });

        const pdfBytes = doc.output('arraybuffer');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-lgpd.pdf"');
        return res.send(Buffer.from(pdfBytes));
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-lgpd.json"');
      return res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.error('LGPD export error:', error);
      res.status(500).json({ error: 'Erro ao exportar dados' });
    }
  });

  app.get('/api/admin/lgpd/policies', authenticate, isAdmin, (req, res) => {
    try {
      const policies = db.all(
        `SELECT id, policy_type, version, title, content, is_active, force_reaccept, published_at, created_at, updated_at
         FROM lgpd_policies
         ORDER BY policy_type ASC, created_at DESC`,
      );
      res.json(policies);
    } catch (error) {
      console.error('Admin LGPD policies error:', error);
      res.status(500).json({ error: 'Erro ao buscar politicas LGPD' });
    }
  });

  app.get('/api/admin/lgpd/policies/diff', authenticate, isAdmin, (req, res) => {
    try {
      const leftId = Number(req.query.left || 0);
      const rightId = Number(req.query.right || 0);
      if (!Number.isFinite(leftId) || leftId <= 0 || !Number.isFinite(rightId) || rightId <= 0) {
        return res.status(400).json({ error: 'Parametros left e right sao obrigatorios' });
      }

      const leftPolicy = db.get(
        'SELECT id, policy_type, version, title, content, is_active, updated_at FROM lgpd_policies WHERE id = ? LIMIT 1',
        leftId,
      ) as any;
      const rightPolicy = db.get(
        'SELECT id, policy_type, version, title, content, is_active, updated_at FROM lgpd_policies WHERE id = ? LIMIT 1',
        rightId,
      ) as any;

      if (!leftPolicy || !rightPolicy) {
        return res.status(404).json({ error: 'Uma ou mais politicas nao foram encontradas' });
      }
      if (String(leftPolicy.policy_type) !== String(rightPolicy.policy_type)) {
        return res.status(400).json({ error: 'As politicas devem ser do mesmo tipo para comparacao' });
      }

      const titleDiff = computePolicyLineDiff(String(leftPolicy.title || ''), String(rightPolicy.title || ''));
      const contentDiff = computePolicyLineDiff(String(leftPolicy.content || ''), String(rightPolicy.content || ''));

      return res.json({
        left: {
          id: leftPolicy.id,
          policy_type: leftPolicy.policy_type,
          version: leftPolicy.version,
          title: leftPolicy.title,
          is_active: Number(leftPolicy.is_active) === 1,
          updated_at: leftPolicy.updated_at,
        },
        right: {
          id: rightPolicy.id,
          policy_type: rightPolicy.policy_type,
          version: rightPolicy.version,
          title: rightPolicy.title,
          is_active: Number(rightPolicy.is_active) === 1,
          updated_at: rightPolicy.updated_at,
        },
        diff: {
          title: titleDiff,
          content: contentDiff,
        },
      });
    } catch (error) {
      console.error('Admin LGPD policy diff error:', error);
      return res.status(500).json({ error: 'Erro ao comparar versoes de politicas' });
    }
  });

  app.get('/api/admin/lgpd/export/user/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const targetUserId = Number(req.params.id);
      const format = String(req.query.format || 'json').toLowerCase();
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ error: 'ID do usuario invalido' });
      }

      const payload = buildUserLgpdExportPayload(targetUserId);
      if (!payload?.user) return res.status(404).json({ error: 'Usuario nao encontrado' });

      logLgpdEvent({
        req,
        userId: targetUserId,
        actorUserId: Number(adminUser.id),
        eventType: 'export',
        action: 'admin_export',
        details: { format },
      });

      if (format === 'csv') {
        const csvLines = [
          'section,key,value',
          ...Object.entries(payload.user || {}).map(([k, v]) => `user,${k},"${String(v ?? '').replace(/"/g, '""')}"`),
          ...Object.entries(payload.profile || {}).map(([k, v]) => `profile,${k},"${String(v ?? '').replace(/"/g, '""')}"`),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="dados-lgpd-usuario-${targetUserId}.csv"`);
        return res.send(csvLines.join('\n'));
      }

      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginX = 40;
        const marginY = 44;
        let cursorY = marginY;

        const addLine = (text: string, isTitle = false) => {
          const fontSize = isTitle ? 14 : 10;
          doc.setFont('helvetica', isTitle ? 'bold' : 'normal');
          doc.setFontSize(fontSize);
          const wrapped = doc.splitTextToSize(text, pageWidth - marginX * 2);
          const estimatedHeight = wrapped.length * (fontSize + 2);
          if (cursorY + estimatedHeight > pageHeight - marginY) {
            doc.addPage();
            cursorY = marginY;
          }
          doc.text(wrapped, marginX, cursorY);
          cursorY += estimatedHeight + 6;
        };

        addLine('Digital Bordados - Exportacao LGPD (Admin)', true);
        addLine(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
        addLine(`Usuario: ${String(payload.user?.name || '')} (${String(payload.user?.email || '')})`);
        addLine(`Status da conta: ${String(payload.user?.status || '')}`);
        addLine('', false);

        addLine('Dados cadastrais', true);
        Object.entries(payload.user || {}).forEach(([key, value]) => addLine(`${key}: ${String(value ?? '-')}`));
        if (payload.profile) {
          addLine('Perfil do cliente', true);
          Object.entries(payload.profile).forEach(([key, value]) => addLine(`${key}: ${String(value ?? '-')}`));
        }

        addLine(`Pedidos: ${Array.isArray(payload.orders) ? payload.orders.length : 0}`, true);
        (payload.orders as any[]).forEach((order) => {
          addLine(`#${order.id} - ${order.status} - Total: R$ ${Number(order.total || 0).toFixed(2)} - ${String(order.created_at || '')}`);
        });

        addLine(`Itens comprados: ${Array.isArray(payload.order_items) ? payload.order_items.length : 0}`, true);
        (payload.order_items as any[]).forEach((item) => {
          addLine(`#${item.order_id} - ${item.product_name} - Qtde: ${item.quantity} - R$ ${Number(item.price || 0).toFixed(2)}`);
        });

        addLine(`Favoritos: ${Array.isArray(payload.favorites) ? payload.favorites.length : 0}`, true);
        (payload.favorites as any[]).forEach((fav) => addLine(`${fav.product_name || fav.product_id} - ${String(fav.created_at || '')}`));

        addLine(`Consentimentos: ${Array.isArray(payload.consents) ? payload.consents.length : 0}`, true);
        (payload.consents as any[]).forEach((consent) => {
          addLine(`${consent.consent_key} - ${Number(consent.granted) ? 'ativo' : 'revogado'} - versao ${consent.policy_version || '-'} - ${String(consent.updated_at || '')}`);
        });

        addLine(`Aceites de politicas: ${Array.isArray(payload.policy_acceptances) ? payload.policy_acceptances.length : 0}`, true);
        (payload.policy_acceptances as any[]).forEach((acceptance) => {
          addLine(`${acceptance.policy_type} - v${acceptance.policy_version} - ${String(acceptance.accepted_at || '')}`);
        });

        addLine(`Solicitacoes LGPD: ${Array.isArray(payload.lgpd_requests) ? payload.lgpd_requests.length : 0}`, true);
        (payload.lgpd_requests as any[]).forEach((requestItem) => {
          addLine(`#${requestItem.id} - ${requestItem.request_type} - ${requestItem.status} - ${String(requestItem.created_at || '')}`);
        });

        const pdfBytes = doc.output('arraybuffer');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="dados-lgpd-usuario-${targetUserId}.pdf"`);
        return res.send(Buffer.from(pdfBytes));
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dados-lgpd-usuario-${targetUserId}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.error('Admin LGPD export user error:', error);
      return res.status(500).json({ error: 'Erro ao exportar dados do usuario' });
    }
  });

  app.post('/api/admin/lgpd/policies', authenticate, isAdmin, (req, res) => {
    try {
      const adminUser = (req as any).user;
      const { policy_type, version, title, content, is_active = false, force_reaccept = false } = req.body || {};
      const normalizedType = String(policy_type || '').toLowerCase();
      if (!['privacy', 'terms', 'cookies'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de politica invalido' });
      }
      if (!version || !title || !content) {
        return res.status(400).json({ error: 'version, title e content sao obrigatorios' });
      }

      const result = db.run(
        `INSERT INTO lgpd_policies (policy_type, version, title, content, is_active, force_reaccept, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        normalizedType,
        String(version).trim(),
        String(title).trim(),
        String(content),
        parseBooleanSetting(is_active, false) ? 1 : 0,
        parseBooleanSetting(force_reaccept, false) ? 1 : 0,
        Number(adminUser.id),
      );

      if (parseBooleanSetting(is_active, false)) {
        db.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ? AND id <> ?', normalizedType, Number(result.lastInsertRowid));
        if (normalizedType === 'privacy') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(version).trim());
        if (normalizedType === 'terms') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(version).trim());
        if (normalizedType === 'cookies') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(version).trim());
      }

      if (parseBooleanSetting(force_reaccept, false)) {
        db.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      if (parseBooleanSetting(is_active, false)) {
        const lgpd = resolveLgpdSettings();
        const policyUrl =
          normalizedType === 'privacy'
            ? lgpd.privacyUrl
            : normalizedType === 'terms'
              ? lgpd.termsUrl
              : lgpd.cookiePolicyUrl;
        notifyCustomersPolicyUpdated({
          policyType: normalizedType as 'privacy' | 'terms' | 'cookies',
          policyVersion: String(version).trim(),
          policyUrl,
          actorUserId: Number(adminUser.id),
          req,
        });
      }

      logLgpdEvent({
        req,
        actorUserId: Number(adminUser.id),
        eventType: 'policy',
        action: 'policy_created',
        details: { policy_type: normalizedType, version: String(version).trim(), force_reaccept: parseBooleanSetting(force_reaccept, false) },
      });

      res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
    } catch (error: any) {
      console.error('Create policy error:', error);
      if (String(error?.message || '').includes('uq_lgpd_policy_type_version') || error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ja existe uma politica com este tipo e versao' });
      }
      res.status(500).json({ error: 'Erro ao criar politica LGPD' });
    }
  });

  app.put('/api/admin/lgpd/policies/:id', authenticate, isAdmin, (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policyId = Number(req.params.id);
      if (!Number.isFinite(policyId) || policyId <= 0) {
        return res.status(400).json({ error: 'ID da politica invalido' });
      }

      const currentPolicy = db.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', policyId) as any;
      if (!currentPolicy) {
        return res.status(404).json({ error: 'Politica nao encontrada' });
      }

      const {
        policy_type = currentPolicy.policy_type,
        version = currentPolicy.version,
        title = currentPolicy.title,
        content = currentPolicy.content,
        is_active = Number(currentPolicy.is_active) === 1,
        force_reaccept = Number(currentPolicy.force_reaccept) === 1,
      } = req.body || {};

      const normalizedType = String(policy_type || '').trim().toLowerCase();
      const normalizedVersion = String(version || '').trim();
      const normalizedTitle = String(title || '').trim();
      const normalizedContent = String(content || '');

      if (!['privacy', 'terms', 'cookies'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de politica invalido' });
      }
      if (!normalizedVersion || !normalizedTitle || !normalizedContent) {
        return res.status(400).json({ error: 'version, title e content sao obrigatorios' });
      }

      const duplicated = db.get(
        'SELECT id FROM lgpd_policies WHERE policy_type = ? AND version = ? AND id <> ? LIMIT 1',
        normalizedType,
        normalizedVersion,
        policyId,
      ) as any;
      if (duplicated) {
        return res.status(409).json({ error: 'Ja existe outra politica com este tipo e versao' });
      }

      db.run(
        `UPDATE lgpd_policies
         SET policy_type = ?, version = ?, title = ?, content = ?, is_active = ?, force_reaccept = ?
         WHERE id = ?`,
        normalizedType,
        normalizedVersion,
        normalizedTitle,
        normalizedContent,
        parseBooleanSetting(is_active, false) ? 1 : 0,
        parseBooleanSetting(force_reaccept, false) ? 1 : 0,
        policyId,
      );

      if (parseBooleanSetting(is_active, false)) {
        db.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ? AND id <> ?', normalizedType, policyId);
        if (normalizedType === 'privacy') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', normalizedVersion);
        if (normalizedType === 'terms') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', normalizedVersion);
        if (normalizedType === 'cookies') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', normalizedVersion);
      }

      if (parseBooleanSetting(force_reaccept, false)) {
        db.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      if (parseBooleanSetting(is_active, false)) {
        const lgpd = resolveLgpdSettings();
        const policyUrl =
          normalizedType === 'privacy'
            ? lgpd.privacyUrl
            : normalizedType === 'terms'
              ? lgpd.termsUrl
              : lgpd.cookiePolicyUrl;
        notifyCustomersPolicyUpdated({
          policyType: normalizedType as 'privacy' | 'terms' | 'cookies',
          policyVersion: normalizedVersion,
          policyUrl,
          actorUserId: Number(adminUser.id),
          req,
        });
      }

      logLgpdEvent({
        req,
        actorUserId: Number(adminUser.id),
        eventType: 'policy',
        action: 'policy_updated',
        details: {
          policy_id: policyId,
          policy_type: normalizedType,
          version: normalizedVersion,
          force_reaccept: parseBooleanSetting(force_reaccept, false),
        },
      });

      return res.json({ success: true, id: policyId });
    } catch (error: any) {
      console.error('Update policy error:', error);
      if (String(error?.message || '').includes('uq_lgpd_policy_type_version') || error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ja existe outra politica com este tipo e versao' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar politica LGPD' });
    }
  });

  app.delete('/api/admin/lgpd/policies/:id', authenticate, isAdmin, (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policyId = Number(req.params.id);
      if (!Number.isFinite(policyId) || policyId <= 0) {
        return res.status(400).json({ error: 'ID da politica invalido' });
      }

      const policy = db.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', policyId) as any;
      if (!policy) {
        return res.status(404).json({ error: 'Politica nao encontrada' });
      }

      const policyType = String(policy.policy_type || '');
      const isActive = Number(policy.is_active) === 1;

      if (isActive) {
        const replacement = db.get(
          `SELECT id
             FROM lgpd_policies
            WHERE policy_type = ?
              AND id <> ?
            ORDER BY is_active DESC, updated_at DESC, id DESC
            LIMIT 1`,
          policyType,
          policyId,
        ) as any;

        if (!replacement?.id) {
          return res.status(409).json({
            error: 'Nao e possivel excluir a unica politica deste tipo. Crie ou ative outra versao antes de excluir.',
          });
        }

        db.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ?', policyType);
        db.run('UPDATE lgpd_policies SET is_active = 1 WHERE id = ?', Number(replacement.id));

        const replacementPolicy = db.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', Number(replacement.id)) as any;
        if (replacementPolicy) {
          if (policyType === 'privacy') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(replacementPolicy.version || '1.0'));
          if (policyType === 'terms') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(replacementPolicy.version || '1.0'));
          if (policyType === 'cookies') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(replacementPolicy.version || '1.0'));
        }
      }

      db.run('DELETE FROM lgpd_policies WHERE id = ?', policyId);

      logLgpdEvent({
        req,
        actorUserId: Number(adminUser.id),
        eventType: 'policy',
        action: 'policy_deleted',
        details: {
          policy_id: policyId,
          policy_type: policyType,
          version: String(policy.version || ''),
          was_active: isActive,
        },
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Delete policy error:', error);
      return res.status(500).json({ error: 'Erro ao excluir politica LGPD' });
    }
  });

  app.post('/api/admin/lgpd/policies/:id/activate', authenticate, isAdmin, (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policy = db.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', Number(req.params.id)) as any;
      if (!policy) return res.status(404).json({ error: 'Politica nao encontrada' });

      db.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ?', policy.policy_type);
      db.run('UPDATE lgpd_policies SET is_active = 1 WHERE id = ?', Number(policy.id));

      if (policy.policy_type === 'privacy') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(policy.version));
      if (policy.policy_type === 'terms') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(policy.version));
      if (policy.policy_type === 'cookies') db.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(policy.version));

      if (parseBooleanSetting(req.body?.force_reaccept, false) || Number(policy.force_reaccept) === 1) {
        db.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      const lgpd = resolveLgpdSettings();
      const policyUrl =
        policy.policy_type === 'privacy'
          ? lgpd.privacyUrl
          : policy.policy_type === 'terms'
            ? lgpd.termsUrl
            : lgpd.cookiePolicyUrl;
      notifyCustomersPolicyUpdated({
        policyType: String(policy.policy_type) as 'privacy' | 'terms' | 'cookies',
        policyVersion: String(policy.version),
        policyUrl,
        actorUserId: Number(adminUser.id),
        req,
      });

      logLgpdEvent({
        req,
        actorUserId: Number(adminUser.id),
        eventType: 'policy',
        action: 'policy_activated',
        details: { policy_id: policy.id, policy_type: policy.policy_type, version: policy.version },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Activate policy error:', error);
      res.status(500).json({ error: 'Erro ao ativar politica LGPD' });
    }
  });

  app.get('/api/admin/lgpd/consents', authenticate, isAdmin, (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(500, Math.max(10, Number(req.query.limit || 100)));
      const offset = (page - 1) * limit;
      const where: string[] = [];
      const params: any[] = [];

      const q = String(req.query.q || '').trim();
      const consentKey = String(req.query.consent_key || '').trim().toLowerCase();
      const grantedRaw = String(req.query.granted || '').trim().toLowerCase();
      const userId = Number(req.query.user_id || 0);
      const ip = String(req.query.ip || '').trim();
      const from = normalizeDateFilter(req.query.from, false);
      const to = normalizeDateFilter(req.query.to, true);

      if (q) {
        where.push('(u.name LIKE ? OR u.email LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
      }
      if (consentKey) {
        where.push('LOWER(c.consent_key) = ?');
        params.push(consentKey);
      }
      if (grantedRaw) {
        const granted = ['1', 'true', 'yes', 'on'].includes(grantedRaw) ? 1 : 0;
        where.push('c.granted = ?');
        params.push(granted);
      }
      if (Number.isFinite(userId) && userId > 0) {
        where.push('c.user_id = ?');
        params.push(userId);
      }
      if (ip) {
        where.push('c.ip LIKE ?');
        params.push(`%${ip}%`);
      }
      if (from) {
        where.push('c.updated_at >= ?');
        params.push(from);
      }
      if (to) {
        where.push('c.updated_at <= ?');
        params.push(to);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const countRow = db.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_consents c
         JOIN users u ON u.id = c.user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = db.all(
        `SELECT c.id, c.user_id, u.name AS user_name, u.email AS user_email, c.consent_key, c.granted, c.legal_basis,
                c.source, c.policy_version, c.updated_at, c.revoked_at, c.ip
         FROM lgpd_consents c
         JOIN users u ON u.id = c.user_id
         ${whereClause}
         ORDER BY c.updated_at DESC
         LIMIT ? OFFSET ?`,
        ...params,
        limit,
        offset,
      );

      if (parseBooleanSetting(req.query.flat, false)) {
        return res.json(rows);
      }
      return res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
      });
    } catch (error) {
      console.error('Admin consents error:', error);
      res.status(500).json({ error: 'Erro ao buscar consentimentos LGPD' });
    }
  });

  app.put('/api/admin/lgpd/consents/:id', authenticate, isAdmin, (req, res) => {
    try {
      const adminUser = (req as any).user;
      const consentId = Number(req.params.id);
      if (!Number.isFinite(consentId) || consentId <= 0) {
        return res.status(400).json({ error: 'ID de consentimento invÃ¡lido' });
      }

      const consent = db.get(
        `SELECT c.*, u.email AS user_email
         FROM lgpd_consents c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = ?
         LIMIT 1`,
        consentId,
      ) as any;

      if (!consent) {
        return res.status(404).json({ error: 'Consentimento nÃ£o encontrado' });
      }

      const granted = parseBooleanSetting(req.body?.granted, false);
      const reason = String(req.body?.reason || '').trim().slice(0, 300);

      upsertUserConsent({
        userId: Number(consent.user_id),
        consentKey: String(consent.consent_key || ''),
        granted,
        req,
        source: 'admin_panel',
        legalBasis: String(consent.legal_basis || 'consent'),
        purpose: reason || String(consent.purpose || 'atualizacao administrativa'),
        policyVersion: consent.policy_version ? String(consent.policy_version) : null,
      });

      logLgpdEvent({
        req,
        userId: Number(consent.user_id),
        actorUserId: Number(adminUser.id),
        eventType: 'consent',
        action: 'admin_consent_update',
        details: {
          consent_id: consentId,
          consent_key: String(consent.consent_key || ''),
          previous_granted: Number(consent.granted) ? 1 : 0,
          new_granted: granted ? 1 : 0,
          reason: reason || null,
        },
      });

      return res.json({ success: true, granted });
    } catch (error) {
      console.error('Admin update consent error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar consentimento LGPD' });
    }
  });

  app.get('/api/admin/lgpd/requests', authenticate, isAdmin, (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(500, Math.max(10, Number(req.query.limit || 100)));
      const offset = (page - 1) * limit;
      const status = String(req.query.status || '').trim().toLowerCase();
      const requestType = String(req.query.request_type || '').trim().toLowerCase();
      const q = String(req.query.q || '').trim();
      const from = normalizeDateFilter(req.query.from, false);
      const to = normalizeDateFilter(req.query.to, true);
      const params: any[] = [];
      const where: string[] = [];
      if (status) {
        where.push('r.status = ?');
        params.push(status);
      }
      if (requestType) {
        where.push('r.request_type = ?');
        params.push(requestType);
      }
      if (q) {
        where.push('(u.name LIKE ? OR u.email LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
      }
      if (from) {
        where.push('r.created_at >= ?');
        params.push(from);
      }
      if (to) {
        where.push('r.created_at <= ?');
        params.push(to);
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const countRow = db.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_requests r
         JOIN users u ON u.id = r.user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = db.all(
        `SELECT r.*, u.name AS user_name, u.email AS user_email, a.name AS handled_by_name
         FROM lgpd_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users a ON a.id = r.handled_by
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        ...params,
        limit,
        offset,
      );
      if (parseBooleanSetting(req.query.flat, false)) {
        return res.json(rows);
      }
      return res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
      });
    } catch (error) {
      console.error('Admin requests error:', error);
      res.status(500).json({ error: 'Erro ao buscar solicitacoes LGPD' });
    }
  });

  app.put('/api/admin/lgpd/requests/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const requestId = Number(req.params.id);
      const { status, response_notes = '' } = req.body || {};
      const normalizedStatus = String(status || '').trim().toLowerCase();
      if (!['pending', 'in_review', 'completed', 'refused'].includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Status invalido' });
      }

      const requestRow = db.get('SELECT * FROM lgpd_requests WHERE id = ?', requestId) as any;
      if (!requestRow) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      const targetUser = db.get('SELECT id, name, email FROM users WHERE id = ?', Number(requestRow.user_id)) as any;

      db.run(
        `UPDATE lgpd_requests
         SET status = ?, response_notes = ?, handled_by = ?, handled_at = CASE WHEN ? IN ('completed','refused') THEN CURRENT_TIMESTAMP ELSE handled_at END
         WHERE id = ?`,
        normalizedStatus,
        String(response_notes || '').slice(0, 5000),
        Number(adminUser.id),
        normalizedStatus,
        requestId,
      );

      if (normalizedStatus === 'completed' && String(requestRow.request_type) === 'delete') {
        const targetUserId = Number(requestRow.user_id);
        const targetUserBeforeAnonymize = db.get('SELECT email, name FROM users WHERE id = ?', targetUserId) as any;
        db.run(
          `UPDATE users
           SET name = CONCAT('Usuario ', id), email = CONCAT('anon+', id, '@anon.local'),
               phone = NULL, cpf = NULL, first_name = NULL, last_name = NULL,
               avatar_url = NULL, status = 'inactive', anonymized_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          targetUserId,
        );
        db.run('UPDATE customers SET phone = NULL, cpf = NULL, address = NULL, city = NULL, state = NULL, zip = NULL, country = NULL, billing_address = NULL, billing_city = NULL, billing_neighborhood = NULL, billing_state = NULL, billing_zip = NULL, billing_country = NULL, shipping_address = NULL, shipping_city = NULL, shipping_neighborhood = NULL, shipping_state = NULL, shipping_zip = NULL, shipping_country = NULL WHERE user_id = ?', targetUserId);
        db.run('DELETE FROM favorites WHERE user_id = ?', targetUserId);
        db.run('UPDATE lgpd_consents SET granted = 0, revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?', targetUserId);
        db.run('DELETE FROM download_tokens WHERE user_id = ?', targetUserId);
        db.run('DELETE FROM email_verification_tokens WHERE user_id = ?', targetUserId);
        db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', targetUserId);
        db.run('DELETE FROM login_attempts WHERE email = ?', String(targetUserBeforeAnonymize?.email || ''));

        if (targetUserBeforeAnonymize?.email) {
          sendEmail({
            to: targetUserBeforeAnonymize.email,
            templateKey: 'lgpd_deletion_completed',
            variables: { name: targetUserBeforeAnonymize.name || 'Cliente' },
          }).catch((err) => console.error('LGPD deletion email error:', err));
        }
      }

      if (normalizedStatus === 'completed' && String(requestRow.request_type) === 'export' && targetUser?.email) {
        const settings = loadSettingsMap(['app_url', 'lgpd_export_ttl_hours']);
        const appUrl = String(settings.app_url || process.env.APP_URL || 'https://digitalbordados.com.br').replace(/\/$/, '');
        const downloadUrl = `${appUrl}/minha-conta/privacidade`;
        const expiresIn = String(settings.lgpd_export_ttl_hours || '24');
        sendEmail({
          to: targetUser.email,
          templateKey: 'lgpd_export_ready',
          variables: {
            name: targetUser.name || 'Cliente',
            download_url: downloadUrl,
            expires_in: expiresIn,
          },
        }).catch((err) => console.error('LGPD export-ready email error:', err));
      }

      logLgpdEvent({
        req,
        userId: Number(requestRow.user_id),
        actorUserId: Number(adminUser.id),
        eventType: 'request',
        action: 'request_status_changed',
        details: { request_id: requestId, status: normalizedStatus },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Update request status error:', error);
      res.status(500).json({ error: 'Erro ao atualizar solicitacao LGPD' });
    }
  });

  app.get('/api/admin/lgpd/logs', authenticate, isAdmin, (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(1000, Math.max(20, Number(req.query.limit || 200)));
      const offset = (page - 1) * limit;
      const where: string[] = [];
      const params: any[] = [];
      const eventType = String(req.query.event_type || '').trim().toLowerCase();
      const action = String(req.query.action || '').trim().toLowerCase();
      const q = String(req.query.q || '').trim();
      const ip = String(req.query.ip || '').trim();
      const from = normalizeDateFilter(req.query.from, false);
      const to = normalizeDateFilter(req.query.to, true);
      const userId = Number(req.query.user_id || 0);
      const actorUserId = Number(req.query.actor_user_id || 0);

      if (eventType) {
        where.push('LOWER(l.event_type) = ?');
        params.push(eventType);
      }
      if (action) {
        where.push('LOWER(l.action) = ?');
        params.push(action);
      }
      if (q) {
        where.push('(u.name LIKE ? OR u.email LIKE ? OR a.name LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (ip) {
        where.push('l.ip LIKE ?');
        params.push(`%${ip}%`);
      }
      if (Number.isFinite(userId) && userId > 0) {
        where.push('l.user_id = ?');
        params.push(userId);
      }
      if (Number.isFinite(actorUserId) && actorUserId > 0) {
        where.push('l.actor_user_id = ?');
        params.push(actorUserId);
      }
      if (from) {
        where.push('l.created_at >= ?');
        params.push(from);
      }
      if (to) {
        where.push('l.created_at <= ?');
        params.push(to);
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const countRow = db.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_logs l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN users a ON a.id = l.actor_user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = db.all(
        `SELECT l.*, u.name AS user_name, u.email AS user_email, a.name AS actor_name
         FROM lgpd_logs l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN users a ON a.id = l.actor_user_id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        ...params,
        limit,
        offset,
      );
      if (parseBooleanSetting(req.query.flat, false)) {
        return res.json(rows);
      }
      return res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
      });
    } catch (error) {
      console.error('Admin LGPD logs error:', error);
      res.status(500).json({ error: 'Erro ao carregar logs LGPD' });
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
      return res.status(400).json({ error: 'Nome da tag ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
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
      return res.status(400).json({ error: 'total invÃƒÂ¡lido' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items ÃƒÂ© obrigatÃƒÂ³rio e deve conter ao menos 1 item' });
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
      return res.status(400).json({ error: 'items invÃƒÂ¡lidos' });
    }

    const rawUserId = user_id === null || user_id === undefined || user_id === '' ? null : Number(user_id);
    if (rawUserId !== null && (!Number.isInteger(rawUserId) || rawUserId <= 0)) {
      return res.status(400).json({ error: 'user_id invÃƒÂ¡lido' });
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

      if (!order) return res.status(404).json({ error: 'Pedido nÃƒÆ’Ã‚Â£o encontrado' });

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
      const page = Math.max(1, Number(req.query.page || 1));
      const limitRaw = Number(req.query.limit || 20);
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
      const offset = (page - 1) * limit;
      const searchTerm = String(req.query.search || '').trim().toLowerCase();
      const roleFilter = String(req.query.role || 'all').trim().toLowerCase();
      const { whereClause, params } = buildUsersBaseQuery({ searchTerm, roleFilter });

      const totalRow = db.get(`
        SELECT COUNT(*) AS total
        FROM users u
        ${whereClause}
      `, ...params) as any;
      const total = Number(totalRow?.total || 0);

      const users = db.all(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
          (SELECT SUM(total) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') as total_spent
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `, ...params, limit, offset);

      res.json({
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      console.error('Admin Fetch Users Error:', error);
      res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
  });

  app.get('/api/admin/users/export', authenticate, isAdmin, (req, res) => {
    try {
      const format = String(req.query.format || 'csv').trim().toLowerCase();
      const searchTerm = String(req.query.search || '').trim().toLowerCase();
      const roleFilter = String(req.query.role || 'all').trim().toLowerCase();
      const { whereClause, params } = buildUsersBaseQuery({ searchTerm, roleFilter });

      const users = db.all(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
          (SELECT SUM(total) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') as total_spent
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        ${whereClause}
        ORDER BY u.created_at DESC
      `, ...params) as any[];

      const headers = [
        'ID', 'Nome', 'Email', 'Cargo', 'Status', 'DataCadastro',
        'Pedidos', 'TotalGasto', 'Telefone', 'CPF', 'PrimeiroNome', 'Sobrenome',
        'DataRegistro', 'Endereco', 'Cidade', 'Estado', 'CEP', 'Pais',
      ];
      const lines = users.map((u) => [
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.created_at,
        Number(u.order_count || 0),
        Number(u.total_spent || 0).toFixed(2),
        u.phone || '',
        u.cpf || '',
        u.first_name || '',
        u.last_name || '',
        u.date_registered || '',
        u.address || '',
        u.city || '',
        u.state || '',
        u.zip || '',
        u.country || '',
      ]);

      if (format === 'excel' || format === 'xls') {
        const tableRows = lines
          .map((cols) => `<tr>${cols.map((col) => `<td>${String(col ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`)
          .join('');
        const tableHeader = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table border="1">${tableHeader}${tableRows}</table></body></html>`;
        const filename = `clientes_${new Date().toISOString().slice(0, 10)}.xls`;
        res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(html);
      }

      const csvRows = [
        headers.map(escapeCsvValue).join(';'),
        ...lines.map((cols) => cols.map(escapeCsvValue).join(';')),
      ];
      const csv = `\uFEFF${csvRows.join('\n')}`;
      const filename = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (error) {
      console.error('Admin Export Users Error:', error);
      return res.status(500).json({ error: 'Erro ao exportar clientes' });
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
      return res.status(400).json({ error: 'Nome, e-mail e senha sÃƒÆ’Ã‚Â£o obrigatÃƒÆ’Ã‚Â³rios' });
    }

    const existingUser = db.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
    if (existingUser) {
      return res.status(409).json({ error: 'E-mail jÃƒÆ’Ã‚Â¡ cadastrado' });
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
        return res.status(409).json({ error: 'E-mail jÃƒÆ’Ã‚Â¡ cadastrado' });
      }
      console.error('Admin Create User Error:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar usuÃƒÆ’Ã‚Â¡rio' });
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
      return res.status(400).json({ error: 'name, email e password sÃƒÂ£o obrigatÃƒÂ³rios' });
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
      return res.status(500).json({ error: 'Erro ao importar usuÃƒÂ¡rio' });
    }
  });

  const adminUpdateUserHandler = async (req: express.Request, res: express.Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'ID de usuÃƒÂ¡rio invÃƒÂ¡lido' });
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
      return res.status(400).json({ error: 'Nome e e-mail sÃƒÂ£o obrigatÃƒÂ³rios' });
    }

    const existingUser = db.get('SELECT id FROM users WHERE id = ?', userId) as any;
    if (!existingUser) {
      return res.status(404).json({ error: 'UsuÃƒÂ¡rio nÃƒÂ£o encontrado' });
    }

    const duplicateEmail = db.get('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, userId) as any;
    if (duplicateEmail) {
      return res.status(409).json({ error: 'E-mail jÃƒÂ¡ cadastrado' });
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
      return res.status(500).json({ error: 'Erro ao atualizar usuÃƒÂ¡rio' });
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
      res.status(500).json({ error: 'Erro ao atualizar cargo do usuÃƒÆ’Ã‚Â¡rio' });
    }
  });

  app.delete('/api/admin/users/:id', authenticate, isAdmin, (req, res) => {
    try {
      // Don't allow deleting self
      if (req.params.id === (req as any).user.id.toString()) {
        return res.status(400).json({ error: 'VocÃƒÆ’Ã‚Âª nÃƒÆ’Ã‚Â£o pode excluir a si mesmo' });
      }
      db.run('DELETE FROM users WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Delete User Error:', error);
      res.status(500).json({ error: 'Erro ao excluir usuÃƒÆ’Ã‚Â¡rio' });
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
      res.status(500).json({ error: 'Erro ao buscar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
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
      res.status(500).json({ error: 'Erro ao atualizar configuraÃƒÂ§ÃƒÂµes' });
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
        return res.status(400).json({ connected: false, error: 'Access Token nÃƒÂ£o informado.' });
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
        error: 'Erro ao testar conexÃƒÂ£o com Mercado Pago.',
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
      if (!template) return res.status(404).json({ error: 'Template nÃƒÂ£o encontrado' });
      res.json(template);
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: 'Erro ao buscar template' });
    }
  });

  app.put('/api/admin/email-templates/:key', authenticate, isAdmin, (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) return res.status(400).json({ error: 'Subject e body sÃƒÂ£o obrigatÃƒÂ³rios' });

      const changes = db.run(
        'UPDATE email_templates SET subject = ?, body = ? WHERE `key` = ?',
        subject, body, req.params.key
      );

      if (changes.changes === 0) return res.status(404).json({ error: 'Template nÃƒÂ£o encontrado' });
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
      if (!to || !template_key) return res.status(400).json({ error: 'DestinatÃƒÂ¡rio e template_key sÃƒÂ£o obrigatÃƒÂ³rios' });

      const testVars = {
        name: 'UsuÃƒÂ¡rio Teste',
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
          subject: 'Bem-vindo(a) ÃƒÂ  {{store_name}}! Ã°Å¸Å½â€°',
          variables: '["name", "email", "login_url"]',
          body: `<div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    {{#if store_logo}}<img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 60px;">{{else}}<h2>{{store_name}}</h2>{{/if}}
  </div>
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    <h1 style="color: #1e293b; margin-top: 0;">OlÃƒÂ¡, {{name}}!</h1>
    <p style="color: #475569; font-size: 16px; line-height: 1.6;">Que alegria ter vocÃƒÂª conosco. Sua conta foi criada com sucesso e vocÃƒÂª jÃƒÂ¡ pode explorar todas as nossas matrizes de bordado.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{login_url}}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar Minha Conta</a>
    </div>
    <p style="color: #475569; font-size: 14px;">Seu e-mail de acesso ÃƒÂ©: <strong>{{email}}</strong></p>
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
      // PerÃƒÂ­odo Atual (30 dias)
      const currentStats = db.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // PerÃƒÂ­odo Anterior (30-60 dias atrÃƒÂ¡s) para cÃƒÂ¡lculo de tendÃƒÂªncia
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

      // FunÃƒÂ§ÃƒÂµes de cÃƒÂ¡lculo de tendÃƒÂªncia
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

      // GrÃƒÂ¡fico de Vendas
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

      // MÃƒÂ©todos de Pagamento
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
      res.status(500).json({ error: 'Erro ao buscar dados dos relatÃƒÂ³rios' });
    }
  });

  // API Routes - CONTENT
  app.get('/api/settings', (req, res) => {
    try {
      const cached = apiCache.get('public_settings');
      if (cached) return res.json(cached);

      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "address", "contact_hours", "contact_whatsapp", "support_whatsapp", "support_email", "new_badge_days", "redirect_to_checkout_after_add_to_cart", "brand_logos", "facebook_url", "instagram_url", "youtube_url", "lgpd_enabled", "lgpd_require_consent_register", "lgpd_require_checkout_consent", "lgpd_require_marketing_optin", "lgpd_require_cookie_consent", "lgpd_require_policy_acceptance", "lgpd_require_terms_acceptance", "lgpd_dpo_name", "lgpd_dpo_email", "lgpd_dpo_phone", "lgpd_privacy_url", "lgpd_terms_url", "lgpd_cookie_policy_url", "lgpd_policy_version_privacy", "lgpd_policy_version_terms", "lgpd_policy_version_cookies")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);
    } catch (error) {
      console.error('Fetch Public Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
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
        is_new: resolveProductIsNew(product, newBadgeDays),
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
        is_new: resolveProductIsNew(productRow, newBadgeDays),
      };

      // Related products (all shared categories: primary + extra relations)
      const categoryRows = db.all(`
        SELECT DISTINCT category_id
        FROM product_category_relations
        WHERE product_id = ? AND category_id IS NOT NULL
      `, product.id) as any[];

      const categoryIds = Array.from(
        new Set(
          [product.category_id, ...categoryRows.map((row) => row.category_id)]
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0),
        ),
      );

      let relatedRows: any[] = [];
      if (categoryIds.length > 0) {
        const placeholders = categoryIds.map(() => '?').join(', ');
        relatedRows = db.all(`
          SELECT DISTINCT
            p.*,
            CASE
              WHEN p.category_id IN (${placeholders}) OR pcr.category_id IN (${placeholders}) THEN 2
              ELSE 0
            END AS relevance_score
          FROM products p
          LEFT JOIN product_category_relations pcr ON pcr.product_id = p.id
          WHERE p.id != ?
            AND p.status = 'active'
          ORDER BY relevance_score DESC, p.created_at DESC, p.id DESC
        `, ...categoryIds, ...categoryIds, product.id) as any[];
      } else {
        relatedRows = db.all(`
          SELECT p.*
          FROM products p
          WHERE p.id != ?
            AND p.status = 'active'
          ORDER BY p.created_at DESC, p.id DESC
        `, product.id) as any[];
      }

      const relatedProducts = relatedRows.map((relatedProduct) => ({
        ...relatedProduct,
        is_new: resolveProductIsNew(relatedProduct, newBadgeDays),
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
      const gallery = Array.from(
        new Set(
          galleryRows
            .map((row) => normalizePublicMediaUrl(row?.url))
            .filter(Boolean),
        ),
      );

      const normalizedProduct = {
        ...product,
        image: normalizePublicMediaUrl(product?.image),
        production_sheet: normalizePublicMediaUrl(product?.production_sheet),
      };
      const normalizedRelatedProducts = relatedProducts.map((relatedProduct) => ({
        ...relatedProduct,
        image: normalizePublicMediaUrl(relatedProduct?.image),
      }));

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[api/products/:slug] production_sheet raw:', product?.production_sheet);
        console.debug('[api/products/:slug] production_sheet normalized:', normalizedProduct.production_sheet);
        console.debug('[api/products/:slug] gallery normalized:', gallery);
      }

      res.json({ ...normalizedProduct, gallery, relatedProducts: normalizedRelatedProducts });
    } catch (error) {
      console.error('Error fetching product detail:', error);
      res.status(500).json({ error: 'Erro interno ao buscar produto' });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Reviews Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  app.get('/api/products/:slug/reviews', (req, res) => {
    try {
      const { slug } = req.params;
      const product = db.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });

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
      res.status(500).json({ error: 'Erro ao buscar avaliaÃƒÂ§ÃƒÂµes' });
    }
  });

  app.post('/api/products/:slug/reviews', authenticate, (req, res) => {
    try {
      const { slug } = req.params;
      const { rating, comment } = req.body;
      const user = (req as any).user;

      if (!rating || !comment) {
        return res.status(400).json({ error: 'Nota e comentÃƒÂ¡rio sÃƒÂ£o obrigatÃƒÂ³rios' });
      }

      const product = db.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });

      db.run(`
        INSERT INTO reviews (user_id, product_id, rating, comment, status) 
        VALUES (?, ?, ?, ?, 'approved')
      `, user.id, product.id, rating, comment);

      res.json({ success: true });
    } catch (error) {
      console.error('Submit review error:', error);
      res.status(500).json({ error: 'Erro ao enviar avaliaÃƒÂ§ÃƒÂ£o' });
    }
  });



  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PayPal Utilities Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PayPal Endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  // POST /api/paypal/create-order
  app.post('/api/paypal/create-order', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const freshUser = getUserById(Number(user?.id || 0));
      if (!freshUser) return res.status(401).json({ error: 'Usuario nao encontrado' });
      if (freshUser.status !== 'ativo' && freshUser.status !== 'active') {
        return res.status(403).json({ error: 'Conta inativa' });
      }
      if (resolveEmailVerificationRequired() && !freshUser.email_verified_at) {
        return res.status(403).json({ error: 'Confirme seu e-mail para finalizar compras.', code: 'EMAIL_NOT_VERIFIED' });
      }

      const { items, checkout_data_processing_accepted } = req.body || {};
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Carrinho vazio' });
      }

      const lgpd = resolveLgpdSettings();
      if (lgpd.enabled) {
        const lgpdCompliance = ensureUserLgpdCompliance(Number(freshUser.id));
        if (!lgpdCompliance.ok) {
          return res.status(403).json({
            error: 'Aceite as polÃƒÂ­ticas de privacidade e termos para concluir a compra.',
            code: lgpdCompliance.code,
            missing: lgpdCompliance.missing,
          });
        }

        if (lgpd.requireCheckoutConsent && !parseBooleanSetting(checkout_data_processing_accepted, false)) {
          return res.status(403).json({
            error: 'Ãƒâ€° necessÃƒÂ¡rio consentir com o processamento de dados para finalizar a compra.',
            code: 'LGPD_CHECKOUT_CONSENT_REQUIRED',
          });
        }

        if (parseBooleanSetting(checkout_data_processing_accepted, false)) {
          upsertUserConsent({
            userId: Number(freshUser.id),
            consentKey: 'checkout_data_processing',
            granted: true,
            source: 'checkout_paypal',
            policyVersion: lgpd.policyVersionPrivacy,
            req,
          });
        }
      }

      const cfg = getPayPalConfig();
      if (!cfg.enabled) return res.status(400).json({ error: 'PayPal nÃƒÂ£o estÃƒÂ¡ habilitado' });
      if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ error: 'Credenciais PayPal nÃƒÂ£o configuradas' });

      // Validate products and calculate total in BRL
      let totalBrl = 0;
      const validatedItems: any[] = [];
      for (const item of items) {
        const product = db.get('SELECT id, name, price, sale_price, status FROM products WHERE id = ?', item.product_id) as any;
        if (!product || product.status !== 'active') {
          return res.status(400).json({ error: `Produto ID ${item.product_id} nÃƒÂ£o encontrado ou inativo` });
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
      const user = (req as any).user;
      const { paypal_order_id } = req.body || {};
      if (!paypal_order_id) return res.status(400).json({ error: 'paypal_order_id ÃƒÂ© obrigatÃƒÂ³rio' });

      const order = db.get('SELECT * FROM orders WHERE paypal_order_id = ?', paypal_order_id) as any;
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (Number(order.user_id) !== Number(user?.id)) {
        return res.status(403).json({ error: 'Pedido nao pertence ao usuario autenticado' });
      }

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
        return res.status(400).json({ success: false, status: captureStatus, error: 'Pagamento nÃƒÂ£o foi completado' });
      }
    } catch (error: any) {
      console.error('PayPal capture-order error:', error?.response?.data || error?.message || error);
      return res.status(500).json({ error: 'Erro ao capturar pagamento PayPal' });
    }
  });

  // POST /api/webhooks/paypal (pÃƒÂºblico)
  app.post('/api/webhooks/paypal', async (req, res) => {
    try {
      const payload = req.body || {};
      const eventId = payload?.id || '';
      const eventType = payload?.event_type || '';
      const resourceId = payload?.resource?.id || '';

      if (!eventId) {
        return res.status(400).json({ received: false, error: 'missing_event_id' });
      }
      if (isWebhookAlreadyProcessed('paypal', String(eventId))) {
        return res.status(200).json({ received: true, duplicated: true });
      }

      const signatureCheck = await verifyPayPalWebhookSignature(req, payload);
      if (!signatureCheck.ok) {
        db.run(`INSERT INTO paypal_webhook_logs (event_id, event_type, resource_id, payload_json, verification_status)
          VALUES (?, ?, ?, ?, ?)`, String(eventId), String(eventType), String(resourceId), JSON.stringify(payload), `invalid:${signatureCheck.reason}`);
        return res.status(401).json({ received: false, error: 'invalid_signature' });
      }

      db.run(`INSERT INTO paypal_webhook_logs (event_id, event_type, resource_id, payload_json, verification_status)
        VALUES (?, ?, ?, ?, 'verified')`, eventId, eventType, resourceId, JSON.stringify(payload));

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

      markWebhookProcessed('paypal', String(eventId), String(resourceId || ''));
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      return res.status(200).json({ received: true });
    }
  });

  // GET /api/admin/paypal/test
  app.get('/api/admin/paypal/test', authenticate, isAdmin, async (req, res) => {
    try {
      const cfg = getPayPalConfig();
      if (!cfg.clientId || !cfg.clientSecret) {
        return res.status(400).json({ ok: false, error: 'Credenciais PayPal nÃƒÂ£o configuradas no painel' });
      }
      const baseUrl = getPayPalBaseUrl(cfg.mode);
      const token = await getPayPalAccessToken(cfg.clientId, cfg.clientSecret, baseUrl);
      if (token) {
        return res.json({ ok: true, mode: cfg.mode, message: `ConexÃƒÂ£o PayPal (${cfg.mode}) estabelecida com sucesso!` });
      }
      return res.status(400).json({ ok: false, error: 'NÃƒÂ£o foi possÃƒÂ­vel obter access token' });
    } catch (error: any) {
      console.error('PayPal test error:', error?.response?.data || error?.message);
      return res.status(400).json({ ok: false, error: error?.response?.data?.error_description || error?.message || 'Falha na conexÃƒÂ£o PayPal' });
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

  // GET /api/checkout/paypal/config (pÃƒÂºblico - retorna apenas client_id e modo)
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
  const isProdEnv = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const hasDistIndex = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')) || fs.existsSync(path.join(__dirname, 'index.html'));
  const isForceProduction = isProdEnv || process.env.VERCEL || hasDistIndex;
  if (!isForceProduction) {
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
              pix_code: 'O cÃƒÂ³digo PIX foi enviado no momento do checkout. Acesse sua conta para ver os detalhes.',
              expires_at: '24 horas apÃƒÂ³s a compra',
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





