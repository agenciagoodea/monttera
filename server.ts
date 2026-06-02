process.env.NODE_ENV = process.env.NODE_ENV || 'production';
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import express from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDb } from './src/server/dbInitAsync';
import dbAsync from './src/server/dbAsync';
import { hashPassword, comparePassword, generateToken, verifyToken, authenticate, isAdmin } from './src/server/auth';
import multer from 'multer';
import slugify from 'slugify';
import fs from 'fs';
import { execFileSync } from 'child_process';
import https from 'https';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { sendEmail } from './src/server/mailer';
import nodemailer from 'nodemailer';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import axios from 'axios';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import sharp from 'sharp';

// Shim para __dirname funcionar tanto em CommonJS (compilado) quanto em ESM (dev/tsx)
const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : process.cwd();

const isProduction = process.env.NODE_ENV === 'production';
const EMAIL_VERIFICATION_TOKEN_TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || '24');
const LOGIN_ATTEMPT_WINDOW_MINUTES = Number(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES || '15');
const LOGIN_ATTEMPT_MAX_FAILS = Number(process.env.LOGIN_ATTEMPT_MAX_FAILS || '7');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Aplica marca d'água sobre uma imagem de produto.
 * - A marca d'água (/public/uploads/marcadagua.png) é redimensionada para 1080x1080 e sobreposta sobre a imagem.
 * - Mescla transparências de PNG/WEBP em um fundo branco sólido para evitar fundo preto indesejado.
 * - A imagem final é sempre salva como JPG qualidade 90%, em 1080x1080 (cover centralizado).
 * - Se marcadagua.png não existir, lança erro com mensagem clara.
 * - Efetua checagens estritas de existência e tamanho de disco pós-processamento.
 */
async function applyWatermark(inputPath: string, outputPath: string): Promise<void> {
  const watermarkPath = path.join(process.cwd(), 'public', 'uploads', 'marcadagua.png');
  if (!fs.existsSync(watermarkPath)) {
    throw new Error('Arquivo de marca d\'água não encontrado em /public/uploads/marcadagua.png. Envie o arquivo antes de fazer upload de imagens.');
  }

  // Redimensionar marca d'água para 1080x1080 cobrindo tudo
  const watermarkBuffer = await sharp(watermarkPath)
    .resize(1080, 1080, { fit: 'fill' })
    .png()
    .toBuffer();

  // Aplicar marca d'água sobre a imagem base:
  // 1. Flatten com fundo branco sólido (#ffffff) para lidar com fundos transparentes de PNG/WEBP
  // 2. Redimensiona proporcionalmente para caber em 1040x1040 (fit: contain) sem cortes, com fundo branco
  // 3. Estende 20px em toda a volta (top, bottom, left, right) com fundo branco, totalizando exatamente 1080x1080
  // 4. Aplica o composite da marca d'água de 1080x1080 por cima
  // 5. Salva como JPG qualidade 90
  await sharp(inputPath)
    .flatten({ background: '#ffffff' })
    .resize(1040, 1040, { fit: 'contain', background: '#ffffff' })
    .extend({
      top: 20,
      bottom: 20,
      left: 20,
      right: 20,
      background: '#ffffff'
    })
    .composite([{ input: watermarkBuffer, gravity: 'center' }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  // Validações físicas estritas pós-processamento
  if (!fs.existsSync(outputPath)) {
    throw new Error('Erro de gravação física: O arquivo JPG final processado com marca d\'água não pôde ser encontrado no disco.');
  }
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    throw new Error('Erro de gravação física: O arquivo processado resultante com marca d\'água possui tamanho igual a zero.');
  }
}


function createBasicRateLimit(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const current = hits.get(key);

    if (!current || now > current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: options.message });
    }

    current.count += 1;
    hits.set(key, current);
    return next();
  };
}

const registerRateLimit = createBasicRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.',
});

const loginRateLimit = createBasicRateLimit({
  windowMs: LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000,
  max: Math.max(15, LOGIN_ATTEMPT_MAX_FAILS * 3),
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});

const forgotPasswordRateLimit = createBasicRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Muitas solicitacoes de recuperacao. Aguarde alguns minutos e tente novamente.',
});

function createPersistentRateLimit(options: {
  scope: string;
  windowMs: number;
  max: number;
  message: string;
}) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const ip = getClientIp(req);
      const email = String((req.body?.email || '') as string).trim().toLowerCase();
      const rateKey = `${ip}|${email || 'anonymous'}`;
      const windowSeconds = Math.max(1, Math.floor(options.windowMs / 1000));

      const row = await dbAsync.get(`
        SELECT
          hits,
          UNIX_TIMESTAMP(window_start) AS window_start_unix
        FROM api_rate_limits
        WHERE scope = ?
          AND rate_key = ?
          AND window_start = FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP() / ?) * ?)
        LIMIT 1
      `, options.scope, rateKey, windowSeconds, windowSeconds) as any;

      const nextHits = Number(row?.hits || 0) + 1;
      const windowStartUnix = Number(row?.window_start_unix || Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds);
      const retryAfterSeconds = Math.max(1, (windowStartUnix + windowSeconds) - Math.floor(Date.now() / 1000));

      await dbAsync.run(`
        INSERT INTO api_rate_limits (scope, rate_key, window_start, hits)
        VALUES (?, ?, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP() / ?) * ?), 1)
        ON DUPLICATE KEY UPDATE hits = hits + 1, updated_at = CURRENT_TIMESTAMP
      `, options.scope, rateKey, windowSeconds, windowSeconds);

      if (nextHits > options.max) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ error: options.message });
      }
      return next();
    } catch (error) {
      console.error('Persistent rate-limit fallback to memory limiter due to error:', error);
      return next();
    }
  };
}

const registerRateLimitPersistent = createPersistentRateLimit({
  scope: 'auth_register',
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.',
});

const loginRateLimitPersistent = createPersistentRateLimit({
  scope: 'auth_login',
  windowMs: LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000,
  max: Math.max(15, LOGIN_ATTEMPT_MAX_FAILS * 3),
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});

const forgotPasswordRateLimitPersistent = createPersistentRateLimit({
  scope: 'auth_forgot_password',
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Muitas solicitacoes de recuperacao. Aguarde alguns minutos e tente novamente.',
});

function isValidEmail(email: string) {
  return EMAIL_REGEX.test(String(email || '').trim().toLowerCase());
}

function shouldRequireAdminMfa() {
  return String(process.env.ADMIN_MFA_REQUIRED || 'false').toLowerCase() === 'true';
}

function hashMfaCode(raw: string) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function getAuthCookieOptions(req: express.Request): express.CookieOptions {
  const secure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  const options: express.CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  if (isProduction) {
    options.domain = '.digitalbordados.com.br';
  }
  return options;
}

function getCsrfCookieOptions(req: express.Request): express.CookieOptions {
  const secure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  const options: express.CookieOptions = {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
  if (isProduction) {
    options.domain = '.digitalbordados.com.br';
  }
  return options;
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sanitizeRichHtml(input: any): string {
  const raw = String(input ?? '');
  if (!raw.trim()) return '';

  const allowedTags = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img', 'hr', 'span', 'div',
  ]);
  const voidTags = new Set(['br', 'hr', 'img']);
  const blockedContentTags = /<(script|style|iframe|object|embed|form|meta|link|base)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const blockedSingleTags = /<(script|style|iframe|object|embed|form|meta|link|base)\b[^>]*\/?>/gi;

  const allowedAttrsByTag: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'target', 'rel']),
    img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
    div: new Set(['class']),
    span: new Set(['class']),
    p: new Set(['class']),
    code: new Set(['class']),
    pre: new Set(['class']),
  };
  const globalAllowedAttrs = new Set(['class', 'title', 'aria-label', 'style']);

  const escapeAttr = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const isSafeUrl = (value: string, forImage: boolean) => {
    const normalized = String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return false;
    if (lower.startsWith('data:')) {
      if (!forImage) return false;
      return /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(normalized);
    }
    if (lower.startsWith('/') || lower.startsWith('./') || lower.startsWith('../')) return true;
    return /^(https?:|mailto:|tel:)/i.test(normalized);
  };

  const sanitized = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(blockedContentTags, '')
    .replace(blockedSingleTags, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi, (_full, slash, tagNameRaw, attrsRaw) => {
      const tag = String(tagNameRaw || '').toLowerCase();
      const isClosing = String(slash || '') === '/';
      if (!allowedTags.has(tag)) return '';
      if (isClosing) {
        if (voidTags.has(tag)) return '';
        return `</${tag}>`;
      }

      const allowedAttrs = new Set([
        ...Array.from(globalAllowedAttrs),
        ...Array.from(allowedAttrsByTag[tag] || []),
      ]);
      const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:\-\.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
      const outAttrs: string[] = [];
      let match: RegExpExecArray | null = null;
      while ((match = attrRegex.exec(String(attrsRaw || '')))) {
        const attrName = String(match[1] || '').toLowerCase();
        if (!allowedAttrs.has(attrName)) continue;
        if (attrName.startsWith('on')) continue;
        const rawValue = String(match[3] ?? match[4] ?? match[5] ?? '').trim();
        if (!rawValue) continue;

        if (attrName === 'href') {
          if (!isSafeUrl(rawValue, false)) continue;
          outAttrs.push(`href="${escapeAttr(rawValue)}"`);
          continue;
        }
        if (attrName === 'src') {
          if (!isSafeUrl(rawValue, tag === 'img')) continue;
          outAttrs.push(`src="${escapeAttr(rawValue)}"`);
          continue;
        }
        if (attrName === 'target') {
          const targetVal = rawValue.toLowerCase() === '_blank' ? '_blank' : '_self';
          outAttrs.push(`target="${targetVal}"`);
          continue;
        }
        if (attrName === 'rel') {
          continue;
        }
        outAttrs.push(`${attrName}="${escapeAttr(rawValue)}"`);
      }

      if (tag === 'a') {
        const hasTargetBlank = outAttrs.some((value) => /target="_blank"/i.test(value));
        if (hasTargetBlank) outAttrs.push('rel="noopener noreferrer"');
      }
      if (tag === 'img' && !outAttrs.some((value) => /^loading=/i.test(value))) {
        outAttrs.push('loading="lazy"');
      }

      const attrs = outAttrs.length > 0 ? ` ${outAttrs.join(' ')}` : '';
      if (voidTags.has(tag)) return `<${tag}${attrs}>`;
      return `<${tag}${attrs}>`;
    });

  return sanitized.trim();
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
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;
let settingsCache: Record<string, string> = {};
let settingsCacheExpiresAt = 0;

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
  if (!keys || keys.length === 0) return { ...settingsCache };
  const selected: Record<string, string> = {};
  for (const key of keys) selected[key] = settingsCache[key];
  return selected;
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
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.ico']);
const ZIP_EXTENSIONS = new Set(['.zip', '.rar', '.7z']);
const EMBROIDERY_EXTENSIONS = new Set(['.pes', '.jef', '.dst', '.exp', '.xxx', '.vp3', '.hus']);
const PDF_EXTENSIONS = new Set(['.pdf']);

function isAllowedUpload(fieldName: string, extension: string, mimeType: string): boolean {
  const ext = extension.toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (fieldName === 'image' || fieldName === 'gallery' || fieldName === 'avatar' || fieldName === 'logo') {
    if (ext === '.ico') {
      return mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon' || mime === 'application/octet-stream';
    }
    return IMAGE_EXTENSIONS.has(ext) && mime.startsWith('image/');
  }

  if (fieldName === 'production_sheet') {
    return PDF_EXTENSIONS.has(ext) && (
      mime === 'application/pdf' ||
      mime === 'application/x-pdf' ||
      mime === 'application/octet-stream'
    );
  }

  if (fieldName === 'production_files') {
    const allowedExt = ZIP_EXTENSIONS.has(ext) || EMBROIDERY_EXTENSIONS.has(ext);
    const allowedMime =
      mime === 'application/zip' ||
      mime === 'application/x-zip-compressed' ||
      mime === 'application/octet-stream' ||
      mime === 'application/x-rar-compressed' ||
      mime === 'application/vnd.rar' ||
      mime === 'application/x-7z-compressed';
    return allowedExt && allowedMime;
  }

  if (fieldName === 'reference_image') {
    if (IMAGE_EXTENSIONS.has(ext) && mime.startsWith('image/')) return true;
    if (PDF_EXTENSIONS.has(ext) && (mime === 'application/pdf' || mime === 'application/x-pdf' || mime === 'application/octet-stream')) return true;
    if (ZIP_EXTENSIONS.has(ext)) return true;
    return false;
  }

  return false;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isProductionFile = file.fieldname === 'production_files';
    const dir = isProductionFile ? './uploads/arquivos' : './public/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = isAllowedUpload(file.fieldname, ext, file.mimetype || '');
    if (!allowed) {
      return cb(new Error(`Tipo de arquivo nao permitido para o campo ${file.fieldname}.`));
    }
    return cb(null, true);
  },
});

function buildProductMediaName(slug: string, productId: number, ext: string, suffix?: string) {
  const safeSlug = slugify(slug || 'produto', { lower: true, strict: true, trim: true }) || 'produto';
  const safeExt = String(ext || '').toLowerCase();
  const safeSuffix = suffix ? `-${suffix}` : '';
  return `${safeSlug}-${productId}${safeSuffix}${safeExt}`;
}

function moveUploadedFileToFinalPath(
  file: Express.Multer.File | undefined,
  absoluteDestDir: string,
  finalFileName: string,
): { absolutePath: string; fileName: string } | null {
  if (!file || !file.path || !finalFileName) return null;
  try {
    if (!fs.existsSync(absoluteDestDir)) fs.mkdirSync(absoluteDestDir, { recursive: true });
    const source = path.resolve(file.path);
    const target = path.resolve(path.join(absoluteDestDir, finalFileName));
    if (source === target) return { absolutePath: target, fileName: finalFileName };
    try {
      fs.renameSync(source, target);
    } catch (renameError: any) {
      if (renameError.code === 'EXDEV') {
        fs.copyFileSync(source, target);
        fs.unlinkSync(source);
      } else {
        throw renameError;
      }
    }
    return { absolutePath: target, fileName: finalFileName };
  } catch (error) {
    console.error('Erro ao mover arquivo físico de upload:', error);
    return null;
  }
}

async function createUniqueProductSlug(baseName: string, ignoreProductId?: number) {
  const baseSlugRaw = slugify(baseName || 'produto', { lower: true, strict: true, trim: true }) || 'produto';
  let candidate = baseSlugRaw;
  let sequence = 2;

  while (true) {
    const existing = await dbAsync.get('SELECT id FROM products WHERE slug = ?', candidate) as any;
    if (!existing || (ignoreProductId && Number(existing.id) === Number(ignoreProductId))) {
      return candidate;
    }
    candidate = `${baseSlugRaw}-${sequence}`;
    sequence += 1;
  }
}

async function resolveNewBadgeDays() {
  const settings = await loadSettingsMapAsync(['new_badge_days']);
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

async function verifyMercadoPagoWebhookSignature(req: express.Request, payload: any) {
  const settings = await loadSettingsMapAsync(['mp_webhook_secret']);
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

async function isWebhookAlreadyProcessed(provider: string, eventId: string) {
  if (!eventId) return false;
  const row = await dbAsync.get('SELECT id FROM processed_webhooks WHERE provider = ? AND event_id = ? LIMIT 1', provider, eventId) as any;
  return Boolean(row?.id);
}

async function markWebhookProcessed(provider: string, eventId: string, resourceId?: string | null) {
  if (!eventId) return;
  await dbAsync.run(
    `INSERT IGNORE INTO processed_webhooks (provider, event_id, resource_id)
     VALUES (?, ?, ?)`,
    provider,
    eventId,
    resourceId || null,
  );
}

async function verifyPayPalWebhookSignature(req: express.Request, payload: any) {
  const s = await loadSettingsMapAsync([
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

async function resolveEmailVerificationRequired() {
  const settings = await loadSettingsMapAsync(['email_verification_required']);
  const raw = String(settings.email_verification_required || 'true').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

const DOWNLOAD_ALLOWED_STATUSES = [
  'paid',
  'completed',
  'concluido',
  'concluído',
  'success',
  'pago',
  'wc-completed',
  'wc-processing',
  'processing',
] as const;

function getDownloadStatusPlaceholders() {
  return DOWNLOAD_ALLOWED_STATUSES.map(() => '?').join(', ');
}

async function canUserAccessDownloads(userId: number, userEmail: string, emailVerifiedAt: unknown) {
  if (!(await resolveEmailVerificationRequired())) return true;
  if (emailVerifiedAt) return true;

  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  const statusPlaceholders = getDownloadStatusPlaceholders();
  const hasPaidOrder = await dbAsync.get(
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

async function getOrderNotificationEmail() {
  const settings = await loadSettingsMapAsync(['order_notifications_email', 'email_contact']);
  return String(settings.order_notifications_email || settings.email_contact || '').trim().toLowerCase();
}

async function loadSettingsMapAsync(keys?: string[]) {
  const now = Date.now();
  if (now >= settingsCacheExpiresAt) {
    const rows = await dbAsync.all('SELECT `key`, value FROM settings') as any[];
    settingsCache = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    settingsCacheExpiresAt = now + SETTINGS_CACHE_TTL_MS;
  }

  if (!keys || keys.length === 0) return { ...settingsCache };
  const selected: Record<string, string> = {};
  for (const key of keys) selected[key] = settingsCache[key];
  return selected;
}

async function buildOrderEmailPayload(orderId: number, paymentMethodRaw: string, orderStatusRaw: string, appUrl: string) {
  const order = await dbAsync.get('SELECT * FROM orders WHERE id = ? LIMIT 1', orderId) as any;
  if (!order) return null;
  const details = await dbAsync.get('SELECT * FROM order_customer_details WHERE order_id = ? LIMIT 1', orderId) as any;
  const orderItems = await dbAsync.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', orderId) as any[];

  const paymentMethodLabel: Record<string, string> = {
    pix: 'PIX',
    credit_card: 'Cartao de credito',
    debit_card: 'Cartao de debito',
    paypal: 'PayPal',
  };
  const paymentMethod = String(paymentMethodRaw || order.payment_method || '');
  const orderStatus = String(orderStatusRaw || order.status || '');
  const orderDate = order?.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

  const itemsRows = orderItems
    .map((i) => {
      const qty = Number(i.quantity || 1);
      const price = Number(i.price || 0);
      return `<tr><td style="padding:8px 0;">${qty}x ${String(i.product_name || '')}</td><td style="padding:8px 0; text-align:right;">R$ ${price.toFixed(2)}</td></tr>`;
    })
    .join('');

  const fullName = String(details?.first_name || '').trim() || String(order.customer_name || 'Cliente').split(' ')[0] || 'Cliente';
  const lastName = String(details?.last_name || '').trim();
  const customerName = `${fullName}${lastName ? ` ${lastName}` : ''}`.trim();

  const customerDetailsHtml = `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:16px 0;">
      <h3 style="margin:0 0 10px 0; font-size:14px; color:#0f172a;">Dados do cliente</h3>
      <p style="margin:3px 0;"><strong>Nome:</strong> ${fullName || '-'} ${lastName || ''}</p>
      <p style="margin:3px 0;"><strong>CPF:</strong> ${details?.cpf || '-'}</p>
      <p style="margin:3px 0;"><strong>E-mail:</strong> ${details?.email || order.customer_email || '-'}</p>
      <p style="margin:3px 0;"><strong>Telefone:</strong> ${details?.phone || '-'}</p>
      <p style="margin:3px 0;"><strong>Cidade:</strong> ${details?.city || '-'}</p>
      <p style="margin:3px 0;"><strong>Estado:</strong> ${details?.state || '-'}</p>
      <p style="margin:3px 0;"><strong>CEP:</strong> ${details?.postal_code || '-'}</p>
      <p style="margin:3px 0;"><strong>Endereco:</strong> ${details?.address_line || '-'}, ${details?.number || '-'} - ${details?.neighborhood || '-'} ${details?.complement ? `(${details.complement})` : ''}</p>
    </div>
  `;

  const orderEmailHtml = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;">
      <h2 style="margin:0 0 12px 0;">Pedido #${order.id}</h2>
      <p style="margin:0 0 8px 0;"><strong>Data da compra:</strong> ${orderDate}</p>
      <p style="margin:0 0 8px 0;"><strong>Forma de pagamento:</strong> ${paymentMethodLabel[paymentMethod] || paymentMethod}</p>
      <p style="margin:0 0 8px 0;"><strong>Status:</strong> ${orderStatus}</p>
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px; border-collapse:collapse;">
        <thead><tr><th align="left" style="border-bottom:1px solid #e2e8f0; padding:6px 0;">Produtos</th><th align="right" style="border-bottom:1px solid #e2e8f0; padding:6px 0;">Valor</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <p style="margin:12px 0 0 0;"><strong>Total:</strong> R$ ${Number(order.total || 0).toFixed(2)}</p>
      ${customerDetailsHtml}
      <p style="margin:8px 0 0 0;"><strong>ID do pedido:</strong> ${order.id}</p>
    </div>
  `;

  return {
    customerEmail: String(details?.email || order.customer_email || '').trim().toLowerCase(),
    customerName,
    variables: {
      name: fullName || 'Cliente',
      order_id: order.id,
      order_total: `R$ ${Number(order.total || 0).toFixed(2)}`,
      order_status: orderStatus,
      items: orderEmailHtml,
      payment_method: paymentMethodLabel[paymentMethod] || paymentMethod,
      account_url: `${appUrl}/minha-conta`,
    },
    adminVariables: {
      name: 'Equipe',
      order_id: order.id,
      order_total: `R$ ${Number(order.total || 0).toFixed(2)}`,
      order_status: orderStatus,
      items: orderEmailHtml,
      payment_method: paymentMethodLabel[paymentMethod] || paymentMethod,
      account_url: `${appUrl}/admin/pedidos`,
    },
  };
}

async function buildMercadoPagoProductPayload(productId: number, req: express.Request) {
  const product = await dbAsync.get(`
    SELECT p.id, p.name, p.slug, p.description, p.image, p.price, p.sale_price, p.category_id, c.name AS category_name
    FROM products p
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE p.id = ?
    LIMIT 1
  `, productId) as any;

  if (!product) return null;

  const unitPrice = Number(product.sale_price ?? product.price ?? 0);
  const imageUrl = normalizePublicMediaUrl(product.image);
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const resolvedImageUrl = imageUrl
    ? (imageUrl.startsWith('http') ? imageUrl : `${appUrl}${imageUrl}`)
    : '';

  return {
    id: String(product.slug || product.id),
    title: String(product.name || ''),
    description: String(product.description || '').slice(0, 500),
    category_id: String(product.category_name || product.category_id || 'matrizes'),
    quantity: 1,
    unit_price: Number(unitPrice.toFixed(2)),
    picture_url: resolvedImageUrl,
    sku: String(product.slug || product.id),
  };
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

function getWpUploadsRoots(): string[] {
  const configuredRoots = [
    process.env.WOO_UPLOADS_DIR,
    process.env.WOOCOMMERCE_UPLOADS_DIR,
    process.env.DOWNLOADS_BASE_DIR,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => value.replace(/\\/g, '/'))
    .map((value) => {
      const marker = '/wp-content/uploads/';
      const idx = value.toLowerCase().indexOf(marker);
      if (idx >= 0) {
        return value.slice(0, idx + marker.length).replace(/\/+$/, '');
      }
      return value.replace(/\/+$/, '');
    })
    .map((value) => path.resolve(value));

  const defaultRoots = [
    path.resolve(process.cwd(), 'wp-content', 'uploads'),
    path.resolve(process.cwd(), '..', 'wp-content', 'uploads'),
  ];

  return Array.from(new Set([...configuredRoots, ...defaultRoots])).filter((root) => {
    try {
      return fs.existsSync(root) && fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
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
  void dbAsync.run(
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
  ).catch((error) => {
    console.error('Falha ao registrar log de download:', error);
  });
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

  if (/^digitalbordados\.com\.br\//i.test(raw)) {
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  if (/^https?:\/\//i.test(raw)) return raw;

  const domain = String(process.env.APP_DOMAIN || 'digitalbordados.com.br').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const base = `https://${domain}`;
  const noLeadingSlash = raw.replace(/^\/+/, '');

  if (raw.startsWith('/wp-content/uploads/')) return `${base}${raw}`;
  if (raw.startsWith('wp-content/uploads/')) return `${base}/${noLeadingSlash}`;
  if (raw.startsWith('/uploads/')) return `${base}${raw}`;
  if (raw.startsWith('uploads/')) return `${base}/${noLeadingSlash}`;
  if (raw.startsWith('/')) return `${base}${raw}`;

  return `${base}/${noLeadingSlash}`;
}

const PUBLIC_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const PUBLIC_PDF_EXTENSIONS = new Set(['.pdf']);

function getPublicUploadsRoots(): string[] {
  const configured = [
    process.env.DOWNLOADS_BASE_DIR,
    process.env.PUBLIC_UPLOADS_DIR,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));

  const defaults = [
    path.resolve(process.cwd(), 'public', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
  ];

  return Array.from(new Set([...configured, ...defaults])).filter((root) => {
    try {
      return fs.existsSync(root) && fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}

function publicUrlFileExists(mediaUrl: string): boolean {
  const normalized = normalizePublicMediaUrl(mediaUrl);
  if (!normalized || !normalized.startsWith('/uploads/')) return false;
  const rel = normalized.replace(/^\/uploads\//, '').replace(/^\/+/, '');
  if (!rel) return false;

  for (const root of getPublicUploadsRoots()) {
    const candidate = path.resolve(root, rel);
    try {
      if (isInsideRoot(candidate, root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

function findSlugMediaFallbacks(slug: string, kind: 'image' | 'pdf', productId?: number): string[] {
  const baseSlug = String(slug || '').trim().toLowerCase();
  if (!baseSlug) return [];

  const tokens = baseSlug
    .split('-')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  if (!tokens.length) return [];

  const allowedExt = kind === 'pdf' ? PUBLIC_PDF_EXTENSIONS : PUBLIC_IMAGE_EXTENSIONS;
  const ranked: Array<{ file: string; score: number }> = [];

  for (const root of getPublicUploadsRoots()) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(root);
    } catch {
      continue;
    }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!allowedExt.has(ext)) continue;

      const lower = file.toLowerCase();
      if (Number.isFinite(Number(productId)) && Number(productId) > 0) {
        const pid = Number(productId);
        if (!lower.includes(`-${pid}`)) continue;
      }
      let score = 0;
      for (const token of tokens) {
        if (lower.includes(token)) score += 1;
      }
      if (score === 0) continue;

      ranked.push({ file, score });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return Array.from(new Set(ranked.map((item) => `/uploads/${item.file}`)));
}

function resolvePublicMediaWithFallback(mediaUrl: unknown, slug: string, kind: 'image' | 'pdf', productId?: number): string {
  const normalized = normalizePublicMediaUrl(mediaUrl);
  if (normalized) {
    return normalized;
  }
  return '';
}

function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonWrite(filePath: string, payload: any) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function getAllTableNames(): Promise<string[]> {
  const rows = await dbAsync.all(`
    SELECT TABLE_NAME as table_name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME ASC
  `) as any[];
  return rows.map((row) => String(row.table_name || '')).filter(Boolean);
}

function buildBackupArchive(snapshotPath: string, archivePath: string) {
  ensureDirSync(path.dirname(archivePath));
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  try {
    execFileSync('tar', ['-czf', archivePath, '-C', snapshotPath, '.'], { stdio: 'ignore' });
    return;
  } catch {
    // fallback for Windows environments without tar in PATH
  }
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path "${snapshotPath}\\*" -DestinationPath "${archivePath}" -Force`,
    ],
    { stdio: 'ignore' },
  );
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDirSync(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      ensureDirSync(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function extractBackupArchive(archivePath: string, targetDir: string) {
  ensureDirSync(targetDir);
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'ignore' });
    return;
  } catch {
    // fallback for Windows environments without tar in PATH
  }
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${archivePath}" -DestinationPath "${targetDir}" -Force`,
    ],
    { stdio: 'ignore' },
  );
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function createEmailVerificationToken(userId: number, email: string) {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = sha256(rawToken);
  await dbAsync.run('UPDATE email_verification_tokens SET used = 1 WHERE user_id = ? AND used = 0', userId);
  await dbAsync.run(
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
  const rawToken = await createEmailVerificationToken(Number(user.id), String(user.email).trim().toLowerCase());
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

async function getLoginAttemptStats(email: string, ip: string) {
  const row = await dbAsync.get(
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

async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await dbAsync.run(
    'INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)',
    email || null,
    ip || null,
    success ? 1 : 0,
  );
}

async function getUserById(userId: number) {
  return await dbAsync.get(
    'SELECT id, name, email, role, status, email_verified_at, privacy_reaccept_required FROM users WHERE id = ? LIMIT 1',
    userId,
  ) as any;
}

function parseBooleanSetting(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

async function resolveLgpdSettings() {
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
  const s = await loadSettingsMapAsync(keys);
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

async function getActivePolicyVersion(policyType: 'privacy' | 'terms' | 'cookies') {
  const row = await dbAsync.get(
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

async function resolveRequiredPolicyVersions(lgpd?: any) {
  const resolvedLgpd = lgpd || (await resolveLgpdSettings());
  return {
    privacy: (await getActivePolicyVersion('privacy')) || resolvedLgpd.policyVersionPrivacy,
    terms: (await getActivePolicyVersion('terms')) || resolvedLgpd.policyVersionTerms,
    cookies: (await getActivePolicyVersion('cookies')) || resolvedLgpd.policyVersionCookies,
  };
}

async function logLgpdEvent(params: {
  req?: express.Request;
  userId?: number | null;
  actorUserId?: number | null;
  eventType: string;
  action: string;
  details?: Record<string, any> | null;
}) {
  try {
    await dbAsync.run(
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

async function upsertUserConsent(params: {
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
  await dbAsync.run(
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

  await logLgpdEvent({
    req: params.req,
    userId: params.userId,
    actorUserId: params.userId,
    eventType: 'consent',
    action: params.granted ? 'consent_granted' : 'consent_revoked',
    details: { consent_key: params.consentKey, policy_version: params.policyVersion || null },
  });
}

async function recordPolicyAcceptance(params: {
  userId: number;
  policyType: 'privacy' | 'terms' | 'cookies';
  policyVersion: string;
  req?: express.Request;
  source?: string;
}) {
  await dbAsync.run(
    `INSERT INTO lgpd_user_acceptances (user_id, policy_type, policy_version, ip, user_agent, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    params.userId,
    params.policyType,
    params.policyVersion,
    params.req ? getClientIp(params.req) : null,
    params.req ? String(params.req.headers['user-agent'] || '').slice(0, 500) : null,
    params.source || 'web',
  );
  await dbAsync.run('UPDATE users SET privacy_reaccept_required = 0 WHERE id = ?', params.userId);
  await logLgpdEvent({
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

async function userHasAcceptedPolicyVersion(userId: number, policyType: 'privacy' | 'terms' | 'cookies', policyVersion: string) {
  const normalizedTarget = normalizePolicyVersion(policyVersion);
  if (!normalizedTarget) return false;

  const candidateVersions = Array.from(new Set([
    String(policyVersion || '').trim().toLowerCase(),
    normalizedTarget,
    `v${normalizedTarget}`,
  ])).filter(Boolean);
  const placeholders = candidateVersions.map(() => '?').join(', ');

  const row = await dbAsync.get(
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

async function userHasGrantedConsentVersion(
  userId: number,
  consentKeys: string[],
  policyVersion: string,
) {
  const normalizedTarget = normalizePolicyVersion(policyVersion);
  if (!consentKeys.length || !normalizedTarget) return false;

  const consentPlaceholders = consentKeys.map(() => '?').join(', ');
  const rows = await dbAsync.all(
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

async function hasAnyGrantedConsent(userId: number, consentKeys: string[]) {
  if (!Array.isArray(consentKeys) || consentKeys.length === 0) return false;
  const placeholders = consentKeys.map(() => '?').join(', ');
  const row = await dbAsync.get(
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

async function hasAnyPolicyAcceptance(
  userId: number,
  policyType: 'privacy' | 'terms' | 'cookies',
) {
  const row = await dbAsync.get(
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

async function getActivePolicies() {
  const policies = await dbAsync.all(
    `SELECT id, policy_type, version, title, content, is_active, force_reaccept, published_at, created_at, updated_at
     FROM lgpd_policies
     WHERE is_active = 1
     ORDER BY policy_type ASC, updated_at DESC`,
  ) as any[];
  return policies;
}

async function ensureUserLgpdCompliance(userId: number) {
  const lgpd = await resolveLgpdSettings();
  if (!lgpd.enabled || !lgpd.requirePolicyAcceptance) {
    return { ok: true };
  }

  const userRow = await dbAsync.get(
    'SELECT id, privacy_reaccept_required FROM users WHERE id = ? LIMIT 1',
    userId,
  ) as any;
  const userRequiresReaccept = Number(userRow?.privacy_reaccept_required || 0) === 1;
  const enforceVersionMatch = lgpd.requireReacceptOnPolicyUpdate && userRequiresReaccept;

  const requiredVersions = await resolveRequiredPolicyVersions(lgpd);
  const missing: string[] = [];
  const hasTermsAccepted = enforceVersionMatch
    ? (
      (await userHasAcceptedPolicyVersion(userId, 'terms', requiredVersions.terms)) ||
      (await userHasGrantedConsentVersion(userId, ['terms_of_use', 'terms'], requiredVersions.terms))
    )
    : (
      (await hasAnyGrantedConsent(userId, ['terms_of_use', 'terms'])) ||
      (await hasAnyPolicyAcceptance(userId, 'terms'))
    );
  if (lgpd.requireTermsAcceptance && !hasTermsAccepted) {
    missing.push('terms');
  }

  const hasPrivacyAccepted = enforceVersionMatch
    ? (
      (await userHasAcceptedPolicyVersion(userId, 'privacy', requiredVersions.privacy)) ||
      (await userHasGrantedConsentVersion(userId, ['privacy_policy', 'privacy'], requiredVersions.privacy))
    )
    : (
      (await hasAnyGrantedConsent(userId, ['privacy_policy', 'privacy'])) ||
      (await hasAnyPolicyAcceptance(userId, 'privacy'))
    );
  if (!hasPrivacyAccepted) {
    missing.push('privacy');
  }

  const hasCookiesAccepted = enforceVersionMatch
    ? (
      (await userHasAcceptedPolicyVersion(userId, 'cookies', requiredVersions.cookies)) ||
      (await userHasGrantedConsentVersion(userId, ['cookies_policy', 'cookie_consent', 'cookies'], requiredVersions.cookies))
    )
    : (
      (await hasAnyGrantedConsent(userId, ['cookies_policy', 'cookie_consent', 'cookies'])) ||
      (await hasAnyPolicyAcceptance(userId, 'cookies'))
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

async function notifyCustomersPolicyUpdated(params: {
  policyType: 'privacy' | 'terms' | 'cookies';
  policyVersion: string;
  policyUrl: string;
  actorUserId?: number;
  req?: express.Request;
}) {
  const recipients = await dbAsync.all(
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

    await logLgpdEvent({
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

async function buildUserLgpdExportPayload(userId: number) {
  const user = await dbAsync.get('SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = ?', userId) as any;
  if (!user) return null;
  const profile = await dbAsync.get('SELECT * FROM customers WHERE user_id = ?', userId) as any;
  const orders = await dbAsync.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', userId);
  const orderItems = await dbAsync.all(
    `SELECT oi.* FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ?
     ORDER BY oi.order_id DESC`,
    userId,
  );
  const favorites = await dbAsync.all('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', userId);
  const consents = await dbAsync.all('SELECT * FROM lgpd_consents WHERE user_id = ? ORDER BY updated_at DESC', userId);
  const acceptances = await dbAsync.all('SELECT * FROM lgpd_user_acceptances WHERE user_id = ? ORDER BY accepted_at DESC', userId);
  const requests = await dbAsync.all('SELECT * FROM lgpd_requests WHERE user_id = ? ORDER BY created_at DESC', userId);

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

async function initSettings() {
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
    paypal_brl_eur_rate: '6.00',
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
    home_company_enabled: 'true',
    home_company_title: 'Nossa Empresa',
    home_company_subtitle: 'Qualidade e confianca em matrizes de bordado digital',
    home_company_text: 'Criamos experiencias em bordado com curadoria tecnica, producao consistente e atendimento especializado para quem vive do bordado.',
    home_company_mission: 'Entregar matrizes de alta qualidade com agilidade e suporte humano.',
    home_company_vision: 'Ser referencia nacional em matrizes para bordado profissional.',
    home_company_values: 'Qualidade, Transparencia, Agilidade, Inovacao e Respeito ao cliente.',
    home_company_image_main: '',
    home_company_image_secondary: '',
    home_company_cta_text: 'Conheca nossa colecao',
    home_company_cta_link: '/loja',
    home_company_bg_color: '#0f172a',
    home_company_text_color: '#f8fafc',
    home_company_icons: '["shield","sparkles","award"]',
    seo_meta_title: 'Digital Bordados',
    seo_meta_description: 'Matrizes de bordado digital com qualidade profissional.',
    seo_keywords: 'matriz de bordado, bordado computadorizado, matriz pes, dst, jef',
    seo_robots_index: 'true',
    seo_robots_follow: 'true',
    seo_og_image: '/uploads/seo-default-share.jpg',
    favicon_url: '/favicon.ico',
    seo_twitter_card: 'summary_large_image',
    seo_facebook_url: '',
    seo_instagram_url: '',
    seo_twitter_url: '',
    seo_organization_name: 'Digital Bordados',
    seo_organization_logo: '',
    seo_enable_product_schema: 'true',
    seo_enable_organization_schema: 'true',
    seo_enable_breadcrumb_schema: 'true',
    seo_sitemap_enabled: 'true',
    seo_robots_custom_rules: '',
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await dbAsync.run('INSERT IGNORE INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\'))', key, value);
  }

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

  for (const policy of defaultPolicies) {
    await dbAsync.run(
      `INSERT IGNORE INTO lgpd_policies (policy_type, version, title, content, is_active, force_reaccept)
       VALUES (?, ?, ?, ?, 1, 0)`,
      policy.policy_type,
      policy.version,
      policy.title,
      policy.content,
    );
  }
}

async function initTestData() {
  if (isProduction) {
    console.log('Skipping test data seeding in production.');
    return;
  }
  await initSettings();
  const hashedPassword = await hashPassword('123456');
  const adrianoPassword = await hashPassword('04039866');

  // 1. Novo UsuÃƒÆ’Ã‚Â¡rio Admin (Adriano Amorim)
  const adrianoAdmin = await dbAsync.get('SELECT * FROM users WHERE email = ?', 'contato@agenciagoodea.com') as any;
  if (!adrianoAdmin) {
    await dbAsync.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Adriano Amorim', 'contato@agenciagoodea.com', adrianoPassword, 'admin', 'ativo');
    console.log('Admin Adriano created: contato@agenciagoodea.com / 04039866');
  } else {
    await dbAsync.run('UPDATE users SET name = ?, password = ?, role = "admin", status = "ativo" WHERE email = ?', 'Adriano Amorim', adrianoPassword, 'contato@agenciagoodea.com');
  }

  // 2. Antigo UsuÃƒÆ’Ã‚Â¡rio Admin (Digital Bordados)
  const admin = await dbAsync.get('SELECT * FROM users WHERE email = ?', 'admin@digitalbordados.com') as any;
  if (!admin) {
    await dbAsync.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Administrador', 'admin@digitalbordados.com', hashedPassword, 'admin', 'ativo');
    console.log('Test Admin created: admin@digitalbordados.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃƒÆ’Ã‚Â¡ existir
    await dbAsync.run('UPDATE users SET password = ?, role = "admin", status = "ativo" WHERE email = ?', hashedPassword, 'admin@digitalbordados.com');
  }

  // 3. UsuÃƒÆ’Ã‚Â¡rio Cliente
  const customerUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', 'cliente@teste.com') as any;
  if (!customerUser) {
    const result = await dbAsync.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 'Cliente Teste', 'cliente@teste.com', hashedPassword, 'customer', 'ativo');
    
    // Inserir dados complementares na tabela customers
    await dbAsync.run('INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)', result.lastInsertRowid, '(11) 98888-7777', '123.456.789-00');
    console.log('Test Customer created: cliente@teste.com / 123456');
  } else {
    // Garantir senha e status atualizados se jÃƒÆ’Ã‚Â¡ existir
    await dbAsync.run('UPDATE users SET password = ?, role = "customer", status = "ativo" WHERE email = ?', hashedPassword, 'cliente@teste.com');
  }
}

async function startServer() {
  console.log('Starting server initialization...');
  try {
    // Inicializa o esquema do banco de dados
    console.log('Initializing database schema...');
    initDb();
    
    const shouldSeedTestData = !isProduction && process.env.ALLOW_TEST_DATA_SEED === 'true';
    if (shouldSeedTestData) {
      console.log('Initializing test data...');
      await initTestData();
    } else {
      console.log('Skipping test data initialization.');
    }

    // Insert some mock data if empty
    const shouldSeedDemoData = process.env.SEED_DEMO_DATA === 'true';
    const count = await dbAsync.get('SELECT count(*) as count FROM product_categories') as { count: number };
    if (shouldSeedDemoData && count.count === 0) {
      console.log('Inserting mock categories and products...');
      await dbAsync.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Animais', 'animais');
      await dbAsync.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Animes', 'animes');
      await dbAsync.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Bandeiras', 'bandeiras');
      await dbAsync.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Carros', 'carros');
      await dbAsync.run('INSERT INTO product_categories (name, slug) VALUES (?, ?)', 'Infantil', 'infantil');

      await dbAsync.run(`
        INSERT INTO products (name, slug, price, sale_price, image, category_id, stitch_count, colors, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'Matriz Bordado Harley Davidson 14', 
        'matriz-bordado-harley-davidson-14', 
        22.00, 18.00, 
        'https://images.unsplash.com/photo-1558981403-c5f91ebca978?q=80&w=300&auto=format&fit=crop', 
        4, 15000, '3 cores', 1
      );
      await dbAsync.run(`
        INSERT INTO products (name, slug, price, sale_price, image, category_id, stitch_count, colors, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        'Matriz Bordado Harley Davidson 13', 
        'matriz-bordado-harley-davidson-13', 
        25.00, 22.00, 
        'https://images.unsplash.com/photo-1558981403-c5f91ebca978?q=80&w=300&auto=format&fit=crop', 
        4, 12000, '2 cores', 1
      );
      await dbAsync.run(`
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

  // Redireciona WWW para Não-WWW permanentemente (301) em produção para evitar conteúdo duplicado no SEO
  app.use((req, res, next) => {
    const host = String(req.headers.host || '').trim();
    if (host.startsWith('www.')) {
      const cleanHost = host.slice(4);
      const targetUrl = `${req.protocol}://${cleanHost}${req.originalUrl}`;
      console.log(`[Redirect] Redirecting ${host} to ${cleanHost} via 301`);
      res.writeHead(301, { Location: targetUrl });
      return res.end();
    }
    next();
  });

  // Middleware de Redirecionamento Automático Mobile <-> Desktop
  app.use((req, res, next) => {
    // Permite desligar via variável de ambiente para emergências ou testes
    const enableRedirect = String(process.env.ENABLE_MOBILE_REDIRECT || 'true').toLowerCase() === 'true';
    if (!enableRedirect) return next();

    const path = String(req.path || '');

    // Isenções estritas: não redirecionar APIs, uploads ou arquivos estáticos com extensões comuns
    if (path.startsWith('/api/') || path.startsWith('/uploads/')) return next();

    const ext = String(path.split('.').pop() || '').toLowerCase();
    const staticExtensions = ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'json', 'pdf', 'zip', 'txt', 'xml', 'map'];
    if (staticExtensions.includes(ext)) return next();

    // Verificação de cookie de escape "prefer_desktop=true"
    const preferDesktop = String(req.cookies?.prefer_desktop || '').trim().toLowerCase() === 'true';
    
    // Obter o hostname limpo sem portas (ex: 'm.digitalbordados.com.br' ou 'digitalbordados.com.br')
    // req.hostname respeita a diretiva 'trust proxy' e extrai apenas o domínio.
    const rawHost = String(req.headers.host || '').trim();
    const hostname = (req.hostname || rawHost.split(':')[0]).toLowerCase();

    if (preferDesktop) {
      // Se estiver forçando o desktop mas acessar o subdomínio mobile, deve conseguir navegar
      if (hostname === 'digitalbordados.com.br') {
        console.log(`[Mobile Redirect Log] Hostname: ${hostname} | User-Agent: N/A (Prefer Desktop) | isMobile: N/A | prefer_desktop: true | Decisão: next() (Skip redirect por cookie escape)`);
        return next();
      }
    }

    const userAgent = String(req.headers['user-agent'] || '');
    // Regex consolidado de mercado para detecção de dispositivo móvel
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Mobi/i.test(userAgent);

    const isDesktopHost = hostname === 'digitalbordados.com.br' || hostname === 'www.digitalbordados.com.br';

    if (isProduction) {
      if (isMobileDevice && !preferDesktop && isDesktopHost) {
        let cleanUrl = req.originalUrl;
        if (cleanUrl.startsWith('/index.html')) {
          cleanUrl = '/' + cleanUrl.substring('/index.html'.length);
          if (cleanUrl === '') cleanUrl = '/';
        }
        const targetUrl = `https://m.digitalbordados.com.br${cleanUrl}`;
        console.log(`[Mobile Redirect Log] Hostname: ${hostname} | User-Agent: ${userAgent} | isMobile: true | prefer_desktop: ${preferDesktop} | Decisão: REDIRECIONAR PARA MOBILE -> ${targetUrl} via 302`);
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }

      if (!isMobileDevice && hostname === 'm.digitalbordados.com.br') {
        let cleanUrl = req.originalUrl;
        if (cleanUrl.startsWith('/index.html')) {
          cleanUrl = '/' + cleanUrl.substring('/index.html'.length);
          if (cleanUrl === '') cleanUrl = '/';
        }
        const targetUrl = `https://digitalbordados.com.br${cleanUrl}`;
        console.log(`[Mobile Redirect Log] Hostname: ${hostname} | User-Agent: ${userAgent} | isMobile: false | prefer_desktop: ${preferDesktop} | Decisão: REDIRECIONAR PARA DESKTOP -> ${targetUrl} via 302`);
        res.writeHead(302, { Location: targetUrl });
        return res.end();
      }
    }

    // Log temporário detalhado para requisições que passam direto
    console.log(`[Mobile Redirect Log] Hostname: ${hostname} | User-Agent: ${userAgent.slice(0, 60)}... | isMobile: ${isMobileDevice} | prefer_desktop: ${preferDesktop} | Decisão: next() (Sem redirecionamento)`);

    next();
  });

  const normalizeOrigin = (value: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw).origin;
    } catch {
      return '';
    }
  };
  const settingsForCors = loadSettingsMap(['app_url']);
  const configuredAppUrl = String(process.env.APP_URL || settingsForCors.app_url || '').trim();
  const localOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const allowedOrigins = new Set<string>(localOrigins);
  const configuredAppOrigin = normalizeOrigin(configuredAppUrl);
  if (configuredAppOrigin) allowedOrigins.add(configuredAppOrigin);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      
      // Permitir dinamicamente o subdomínio mobile oficial e outros subdomínios autorizados
      try {
        const originUrl = new URL(origin);
        const domainPattern = /digitalbordados\.com\.br$/i;
        if (domainPattern.test(originUrl.hostname) || originUrl.hostname === 'm.digitalbordados.com.br') {
          return callback(null, true);
        }
      } catch {}

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const csrfCookie = String(req.cookies?.csrf_token || '').trim();
    if (!csrfCookie) {
      const token = generateCsrfToken();
      res.cookie('csrf_token', token, getCsrfCookieOptions(req));
      req.cookies.csrf_token = token;
    }
    return next();
  });
  app.use((req, res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
    if (!String(req.path || '').startsWith('/api/')) return next();
    if (String(req.path || '').startsWith('/api/webhooks/')) return next();

    const origin = normalizeOrigin(String(req.headers.origin || ''));
    const referer = String(req.headers.referer || '').trim();
    const refererOrigin = referer ? normalizeOrigin(referer) : '';
    const hasAuthCookie = Boolean(req.cookies?.auth_token);
    const csrfHeader = String(req.headers['x-csrf-token'] || '').trim();
    const csrfCookie = String(req.cookies?.csrf_token || '').trim();
    const isSensitiveApi = hasAuthCookie || String(req.path || '').startsWith('/api/admin/') || String(req.path || '').startsWith('/api/customer/');

    if (!isSensitiveApi) return next();

    const isDomainAllowed = (val: string): boolean => {
      if (!val) return true;
      if (allowedOrigins.has(val)) return true;
      try {
        const u = new URL(val);
        return u.hostname === 'm.digitalbordados.com.br' || u.hostname === 'novo.digitalbordados.com.br' || u.hostname.endsWith('.digitalbordados.com.br');
      } catch {
        return false;
      }
    };

    if (origin && !isDomainAllowed(origin)) {
      return res.status(403).json({ error: 'Origin bloqueada por politica de seguranca' });
    }
    if (!origin && refererOrigin && !isDomainAllowed(refererOrigin)) {
      return res.status(403).json({ error: 'Referer bloqueado por politica de seguranca' });
    }
    if (hasAuthCookie && (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader)) {
      return res.status(403).json({ error: 'CSRF token ausente ou invalido' });
    }
    return next();
  });
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  app.use('/uploads', express.static('public/uploads', {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self';");
    },
  }));
  const wpUploadsRoots = getWpUploadsRoots();
  wpUploadsRoots.forEach((root) => {
    app.use('/wp-content/uploads', express.static(root));
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Falha no upload: ${err.message}` });
    }
    if (err instanceof Error && /Tipo de arquivo nao permitido/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON invÃƒÂ¡lido no corpo da requisiÃƒÂ§ÃƒÂ£o' });
    }
    return next(err);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- SISTEMA DE ESTATÍSTICAS E ANALYTICS (MELHORIA 1) ---

  // Função auxiliar para anonimizar o IP com SHA-256
  function getIpHash(ip: string): string {
    const salt = 'db_analytics_salt_2026';
    return crypto.createHmac('sha256', salt).update(ip).digest('hex');
  }

  // Parser leve de User-Agent
  function parseUserAgent(uaString: string) {
    const ua = uaString || '';
    let browser = 'Outro';
    let os = 'Outro';
    let deviceType = 'desktop';

    // Detecção de tipo de dispositivo
    if (/mobi|android|iphone|ipad|ipod|windows phone/i.test(ua)) {
      deviceType = 'mobile';
    }

    // Detecção de Sistema Operacional
    if (/windows/i.test(ua)) {
      os = 'Windows';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = 'iOS';
    } else if (/macintosh|mac os x/i.test(ua)) {
      os = 'macOS';
    } else if (/android/i.test(ua)) {
      os = 'Android';
    } else if (/linux/i.test(ua)) {
      os = 'Linux';
    }

    // Detecção de Navegador
    if (/edg/i.test(ua)) {
      browser = 'Edge';
    } else if (/chrome|crios/i.test(ua) && !/opr|opios|edg/i.test(ua)) {
      browser = 'Chrome';
    } else if (/firefox|fxios/i.test(ua)) {
      browser = 'Firefox';
    } else if (/safari/i.test(ua) && !/chrome|crios|opr|opios|edg/i.test(ua)) {
      browser = 'Safari';
    } else if (/opr|opera/i.test(ua)) {
      browser = 'Opera';
    }

    return { browser, os, deviceType };
  }

  // Rota pública de coleta de visitas
  app.post('/api/analytics/collect', async (req, res) => {
    try {
      const { path: pagePath, full_url, page_title, referrer } = req.body || {};
      const userAgent = req.headers['user-agent'] || '';

      // 1. Ignorar se o path ou dados estiverem vazios
      if (!pagePath || typeof pagePath !== 'string') {
        return res.sendStatus(200);
      }

      // 2. Ignorar rotas administrativas ou rotas de API
      const cleanPath = pagePath.trim().split('?')[0];
      if (cleanPath.startsWith('/admin') || cleanPath.startsWith('/api')) {
        return res.sendStatus(200);
      }

      // 3. Ignorar arquivos estáticos (imagens, css, js, zip, pdf, etc.)
      if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|map|json|zip|rar|pdf|7z|txt|xml)$/i.test(cleanPath)) {
        return res.sendStatus(200);
      }

      // 4. Ignorar bots conhecidos
      const botRegex = /bot|googlebot|crawler|spider|robot|crawling|google-coop|mediapartners-google|adsbot-google|yandexbot|mail\.ru|bingbot|baidu|duckduckbot|slurp|msnbot|teoma|screaming|semrush|ahrefs|rogerbot|exabot|ia_archiver|facebookexternalhit|twitterbot/i;
      if (botRegex.test(userAgent)) {
        return res.sendStatus(200);
      }

      // 5. Obter ou gerar o visitor_id por cookie
      let visitorId = req.cookies.sb_visitor_id;
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        const secure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('sb_visitor_id', visitorId, {
          httpOnly: true,
          secure,
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 ano
          domain: isProduction ? '.digitalbordados.com.br' : undefined,
        });
      }

      // 6. Anonimizar o IP
      const clientIp = getClientIp(req);
      const ipHash = getIpHash(clientIp);

      // 7. Parsing básico de dispositivo/navegador/OS
      const { browser, os, deviceType } = parseUserAgent(userAgent);

      // 8. Salvar no banco em segundo plano
      dbAsync.run(`
        INSERT INTO site_visits (
          path, full_url, page_title, referrer, device_type, browser, os, ip_hash, visitor_id, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cleanPath,
        full_url || '',
        page_title || null,
        referrer || null,
        deviceType,
        browser,
        os,
        ipHash,
        visitorId,
        userAgent.substring(0, 1000)
      ]).catch(err => {
        console.error('[Analytics] Erro ao gravar visita no banco:', err);
      });

      return res.sendStatus(200);
    } catch (error) {
      console.error('[Analytics] Erro na rota de coleta:', error);
      return res.sendStatus(200);
    }
  });

  // API Routes - AUTH
  // Busca inteligente de produtos (Posicionada no inÃƒÂ­cio para evitar conflitos)
  app.get('/api/products/search', async (req, res) => {
    try {
      const queryStr = req.query.q as string;
      if (!queryStr || queryStr.trim().length < 2) return res.json([]);

      const searchTerm = `%${queryStr.trim()}%`;
      
      // Busca avançada abrangendo categorias, subcategorias (filhas) e com limite expandido de 100 itens
      const products = await dbAsync.all(`
        SELECT DISTINCT p.id, p.name, p.slug, p.price, p.sale_price, p.image 
        FROM products p
        WHERE (
          p.name LIKE ? 
          OR p.slug LIKE ? 
          OR p.description LIKE ?
          OR EXISTS (
            SELECT 1
            FROM product_category_relations pcr
            JOIN product_categories c ON c.id = pcr.category_id
            LEFT JOIN product_categories parent ON parent.id = c.parent_id
            WHERE pcr.product_id = p.id
              AND (
                c.name LIKE ?
                OR c.slug LIKE ?
                OR parent.name LIKE ?
                OR parent.slug LIKE ?
              )
          )
        )
        AND p.status IN ('active', 'ativo')
        ORDER BY p.id DESC
        LIMIT 100
      `, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

      return res.json(products);
    } catch (error: any) {
      console.error('SEARCH ERROR:', error);
      return res.status(500).json({ error: 'Erro interno ao processar busca' });
    }
  });

  app.post('/api/auth/register', registerRateLimitPersistent, registerRateLimit, async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      cpf,
      terms_accepted,
      privacy_accepted,
      cookie_accepted,
      marketing_accepted,
    } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos sao obrigatorios' });
    }

    try {
      const lgpd = await resolveLgpdSettings();
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
      const rawPassword = String(password || '');
      const name = `${trimmedFirstName} ${trimmedLastName}`.trim();

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: 'E-mail invalido' });
      }
      if (rawPassword.length < 8) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
      }

      const hashedPassword = await hashPassword(rawPassword);
      const verificationRequired = await resolveEmailVerificationRequired();
      const emailVerifiedAt = verificationRequired ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');

      const userId = await dbAsync.transaction(async (conn) => {
        const [userInsert] = await conn.execute(
          `INSERT INTO users (name, first_name, last_name, email, password, role, email_verified_at)
           VALUES (?, ?, ?, ?, ?, 'customer', ?)`,
          [name, trimmedFirstName, trimmedLastName, normalizedEmail, hashedPassword, emailVerifiedAt] as any,
        );
        const createdUserId = Number((userInsert as any).insertId || 0);
        await conn.execute(
          'INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)',
          [createdUserId, phone ? String(phone).trim() : null, cpf ? String(cpf).trim() : null] as any,
        );
        return createdUserId;
      });

      if (lgpd.enabled) {
        if (parseBooleanSetting(privacy_accepted, false)) {
          await recordPolicyAcceptance({
            userId,
            policyType: 'privacy',
            policyVersion: lgpd.policyVersionPrivacy,
            req,
            source: 'register',
          });
          await upsertUserConsent({
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
          await recordPolicyAcceptance({
            userId,
            policyType: 'terms',
            policyVersion: lgpd.policyVersionTerms,
            req,
            source: 'register',
          });
          await upsertUserConsent({
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
          await recordPolicyAcceptance({
            userId,
            policyType: 'cookies',
            policyVersion: lgpd.policyVersionCookies,
            req,
            source: 'register',
          });
          await upsertUserConsent({
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

        await upsertUserConsent({
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

  app.post('/api/auth/login', loginRateLimitPersistent, loginRateLimit, async (req, res) => {
    try {
      const { email, password, mfa_code, mfa_challenge_id } = req.body || {};
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const normalizedPassword = typeof password === 'string' ? password : '';
      const normalizedMfaCode = typeof mfa_code === 'string' ? mfa_code.trim() : '';
      const normalizedMfaChallengeId = Number(mfa_challenge_id || 0);
      const ip = getClientIp(req);
      const verificationRequired = await resolveEmailVerificationRequired();

      if (!normalizedEmail || !normalizedPassword) {
        return res.status(400).json({ error: 'E-mail e senha sao obrigatorios' });
      }

      const attemptStats = await getLoginAttemptStats(normalizedEmail, ip);
      if (attemptStats.failCount >= LOGIN_ATTEMPT_MAX_FAILS) {
        return res.status(429).json({
          error: 'Muitas tentativas invalidas. Aguarde alguns minutos e tente novamente.',
          retry_in_minutes: LOGIN_ATTEMPT_WINDOW_MINUTES,
        });
      }

      console.log(`Tentativa de login: ${normalizedEmail}`);
      const user = await dbAsync.get('SELECT * FROM users WHERE email = ?', normalizedEmail) as any;

      if (!user) {
        console.log(`Falha no login: Usuario nao encontrado - ${normalizedEmail}`);
        await recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (!user.password || typeof user.password !== 'string') {
        console.error('Falha no login: usuario sem hash de senha valido', { userId: user.id, email: normalizedEmail });
        await recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(500).json({ error: 'Conta sem senha valida. Redefina a senha do usuario.' });
      }

      let passwordIsValid = false;
      try {
        passwordIsValid = await comparePassword(normalizedPassword, user.password);
      } catch (compareError) {
        console.error('Erro ao validar senha:', compareError);
        await recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(500).json({ error: 'Erro ao validar credenciais' });
      }

      if (!passwordIsValid) {
        console.log(`Falha no login: Senha incorreta para ${normalizedEmail}`);
        await recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(401).json({ error: 'E-mail ou senha incorretos' });
      }

      if (user.status !== 'ativo' && user.status !== 'active') {
        console.log(`Falha no login: Usuario inativo (${user.status}) - ${normalizedEmail}`);
        await recordLoginAttempt(normalizedEmail, ip, false);
        return res.status(403).json({ error: 'Esta conta esta inativa' });
      }

      const adminMfaEnabled = shouldRequireAdminMfa() && user.role === 'admin';
      if (adminMfaEnabled) {
        if (Number.isFinite(normalizedMfaChallengeId) && normalizedMfaChallengeId > 0 && normalizedMfaCode) {
          const challenge = await dbAsync.get(
            'SELECT * FROM admin_mfa_challenges WHERE id = ? AND user_id = ? AND used = 0 LIMIT 1',
            normalizedMfaChallengeId,
            Number(user.id),
          ) as any;
          if (!challenge) {
            await recordLoginAttempt(normalizedEmail, ip, false);
            return res.status(401).json({ error: 'Desafio MFA invalido. Tente login novamente.' });
          }
          const expired = new Date(challenge.expires_at).getTime() < Date.now();
          if (expired || Number(challenge.attempts || 0) >= 5) {
            await dbAsync.run('UPDATE admin_mfa_challenges SET used = 1 WHERE id = ?', Number(challenge.id));
            await recordLoginAttempt(normalizedEmail, ip, false);
            return res.status(401).json({ error: 'Codigo MFA expirado. Inicie um novo login.' });
          }
          const expectedHash = String(challenge.code_hash || '');
          const providedHash = hashMfaCode(normalizedMfaCode);
          if (expectedHash !== providedHash) {
            await dbAsync.run('UPDATE admin_mfa_challenges SET attempts = attempts + 1 WHERE id = ?', Number(challenge.id));
            await recordLoginAttempt(normalizedEmail, ip, false);
            return res.status(401).json({ error: 'Codigo MFA invalido.' });
          }
          await dbAsync.run('UPDATE admin_mfa_challenges SET used = 1 WHERE id = ?', Number(challenge.id));
        } else {
          const otp = String(Math.floor(100000 + Math.random() * 900000));
          const otpHash = hashMfaCode(otp);
          const mfaTtlMinutes = Math.max(3, Number(process.env.ADMIN_MFA_TTL_MINUTES || '10'));
          const challengeInsert = await dbAsync.run(
            'INSERT INTO admin_mfa_challenges (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
            Number(user.id),
            otpHash,
            mfaTtlMinutes,
          );
          const appUrl = buildBaseAppUrl(req);
          await sendEmail({
            to: String(user.email || normalizedEmail),
            templateKey: 'password_reset',
            variables: {
              name: user.name || 'Administrador',
              reset_url: `${appUrl}/login`,
              expiry_hours: (mfaTtlMinutes / 60).toFixed(1),
              code: otp,
              mfa_code: otp,
              login_url: `${appUrl}/login`,
            },
          }).catch((err) => console.error('Failed to send admin MFA code:', err));

          return res.status(202).json({
            success: false,
            mfa_required: true,
            mfa_challenge_id: Number(challengeInsert.lastInsertRowid),
            message: 'Codigo de verificacao enviado para seu e-mail.',
          });
        }
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
      await recordLoginAttempt(normalizedEmail, ip, true);
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

  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.json({ user: null });

    const decoded = verifyToken(token) as any;
    if (!decoded || typeof decoded === 'string' || !decoded.id) {
      res.clearCookie('auth_token');
      return res.json({ user: null });
    }

    // Consulta o DB para retornar dados atualizados (incluindo avatar_url)
    try {
      const fresh = await dbAsync.get('SELECT id, name, email, role, avatar_url, email_verified_at, privacy_reaccept_required FROM users WHERE id = ?', Number(decoded.id)) as any;
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

      const verificationRequired = await resolveEmailVerificationRequired();
      if (!verificationRequired) {
        return res.json({ success: true, message: 'Verificacao de e-mail desativada nas configuracoes.' });
      }

      const user = await dbAsync.get('SELECT id, name, email, status, email_verified_at FROM users WHERE email = ? LIMIT 1', normalizedEmail) as any;
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

  app.get('/api/auth/verify-email', async (req, res) => {
    try {
      const token = String(req.query.token || '').trim();
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token ausente' });
      }

      const tokenHash = sha256(token);
      const verification = await dbAsync.get(
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

      await dbAsync.transaction(async (conn) => {
        await conn.execute(
          'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [Number(verification.user_id)],
        );
        await conn.execute('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', [Number(verification.id)]);
      });

      return res.json({ success: true, message: 'E-mail confirmado com sucesso' });
    } catch (error) {
      console.error('Verify email error:', error);
      return res.status(500).json({ success: false, error: 'Erro ao confirmar e-mail' });
    }
  });

  // API Routes - FAVORITES
  app.get('/api/favorites', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const newBadgeDays = await resolveNewBadgeDays();
      const favorites = await dbAsync.all(`
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

  app.post('/api/favorites/:productId', authenticate, async (req, res) => {
    const user = (req as any).user;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'product_id invÃƒÂ¡lido' });
    }

    const product = await dbAsync.get('SELECT id, status FROM products WHERE id = ?', productId) as any;
    if (!product || product.status !== 'active') {
      return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });
    }

    try {
      await dbAsync.run('INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)', user.id, productId);
      return res.status(201).json({ success: true, product_id: productId });
    } catch (error) {
      console.error('Add Favorite Error:', error);
      return res.status(500).json({ error: 'Erro ao adicionar favorito' });
    }
  });

  app.delete('/api/favorites/:productId', authenticate, async (req, res) => {
    const user = (req as any).user;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'product_id invÃƒÂ¡lido' });
    }

    try {
      await dbAsync.run('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', user.id, productId);
      return res.json({ success: true, product_id: productId });
    } catch (error) {
      console.error('Remove Favorite Error:', error);
      return res.status(500).json({ error: 'Erro ao remover favorito' });
    }
  });

  app.post('/api/auth/forgot-password', forgotPasswordRateLimitPersistent, forgotPasswordRateLimit, async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'E-mail obrigatorio' });
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ error: 'E-mail invalido' });
      }

      const user = await dbAsync.get('SELECT * FROM users WHERE email = ?', normalizedEmail) as any;
      if (!user) {
        // Return success even if user not found for security reasons
        return res.json({ success: true });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      await dbAsync.run(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        user.id,
        token,
        expiresAt.toISOString().slice(0, 19).replace('T', ' ')
      );

      const settings = await loadSettingsMapAsync(['app_url']);
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
      res.status(500).json({ error: 'Erro interno ao solicitar recupera\u00e7\u00e3o de senha' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, new_password } = req.body || {};
      if (!token || !new_password) return res.status(400).json({ error: 'Token e nova senha s\u00e3o obrigat\u00f3rios' });
      if (String(new_password).length < 8) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
      }

      const resetRequest = await dbAsync.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP',
        token
      ) as any;

      if (!resetRequest) {
        return res.status(400).json({ error: 'Token inv\u00e1lido ou expirado' });
      }

      const hashedPassword = await hashPassword(new_password);
      await dbAsync.run('UPDATE users SET password = ? WHERE id = ?', hashedPassword, resetRequest.user_id);
      await dbAsync.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', resetRequest.id);

      const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', resetRequest.user_id) as any;
      if (user) {
        const settings = await loadSettingsMapAsync(['app_url']);
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

  // --- SISTEMA DE ESTATÍSTICAS E ANALYTICS - ENDPOINTS DO ADMIN (MELHORIA 1) ---

  // Função auxiliar para gerar filtro SQL de períodos
  function getPeriodSqlFilter(period: string, startDate?: string, endDate?: string) {
    let dateFilter = 'created_at >= CURDATE()'; // default: hoje
    let params: any[] = [];

    if (period === 'yesterday') {
      dateFilter = 'created_at >= CURDATE() - INTERVAL 1 DAY AND created_at < CURDATE()';
    } else if (period === 'week') {
      dateFilter = 'created_at >= CURDATE() - INTERVAL 6 DAY';
    } else if (period === 'month') {
      dateFilter = 'created_at >= CURDATE() - INTERVAL 29 DAY';
    } else if (period === 'year') {
      dateFilter = 'created_at >= CURDATE() - INTERVAL 364 DAY';
    } else if (period === 'custom' && startDate) {
      if (endDate) {
        dateFilter = 'created_at >= ? AND created_at <= ?';
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params = [start, end];
      } else {
        dateFilter = 'created_at >= ?';
        params = [new Date(startDate)];
      }
    } else if (period === 'specific' && startDate) {
      dateFilter = 'DATE(created_at) = DATE(?)';
      params = [startDate];
    }

    return { dateFilter, params };
  }

  // API de Métricas de SEO
  app.get('/api/admin/seo/dashboard-metrics', authenticate, isAdmin, async (req, res) => {
    try {
      const totalProductsRes = await dbAsync.get('SELECT COUNT(*) as count FROM products WHERE status = "active"') as any;
      const totalProducts = Number(totalProductsRes?.count || 0);

      const withoutAltRes = await dbAsync.all('SELECT id, name FROM products WHERE status = "active" AND image IS NOT NULL AND image != "" AND (image_alt IS NULL OR TRIM(image_alt) = "")') as any[];
      const withoutDescRes = await dbAsync.all('SELECT id, name, description FROM products WHERE status = "active" AND (description IS NULL OR TRIM(description) = "" OR LENGTH(TRIM(description)) < 30)') as any[];

      const withoutCategoryRes = await dbAsync.all(`
        SELECT id, name FROM products 
        WHERE status = "active" 
        AND (category_id IS NULL OR category_id = 0)
        AND id NOT IN (SELECT DISTINCT product_id FROM product_category_relations)
      `) as any[];

      const duplicateTitlesRes = await dbAsync.all(`
        SELECT name, COUNT(*) as count 
        FROM products 
        WHERE status = "active" 
        GROUP BY name 
        HAVING count > 1
      `) as any[];
      
      const duplicateNames = duplicateTitlesRes.map(d => d.name);
      const duplicateProducts = duplicateNames.length > 0 
        ? await dbAsync.all(`SELECT id, name FROM products WHERE status = "active" AND name IN (${duplicateNames.map(() => '?').join(',')})`, ...duplicateNames) as any[]
        : [];

      const shoppingEligibleRes = await dbAsync.get(`
        SELECT COUNT(*) as count 
        FROM products 
        WHERE status = "active" 
        AND price > 0 
        AND image IS NOT NULL AND image != "" 
        AND description IS NOT NULL AND LENGTH(description) >= 10
      `) as any;
      const shoppingEligible = Number(shoppingEligibleRes?.count || 0);

      const alerts: any[] = [];
      
      withoutAltRes.forEach(p => {
        alerts.push({
          type: 'alt_missing',
          severity: 'warning',
          message: `O produto "${p.name}" está sem texto descritivo ALT na imagem principal.`,
          productId: p.id,
          productName: p.name
        });
      });

      withoutDescRes.forEach(p => {
        const isShort = p.description && p.description.trim().length > 0;
        alerts.push({
          type: isShort ? 'description_short' : 'description_short',
          severity: 'warning',
          message: isShort 
            ? `O produto "${p.name}" tem uma descrição curta (${p.description.trim().length} carac.). SEO fraco.`
            : `O produto "${p.name}" está sem nenhuma descrição cadastrada.`,
          productId: p.id,
          productName: p.name
        });
      });

      withoutCategoryRes.forEach(p => {
        alerts.push({
          type: 'category_missing',
          severity: 'warning',
          message: `O produto "${p.name}" não está associado a nenhuma categoria.`,
          productId: p.id,
          productName: p.name
        });
      });

      duplicateProducts.forEach(p => {
        alerts.push({
          type: 'duplicate_title',
          severity: 'danger',
          message: `O título "${p.name}" está duplicado com outro produto ativo.`,
          productId: p.id,
          productName: p.name
        });
      });

      const sitemapsCount = 4; // Static, Products, Categories, Images
      
      return res.json({
        totalProducts,
        shoppingEligible,
        productsWithoutAlt: withoutAltRes.length,
        productsWithoutDescription: withoutDescRes.length,
        productsWithoutCategory: withoutCategoryRes.length,
        productsWithDuplicateTitles: duplicateProducts.length,
        sitemapsCount,
        alerts
      });
    } catch (error) {
      console.error('SEO Dashboard metrics error:', error);
      return res.status(500).json({ error: 'Erro ao buscar métricas de SEO' });
    }
  });

  // Resumo de estatísticas
  app.get('/api/admin/analytics/summary', authenticate, isAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || 'today');
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

      const { dateFilter, params } = getPeriodSqlFilter(period, startDate, endDate);

      // 1. Total de visitas no período
      const totalQuery = dbAsync.get(`SELECT COUNT(*) as count FROM site_visits WHERE ${dateFilter}`, ...params);
      
      // 2. Visitantes únicos no período
      const uniqueQuery = dbAsync.get(`SELECT COUNT(DISTINCT visitor_id) as count FROM site_visits WHERE ${dateFilter}`, ...params);
      
      // 3. Página mais visitada no período
      const topPageQuery = dbAsync.get(`
        SELECT path, page_title, COUNT(*) as count 
        FROM site_visits 
        WHERE ${dateFilter} 
        GROUP BY path, page_title 
        ORDER BY count DESC 
        LIMIT 1
      `, ...params);

      // 4. Desktop vs Mobile no período
      const deviceQuery = dbAsync.all(`
        SELECT device_type, COUNT(*) as count 
        FROM site_visits 
        WHERE ${dateFilter} 
        GROUP BY device_type
      `, ...params);

      // 5. Contadores fixos para os cards
      const todayQuery = dbAsync.get("SELECT COUNT(*) as count FROM site_visits WHERE created_at >= CURDATE()");
      const weekQuery = dbAsync.get("SELECT COUNT(*) as count FROM site_visits WHERE created_at >= CURDATE() - INTERVAL 6 DAY");
      const monthQuery = dbAsync.get("SELECT COUNT(*) as count FROM site_visits WHERE created_at >= CURDATE() - INTERVAL 29 DAY");
      const yearQuery = dbAsync.get("SELECT COUNT(*) as count FROM site_visits WHERE created_at >= CURDATE() - INTERVAL 364 DAY");

      const [
        totalRes, 
        uniqueRes, 
        topPageRes, 
        deviceRes, 
        todayRes, 
        weekRes, 
        monthRes, 
        yearRes
      ] = await Promise.all([
        totalQuery, 
        uniqueQuery, 
        topPageQuery, 
        deviceQuery, 
        todayQuery, 
        weekQuery, 
        monthQuery, 
        yearQuery
      ]);

      let desktopVisits = 0;
      let mobileVisits = 0;
      if (Array.isArray(deviceRes)) {
        deviceRes.forEach((row: any) => {
          if (row.device_type === 'desktop') desktopVisits = Number(row.count || 0);
          if (row.device_type === 'mobile') mobileVisits = Number(row.count || 0);
        });
      }

      res.json({
        totalVisits: Number(totalRes?.count || 0),
        uniqueVisitors: Number(uniqueRes?.count || 0),
        mostVisitedPage: topPageRes ? {
          path: topPageRes.path,
          page_title: topPageRes.page_title,
          visits: Number(topPageRes.count || 0)
        } : null,
        devices: {
          desktop: desktopVisits,
          mobile: mobileVisits
        },
        cards: {
          today: Number(todayRes?.count || 0),
          week: Number(weekRes?.count || 0),
          month: Number(monthRes?.count || 0),
          year: Number(yearRes?.count || 0)
        }
      });
    } catch (error) {
      console.error('[Analytics Summary] Error:', error);
      res.status(500).json({ error: 'Erro ao buscar resumo de estatísticas' });
    }
  });

  // Lista das páginas mais acessadas
  app.get('/api/admin/analytics/top-pages', authenticate, isAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || 'today');
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      
      const orderBy = req.query.orderBy === 'path' ? 'path' : 'visits';
      const order = req.query.order === 'ASC' ? 'ASC' : 'DESC';

      const { dateFilter, params } = getPeriodSqlFilter(period, startDate, endDate);

      const topPages = await dbAsync.all(`
        SELECT 
          path, 
          MAX(page_title) as page_title, 
          COUNT(*) as visits, 
          COUNT(DISTINCT visitor_id) as unique_visitors 
        FROM site_visits 
        WHERE ${dateFilter} 
        GROUP BY path 
        ORDER BY ${orderBy === 'path' ? 'path' : 'visits'} ${order}
        LIMIT 100
      `, ...params);

      res.json(topPages);
    } catch (error) {
      console.error('[Analytics Top Pages] Error:', error);
      res.status(500).json({ error: 'Erro ao buscar páginas mais acessadas' });
    }
  });

  // Dados do gráfico de acessos
  app.get('/api/admin/analytics/visits-chart', authenticate, isAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || 'today');
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

      const { dateFilter, params } = getPeriodSqlFilter(period, startDate, endDate);

      let groupSql = '';
      let selectSql = '';
      let formatType = 'day';

      if (period === 'today' || period === 'yesterday' || (period === 'specific' && startDate)) {
        selectSql = 'HOUR(created_at) as label_key';
        groupSql = 'HOUR(created_at)';
        formatType = 'hour';
      } else if (period === 'year') {
        selectSql = "DATE_FORMAT(created_at, '%Y-%m') as label_key";
        groupSql = "DATE_FORMAT(created_at, '%Y-%m')";
        formatType = 'month';
      } else {
        let isLongCustom = false;
        if (period === 'custom' && startDate && endDate) {
          const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays > 60) {
            isLongCustom = true;
          }
        }

        if (isLongCustom) {
          selectSql = "DATE_FORMAT(created_at, '%Y-%m') as label_key";
          groupSql = "DATE_FORMAT(created_at, '%Y-%m')";
          formatType = 'month';
        } else {
          selectSql = "DATE(created_at) as label_key";
          groupSql = "DATE(created_at)";
          formatType = 'day';
        }
      }

      const rows = await dbAsync.all(`
        SELECT 
          ${selectSql}, 
          COUNT(*) as visits, 
          COUNT(DISTINCT visitor_id) as unique_visitors 
        FROM site_visits 
        WHERE ${dateFilter} 
        GROUP BY ${groupSql} 
        ORDER BY label_key ASC
      `, ...params) as any[];

      let chartData: any[] = [];

      if (formatType === 'hour') {
        const map = new Map(rows.map(r => [Number(r.label_key), r]));
        for (let h = 0; h < 24; h++) {
          const matched = map.get(h);
          chartData.push({
            name: `${String(h).padStart(2, '0')}:00`,
            visits: matched ? Number(matched.visits || 0) : 0,
            unique_visitors: matched ? Number(matched.unique_visitors || 0) : 0
          });
        }
      } else if (formatType === 'day') {
        let start = new Date();
        let end = new Date();
        
        if (period === 'week') {
          start.setDate(start.getDate() - 6);
        } else if (period === 'month') {
          start.setDate(start.getDate() - 29);
        } else if (period === 'custom' && startDate) {
          start = new Date(startDate);
          if (endDate) end = new Date(endDate);
        }

        const map = new Map();
        rows.forEach(r => {
          let dateStr = '';
          if (r.label_key instanceof Date) {
            dateStr = r.label_key.toISOString().split('T')[0];
          } else {
            dateStr = String(r.label_key).split('T')[0];
          }
          map.set(dateStr, r);
        });

        const current = new Date(start);
        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          const matched = map.get(dateStr);
          
          const day = String(current.getDate()).padStart(2, '0');
          const month = String(current.getMonth() + 1).padStart(2, '0');
          
          chartData.push({
            name: `${day}/${month}`,
            dateFull: dateStr,
            visits: matched ? Number(matched.visits || 0) : 0,
            unique_visitors: matched ? Number(matched.unique_visitors || 0) : 0
          });
          
          current.setDate(current.getDate() + 1);
        }
      } else {
        const map = new Map(rows.map(r => [String(r.label_key), r]));
        let start = new Date();
        let end = new Date();

        if (period === 'year') {
          start.setDate(start.getDate() - 364);
        } else if (period === 'custom' && startDate) {
          start = new Date(startDate);
          if (endDate) end = new Date(endDate);
        }

        const current = new Date(start);
        current.setDate(1);
        const endMonthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;

        while (true) {
          const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
          const matched = map.get(monthKey);
          
          const monthName = current.toLocaleDateString('pt-BR', { month: 'short' });
          const yearShort = String(current.getFullYear()).slice(-2);
          
          chartData.push({
            name: `${monthName}/${yearShort}`,
            visits: matched ? Number(matched.visits || 0) : 0,
            unique_visitors: matched ? Number(matched.unique_visitors || 0) : 0
          });

          if (monthKey === endMonthKey) break;
          current.setMonth(current.getMonth() + 1);
          if (current.getFullYear() > end.getFullYear() + 2) break;
        }
      }

      res.json(chartData);
    } catch (error) {
      console.error('[Analytics Chart] Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados do gráfico' });
    }
  });

  // API Routes - ADMIN PRODUCTS
  app.get('/api/admin/products', authenticate, isAdmin, async (req, res) => {
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

      const products = await dbAsync.all(`
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

      const totalResult = await dbAsync.get(`
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
  ]), async (req, res) => {
    const { 
      name, slug, description, short_description, price, sale_price, promotional_price, production_sheet,
      category_id, category_ids, stitch_count, colors, is_featured, is_new,
      seo_title, seo_description, seo_keywords, canonical_url, noindex, tags, tag_ids, downloadable_files, gallery_urls, image_alt, gallery_alts_existing, gallery_alts_new
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
    const parseStringArray = (rawValue: any): string[] => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return [];
      if (Array.isArray(rawValue)) return rawValue.map((value) => String(value || '').trim());
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map((value) => String(value || '').trim());
        } catch {
          return trimmed.split(',').map((value) => String(value || '').trim());
        }
      }
      return [];
    };

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome do produto ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
    }

    const safeDescription = description !== undefined ? (sanitizeRichHtml(description).trim() || null) : null;
    const safeShortDescription = short_description !== undefined ? (sanitizeRichHtml(short_description).trim() || null) : null;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
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

    const slugBase = typeof slug === 'string' && slug.trim() ? slug.trim() : normalizedName;
    const uniqueSlug = await createUniqueProductSlug(slugBase);

    try {
      const result = await dbAsync.run(`
        INSERT INTO products (
          name, slug, description, short_description, price, sale_price, 
          image, image_alt, production_sheet, category_id, stitch_count, colors, is_featured, is_new,
          seo_title, seo_description, seo_keywords, canonical_url, noindex
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, normalizedName, uniqueSlug, safeDescription, safeShortDescription, finalPrice, finalSalePrice, null, String(image_alt || '').trim() || null, null, normalizedCategoryId, normalizedStitchCount, colors || null, is_featured === 'true' || is_featured === '1' ? 1 : 0, is_new === 'true' || is_new === '1' ? 1 : 0, seo_title || null, seo_description || null, seo_keywords || null, canonical_url || null, noindex === 'true' || noindex === '1' ? 1 : 0);

      const productId = result.lastInsertRowid;
      const productIdNumber = Number(productId);

      const publicUploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
      const privateUploadsDir = path.resolve(process.cwd(), 'uploads', 'arquivos');
      const normalizedSlug = uniqueSlug;

      let mainImagePath: string | null = null;
      if (files['image']?.[0]) {
        const file = files['image'][0];
        // A saída final sempre será .jpg (após watermark)
        const finalName = buildProductMediaName(normalizedSlug, productIdNumber, '.jpg');
        const physicalPath = path.join(publicUploadsDir, finalName);
        const tempPath = file.path;

        // Aplicar marca d'água
        await applyWatermark(tempPath, physicalPath);

        // Remover arquivo temporário original
        if (fs.existsSync(tempPath) && tempPath !== physicalPath) {
          try { fs.unlinkSync(tempPath); } catch (_) { /* ignorar */ }
        }
        
        // Validação física estrita
        if (!fs.existsSync(physicalPath)) {
          // Desfazer inserção do produto
          await dbAsync.run('DELETE FROM products WHERE id = ?', productIdNumber);
          return res.status(500).json({ error: 'Erro de disco: A imagem principal não pôde ser gravada fisicamente no servidor.' });
        }
        mainImagePath = `/uploads/${finalName}`;
      }

      let productionSheetValue: string | null = (typeof production_sheet === 'string' ? production_sheet.trim() : '') || null;
      if (files['production_sheet']?.[0]) {
        const file = files['production_sheet'][0];
        const ext = path.extname(file.originalname || file.filename || '').toLowerCase() || '.pdf';
        const finalName = buildProductMediaName(normalizedSlug, productIdNumber, ext);
        const targetPath = path.join(publicUploadsDir, finalName);

        moveUploadedFileToFinalPath(file, publicUploadsDir, finalName);

        // Validação física estrita
        if (!fs.existsSync(targetPath)) {
          // Desfazer inserção do produto
          await dbAsync.run('DELETE FROM products WHERE id = ?', productIdNumber);
          return res.status(500).json({ error: 'Erro de disco: O PDF da Folha de Produção não pôde ser gravado fisicamente no servidor.' });
        }
        const stats = fs.statSync(targetPath);
        if (stats.size === 0) {
          // Desfazer inserção do produto
          await dbAsync.run('DELETE FROM products WHERE id = ?', productIdNumber);
          try { fs.unlinkSync(targetPath); } catch (_) {}
          return res.status(500).json({ error: 'Erro de disco: O arquivo PDF da Folha de Produção resultante possui tamanho igual a zero.' });
        }
        productionSheetValue = `/uploads/${finalName}`;
      }

      await dbAsync.run('UPDATE products SET image = ?, production_sheet = ? WHERE id = ?', mainImagePath, productionSheetValue, productIdNumber);

      const parsedCategoryIds = parseIdArray(category_ids);
      const finalCategoryIds = parsedCategoryIds.length > 0
        ? parsedCategoryIds
        : (normalizedCategoryId ? [normalizedCategoryId] : []);
      for (const categoryRelationId of finalCategoryIds) {
        await dbAsync.run('INSERT IGNORE INTO product_category_relations (product_id, category_id) VALUES (?, ?)', productId, categoryRelationId);
      }

      // Galeria
      const parsedGalleryAltsExisting = parseStringArray(gallery_alts_existing);
      const parsedGalleryAltsNew = parseStringArray(gallery_alts_new);

      if (files['gallery']) {
        for (const [index, f] of files['gallery'].entries()) {
          // A saída final sempre será .jpg (após watermark)
          const finalName = buildProductMediaName(normalizedSlug, productIdNumber, '.jpg', `g${index + 1}`);
          const physicalPath = path.join(publicUploadsDir, finalName);
          // Aplicar marca d'água sobre a imagem de galeria
          await applyWatermark(f.path, physicalPath);
          // Remover arquivo temporário original
          if (fs.existsSync(f.path) && f.path !== physicalPath) {
            try { fs.unlinkSync(f.path); } catch (_) { /* ignorar */ }
          }
          await dbAsync.run('INSERT IGNORE INTO product_images (product_id, url, alt_text, file_type) VALUES (?, ?, ?, ?)', productId, `/uploads/${finalName}`, parsedGalleryAltsNew[index] || null, 'gallery');
        }
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

        for (const [index, url] of parsedGalleryUrls.entries()) {
          await dbAsync.run('INSERT IGNORE INTO product_images (product_id, url, alt_text, file_type) VALUES (?, ?, ?, ?)', productId, url, parsedGalleryAltsExisting[index] || null, 'gallery');
        }
      }

      // Arquivos de Produção
      if (files['production_files']) {
        for (const [index, f] of files['production_files'].entries()) {
          const ext = path.extname(f.originalname || f.filename || '').toLowerCase() || '.zip';
          const suffix = index === 0 ? undefined : `a${index + 1}`;
          const finalName = buildProductMediaName(normalizedSlug, productIdNumber, ext, suffix);
          const targetPath = path.join(privateUploadsDir, finalName);

          moveUploadedFileToFinalPath(f, privateUploadsDir, finalName);

          // Validação física estrita
          if (!fs.existsSync(targetPath)) {
            // Desfazer inserção do produto
            await dbAsync.run('DELETE FROM products WHERE id = ?', productIdNumber);
            return res.status(500).json({ error: `Erro de disco: O arquivo de matriz ZIP (${finalName}) não pôde ser gravado fisicamente no servidor.` });
          }
          const stats = fs.statSync(targetPath);
          if (stats.size === 0) {
            await dbAsync.run('DELETE FROM products WHERE id = ?', productIdNumber);
            try { fs.unlinkSync(targetPath); } catch (_) {}
            return res.status(500).json({ error: `Erro de disco: O arquivo de matriz ZIP (${finalName}) gravado possui tamanho igual a zero.` });
          }

          await dbAsync.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, finalName, `/uploads/arquivos/${finalName}`, 'production');
        }
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

        for (const file of parsedDownloadableFiles) {
          if (typeof file === 'string') {
            const fileName = file.split('/').pop() || file;
            await dbAsync.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, file, 'downloadable');
            continue;
          }

          const filePath = file?.file_path || file?.path || file?.url;
          if (!filePath) continue;
          const fileName = file?.file_name || file?.name || filePath.split('/').pop() || 'arquivo';
          const fileType = file?.file_type || file?.type || 'downloadable';
          await dbAsync.run('INSERT IGNORE INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, filePath, fileType);
        }
      }

      // Tags
      const parsedTagIds = parseIdArray(tag_ids ?? tags);
      if (parsedTagIds.length > 0) {
        for (const tagId of parsedTagIds) {
          await dbAsync.run('INSERT IGNORE INTO product_tag_relations (product_id, tag_id) VALUES (?, ?)', productId, tagId);
        }
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
  ]), async (req, res) => {
    const productId = Number(req.params.id);
    const existingProduct = await dbAsync.get('SELECT * FROM products WHERE id = ?', productId) as any;

    console.log('[PUT /api/admin/products/:id] req.body:', JSON.stringify(req.body));

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
      seo_title,
      seo_description,
      seo_keywords,
      canonical_url,
      noindex,
      tags,
      tag_ids,
      downloadable_files,
      gallery_urls,
      image_alt,
      gallery_alts_existing,
      gallery_alts_new
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
    const parseStringArray = (rawValue: any): string[] => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return [];
      if (Array.isArray(rawValue)) return rawValue.map((value) => String(value || '').trim());
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map((value) => String(value || '').trim());
        } catch {
          return trimmed.split(',').map((value) => String(value || '').trim());
        }
      }
      return [];
    };

    const nextName = name ?? existingProduct.name;
    const nextSlug = slug
      ? slugify(slug, { lower: true })
      : slugify(nextName, { lower: true });
    const slugChanged = nextSlug && nextSlug !== existingProduct.slug;
    const nextDescription = description !== undefined
      ? (sanitizeRichHtml(description).trim() || null)
      : existingProduct.description;
    const nextShortDescription = short_description !== undefined
      ? (sanitizeRichHtml(short_description).trim() || null)
      : existingProduct.short_description;
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
    const nextSeoTitle = seo_title !== undefined ? (String(seo_title || '').trim() || null) : existingProduct.seo_title;
    const nextSeoDescription = seo_description !== undefined ? (String(seo_description || '').trim() || null) : existingProduct.seo_description;
    const nextSeoKeywords = seo_keywords !== undefined ? (String(seo_keywords || '').trim() || null) : existingProduct.seo_keywords;
    const nextCanonicalUrl = canonical_url !== undefined ? (String(canonical_url || '').trim() || null) : existingProduct.canonical_url;
    const nextImageAlt = image_alt !== undefined ? (String(image_alt || '').trim() || null) : existingProduct.image_alt;
    const nextNoindex = noindex !== undefined
      ? (String(noindex) === 'true' || String(noindex) === '1' ? 1 : 0)
      : Number(existingProduct.noindex || 0);

    if (nextStitchCount !== null && !Number.isFinite(Number(nextStitchCount))) {
      return res.status(400).json({ error: 'Quantidade de pontos invÃƒÂ¡lida' });
    }

    const publicUploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    const privateUploadsDir = path.resolve(process.cwd(), 'uploads', 'arquivos');

    const imageUpload = files['image']?.[0];
    let nextImagePath = existingProduct.image;
    if (imageUpload) {
      // A saída final sempre será .jpg (após watermark)
      const finalName = buildProductMediaName(nextSlug, productId, '.jpg');
      const physicalPath = path.join(publicUploadsDir, finalName);
      const tempPath = imageUpload.path;

      // Aplicar marca d'água
      await applyWatermark(tempPath, physicalPath);

      // Remover arquivo temporário original
      if (fs.existsSync(tempPath) && tempPath !== physicalPath) {
        try { fs.unlinkSync(tempPath); } catch (_) { /* ignorar */ }
      }

      // Validação física estrita
      if (!fs.existsSync(physicalPath)) {
        return res.status(500).json({ error: 'Erro de disco: A imagem principal editada não pôde ser gravada fisicamente no servidor.' });
      }
      nextImagePath = `/uploads/${finalName}`;
    } else if (slugChanged && existingProduct.image && typeof existingProduct.image === 'string' && existingProduct.image.startsWith('/uploads/')) {
      // Se o slug mudou e temos imagem principal existente, renomear o arquivo no disco
      const oldImageName = existingProduct.image.split('/').pop();
      if (oldImageName) {
        const oldExt = path.extname(oldImageName).toLowerCase() || '.jpg';
        const newImageName = buildProductMediaName(nextSlug, productId, oldExt);
        if (oldImageName !== newImageName) {
          const oldPhysicalPath = path.join(publicUploadsDir, oldImageName);
          const newPhysicalPath = path.join(publicUploadsDir, newImageName);
          if (fs.existsSync(oldPhysicalPath)) {
            try {
              fs.renameSync(oldPhysicalPath, newPhysicalPath);
              nextImagePath = `/uploads/${newImageName}`;
              console.log(`[Slug Change] Imagem principal física renomeada de ${oldImageName} para ${newImageName}`);
            } catch (err) {
              console.error('Erro ao renomear imagem física por mudança de slug:', err);
            }
          }
        }
      }
    }

    const productionSheetUpload = files['production_sheet']?.[0];
    let nextProductionSheet = existingProduct.production_sheet;
    if (productionSheetUpload) {
      const ext = path.extname(productionSheetUpload.originalname || productionSheetUpload.filename || '').toLowerCase() || '.pdf';
      const finalName = buildProductMediaName(nextSlug, productId, ext);
      const targetPath = path.join(publicUploadsDir, finalName);

      moveUploadedFileToFinalPath(productionSheetUpload, publicUploadsDir, finalName);

      // Validação física estrita
      if (!fs.existsSync(targetPath)) {
        return res.status(500).json({ error: 'Erro de disco: O PDF da Folha de Produção editado não pôde ser gravado fisicamente no servidor.' });
      }
      const stats = fs.statSync(targetPath);
      if (stats.size === 0) {
        try { fs.unlinkSync(targetPath); } catch (_) {}
        return res.status(500).json({ error: 'Erro de disco: O arquivo PDF da Folha de Produção resultante possui tamanho igual a zero.' });
      }
      nextProductionSheet = `/uploads/${finalName}`;
    } else if (slugChanged && existingProduct.production_sheet && typeof existingProduct.production_sheet === 'string' && existingProduct.production_sheet.startsWith('/uploads/')) {
      // Se o slug mudou e temos folha de produção existente, renomear o arquivo no disco
      const oldSheetName = existingProduct.production_sheet.split('/').pop();
      if (oldSheetName) {
        const oldExt = path.extname(oldSheetName).toLowerCase() || '.pdf';
        const newSheetName = buildProductMediaName(nextSlug, productId, oldExt);
        if (oldSheetName !== newSheetName) {
          const oldPhysicalPath = path.join(publicUploadsDir, oldSheetName);
          const newPhysicalPath = path.join(publicUploadsDir, newSheetName);
          if (fs.existsSync(oldPhysicalPath)) {
            try {
              fs.renameSync(oldPhysicalPath, newPhysicalPath);
              nextProductionSheet = `/uploads/${newSheetName}`;
              console.log(`[Slug Change] PDF folha de produção renomeado de ${oldSheetName} para ${newSheetName}`);
            } catch (err) {
              console.error('Erro ao renomear PDF físico por mudança de slug:', err);
            }
          }
        }
      }
    } else if (production_sheet !== undefined) {
      nextProductionSheet = (typeof production_sheet === 'string' ? production_sheet.trim() : '') || null;
    }

    try {
      await dbAsync.run(`
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
          image_alt = ?,
          production_sheet = ?,
          seo_title = ?,
          seo_description = ?,
          seo_keywords = ?,
          canonical_url = ?,
          noindex = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, nextName, nextSlug, nextDescription, nextShortDescription, nextPrice, nextSalePrice, nextCategoryId, nextStitchCount, nextColors, nextImagePath, nextImageAlt, nextProductionSheet, nextSeoTitle, nextSeoDescription, nextSeoKeywords, nextCanonicalUrl, nextNoindex, productId);

      if (nextImagePath !== existingProduct.image && existingProduct.image && typeof existingProduct.image === 'string' && existingProduct.image.includes('/uploads/')) {
        // Verificar se os nomes físicos de arquivo base são diferentes antes de apagar
        const oldBase = path.basename(existingProduct.image.split('?')[0]);
        const newBase = nextImagePath ? path.basename(nextImagePath.split('?')[0]) : '';
        if (oldBase !== newBase) {
          // Verificar se outro produto usa o mesmo arquivo antes de apagar
          const otherProductWithSameImage = await dbAsync.get(
            'SELECT id FROM products WHERE image = ? AND id <> ? LIMIT 1',
            existingProduct.image, productId
          );
          if (!otherProductWithSameImage) {
            const oldImageRelative = existingProduct.image.replace(/^https?:\/\/[^/]+/i, '');
            const oldImageFsPath = path.join(process.cwd(), 'public', oldImageRelative.replace('/uploads/', 'uploads/'));
            try {
              if (fs.existsSync(oldImageFsPath)) {
                fs.unlinkSync(oldImageFsPath);
              }
            } catch (fileError) {
              console.warn('Falha ao remover imagem antiga:', fileError);
            }
          } else {
            console.info(`[PUT /products/${productId}] Imagem antiga compartilhada com produto #${(otherProductWithSameImage as any).id} — arquivo mantido.`);
          }
        }
      }

      if (nextProductionSheet !== existingProduct.production_sheet && existingProduct.production_sheet && typeof existingProduct.production_sheet === 'string' && existingProduct.production_sheet.includes('/uploads/')) {
        // Verificar se os nomes físicos de arquivo base são diferentes antes de apagar
        const oldBase = path.basename(existingProduct.production_sheet.split('?')[0]);
        const newBase = nextProductionSheet ? path.basename(nextProductionSheet.split('?')[0]) : '';
        if (oldBase !== newBase) {
          // Verificar se outro produto usa o mesmo PDF antes de apagar
          const otherProductWithSameSheet = await dbAsync.get(
            'SELECT id FROM products WHERE production_sheet = ? AND id <> ? LIMIT 1',
            existingProduct.production_sheet, productId
          );
          if (!otherProductWithSameSheet) {
            const oldSheetRelative = existingProduct.production_sheet.replace(/^https?:\/\/[^/]+/i, '');
            const oldSheetFsPath = path.join(process.cwd(), 'public', oldSheetRelative.replace('/uploads/', 'uploads/'));
            try {
              if (fs.existsSync(oldSheetFsPath)) {
                fs.unlinkSync(oldSheetFsPath);
              }
            } catch (fileError) {
              console.warn('Falha ao remover folha de produção antiga:', fileError);
            }
          } else {
            console.info(`[PUT /products/${productId}] PDF antigo compartilhado com produto #${(otherProductWithSameSheet as any).id} — arquivo mantido.`);
          }
        }
      }

      const parsedTagIds = parseIdArray(tag_ids ?? tags);
      if (tags !== undefined || tag_ids !== undefined) {
        await dbAsync.run('DELETE FROM product_tag_relations WHERE product_id = ?', productId);
        if (parsedTagIds.length > 0) {
          for (const tagId of parsedTagIds) {
            await dbAsync.run('INSERT IGNORE INTO product_tag_relations (product_id, tag_id) VALUES (?, ?)', productId, tagId);
          }
        }
      }

      const parsedCategoryIds = parseIdArray(category_ids);
      const shouldUpdateCategoryRelations = category_ids !== undefined || category_id !== undefined;
      if (shouldUpdateCategoryRelations) {
        await dbAsync.run('DELETE FROM product_category_relations WHERE product_id = ?', productId);

        const finalCategoryIds = parsedCategoryIds.length > 0
          ? parsedCategoryIds
          : (nextCategoryId ? [nextCategoryId] : []);

        if (finalCategoryIds.length > 0) {
          for (const cid of finalCategoryIds) {
            await dbAsync.run('INSERT IGNORE INTO product_category_relations (product_id, category_id) VALUES (?, ?)', productId, cid);
          }
        }
      }

      const hasNewGalleryFiles = Array.isArray(files['gallery']) && files['gallery'].length > 0;
      const hasGalleryUrlsPayload = gallery_urls !== undefined;
      const parsedGalleryAltsExisting = parseStringArray(gallery_alts_existing);
      const parsedGalleryAltsNew = parseStringArray(gallery_alts_new);
      if (hasNewGalleryFiles || hasGalleryUrlsPayload) {
        await dbAsync.run(`
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

          for (const [index, url] of parsedGalleryUrls.entries()) {
            await dbAsync.run('INSERT INTO product_images (product_id, url, alt_text, file_type) VALUES (?, ?, ?, ?)', productId, url, parsedGalleryAltsExisting[index] || null, 'gallery');
          }
        }

        if (hasNewGalleryFiles) {
          for (const [index, file] of files['gallery'].entries()) {
            // A saída final sempre será .jpg (após watermark)
            const finalName = buildProductMediaName(nextSlug, productId, '.jpg', `g${index + 1}`);
            const physicalPath = path.join(publicUploadsDir, finalName);
            // Aplicar marca d'água sobre a imagem de galeria
            await applyWatermark(file.path, physicalPath);
            // Remover o arquivo temporário original
            if (fs.existsSync(file.path) && file.path !== physicalPath) {
              try { fs.unlinkSync(file.path); } catch (_) { /* ignorar */ }
            }
            await dbAsync.run('INSERT INTO product_images (product_id, url, alt_text, file_type) VALUES (?, ?, ?, ?)', productId, `/uploads/${finalName}`, parsedGalleryAltsNew[index] || null, 'gallery');
          }
        }
      }

      const hasNewProductionFiles = Array.isArray(files['production_files']) && files['production_files'].length > 0;
      const hasDownloadableFilesJson = downloadable_files !== undefined;

      if (hasNewProductionFiles || hasDownloadableFilesJson) {
        await dbAsync.run('DELETE FROM product_files WHERE product_id = ?', productId);

        if (hasNewProductionFiles) {
          for (const [index, file] of files['production_files'].entries()) {
            const ext = path.extname(file.originalname || file.filename || '').toLowerCase() || '.zip';
            const suffix = index === 0 ? undefined : `a${index + 1}`;
            const finalName = buildProductMediaName(nextSlug, productId, ext, suffix);
            const targetPath = path.join(privateUploadsDir, finalName);

            moveUploadedFileToFinalPath(file, privateUploadsDir, finalName);

            // Validação física estrita
            if (!fs.existsSync(targetPath)) {
              return res.status(500).json({ error: `Erro de disco: O arquivo de matriz ZIP (${finalName}) editado não pôde ser gravado fisicamente no servidor.` });
            }
            const stats = fs.statSync(targetPath);
            if (stats.size === 0) {
              try { fs.unlinkSync(targetPath); } catch (_) {}
              return res.status(500).json({ error: `Erro de disco: O arquivo de matriz ZIP (${finalName}) editado possui tamanho igual a zero.` });
            }

            await dbAsync.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, finalName, `/uploads/arquivos/${finalName}`, 'production');
          }
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

          for (const file of parsedDownloadableFiles) {
            if (typeof file === 'string') {
              const fileName = file.split('/').pop() || file;
              await dbAsync.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, file, 'downloadable');
              continue;
            }

            const filePath = file?.file_path || file?.path;
            if (!filePath) continue;

            const fileName = file?.file_name || file?.name || filePath.split('/').pop() || 'arquivo';
            const fileType = file?.file_type || file?.type || 'downloadable';
            await dbAsync.run('INSERT INTO product_files (product_id, file_name, file_path, file_type) VALUES (?, ?, ?, ?)', productId, fileName, filePath, fileType);
          }
        }
      }

      const updatedProduct = await dbAsync.get('SELECT * FROM products WHERE id = ?', productId) as any;
      const updatedTags = await dbAsync.all(`
        SELECT t.*
        FROM product_tags t
        JOIN product_tag_relations pt ON t.id = pt.tag_id
        WHERE pt.product_id = ?
      `, productId);
      const updatedFiles = await dbAsync.all('SELECT * FROM product_files WHERE product_id = ?', productId);
      const updatedCategoryIds = await dbAsync.all('SELECT category_id FROM product_category_relations WHERE product_id = ?', productId);

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

  app.get('/api/admin/products/:id', authenticate, isAdmin, async (req, res) => {
    const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', req.params.id) as any;
    if (!product) return res.status(404).json({ error: 'Produto nÃƒÆ’Ã‚Â£o encontrado' });

    const images = (await dbAsync.all(`
      SELECT id, product_id, url, alt_text, is_featured, created_at, file_type
      FROM product_images
      WHERE product_id = ?
      ORDER BY id ASC
    `, req.params.id) as any[]).map((image) => ({
      id: image.id,
      product_id: image.product_id,
      url: String(image?.url || '').trim(),
      alt_text: String(image?.alt_text || '').trim(),
      full_url: normalizePublicMediaUrl(image?.url),
      is_featured: image?.is_featured ?? 0,
      created_at: image?.created_at ?? null,
      file_type: image?.file_type ?? null,
    }));
    const files = await dbAsync.all('SELECT * FROM product_files WHERE product_id = ?', req.params.id);
    const categoryRelations = await dbAsync.all('SELECT category_id FROM product_category_relations WHERE product_id = ?', req.params.id) as any[];
    const tags = await dbAsync.all(`
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

  app.post('/api/admin/products/:id/sync-mercadopago', authenticate, isAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id || 0);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto inválido' });
      }

      const payload = await buildMercadoPagoProductPayload(productId, req);
      if (!payload) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const hasDescription = Boolean(String(payload.description || '').trim());
      const hasImage = Boolean(String(payload.picture_url || '').trim());
      const status = hasDescription && hasImage ? 'synced' : 'warning';
      const message = hasDescription && hasImage
        ? 'Produto sincronizado para Mercado Pago com imagem e descrição.'
        : 'Sincronização concluída com alerta: falta imagem principal ou descrição.';

      await dbAsync.run(`
        INSERT INTO mercadopago_product_sync_logs
          (product_id, product_name, sku, status, message, payload_json, synced_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, productId, payload.title, payload.sku, status, message, JSON.stringify(payload), Number((req as any)?.user?.id || 0));

      return res.json({ success: true, status, message, payload });
    } catch (error) {
      console.error('Product Mercado Pago sync error:', error);
      return res.status(500).json({ error: 'Erro ao sincronizar produto com Mercado Pago' });
    }
  });

  app.get('/api/admin/products/:id/sync-mercadopago/logs', authenticate, isAdmin, async (req, res) => {
    try {
      const productId = Number(req.params.id || 0);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Produto inválido' });
      }
      const logs = await dbAsync.all(`
        SELECT id, product_id, product_name, sku, status, message, created_at
        FROM mercadopago_product_sync_logs
        WHERE product_id = ?
        ORDER BY created_at DESC
        LIMIT 30
      `, productId);
      return res.json(logs);
    } catch (error) {
      console.error('Product Mercado Pago sync logs error:', error);
      return res.status(500).json({ error: 'Erro ao buscar logs de sincronização Mercado Pago' });
    }
  });

  app.post('/api/admin/products/:id/duplicate', authenticate, isAdmin, async (req, res) => {
    try {
      const sourceId = Number(req.params.id || 0);
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        return res.status(400).json({ error: 'Produto inválido' });
      }

      const source = await dbAsync.get('SELECT * FROM products WHERE id = ? LIMIT 1', sourceId) as any;
      if (!source) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      const baseName = String(source.name || 'Produto');
      const duplicatedName = `${baseName} (Cópia)`;
      const duplicatedSlug = await createUniqueProductSlug(duplicatedName);

      const duplicatedId = await dbAsync.transaction(async (conn) => {
        const [result] = await conn.execute(`
          INSERT INTO products (
            name, slug, description, short_description, price, sale_price,
            image, image_alt, production_sheet, category_id, type, is_virtual, is_downloadable,
            stitch_count, colors, is_featured, is_new, seo_title, seo_description,
            seo_keywords, canonical_url, noindex, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          duplicatedName,
          duplicatedSlug,
          source.description || null,
          source.short_description || null,
          source.price || 0,
          source.sale_price ?? null,
          null, // image começa em branco
          null, // image_alt começa em branco
          null, // production_sheet começa em branco
          source.category_id || null,
          source.type || 'simple',
          source.is_virtual ?? 1,
          source.is_downloadable ?? 1,
          source.stitch_count ?? null,
          source.colors || null,
          source.is_featured ?? 0,
          source.is_new ?? 0,
          source.seo_title || null,
          source.seo_description || null,
          source.seo_keywords || null,
          null, // canonical_url começa em branco
          source.noindex ?? 0,
          'draft', // sempre cria rascunho
        ] as any);
        const newId = Number((result as any).insertId || 0);
        if (!newId) throw new Error('duplicate_insert_failed');

        await conn.execute(`
          INSERT INTO product_tag_relations (product_id, tag_id)
          SELECT ?, ptr.tag_id
          FROM product_tag_relations ptr
          WHERE ptr.product_id = ?
        `, [newId, sourceId] as any);

        await conn.execute(`
          INSERT INTO product_category_relations (product_id, category_id)
          SELECT ?, pcr.category_id
          FROM product_category_relations pcr
          WHERE pcr.product_id = ?
        `, [newId, sourceId] as any);

        return newId;
      });

      return res.json({
        success: true,
        id: duplicatedId,
        slug: duplicatedSlug,
      });
    } catch (error) {
      console.error('Duplicate product error:', error);
      return res.status(500).json({ error: 'Erro ao duplicar produto' });
    }
  });

  app.delete('/api/admin/products/:id', authenticate, isAdmin, async (req, res) => {
    try {
      await dbAsync.run('DELETE FROM products WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir produto' });
    }
  });

  app.patch('/api/admin/products/:id/status', authenticate, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use "active" ou "inactive"' });
    }

    try {
      const product = await dbAsync.get('SELECT id, name FROM products WHERE id = ?', id);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      await dbAsync.run('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, id);
      
      console.log(`[Admin Product Status Update] Produto ID ${id} alterado para status ${status} pelo admin ID ${(req as any).user?.id}`);

      return res.json({ success: true, message: `Produto ${status === 'active' ? 'ativado' : 'desativado'} com sucesso` });
    } catch (error) {
      console.error('Failed to update product status:', error);
      return res.status(500).json({ error: 'Erro ao atualizar status do produto no banco de dados' });
    }
  });

  // POST /api/admin/products/:id/main-image - Upload assíncrono da imagem principal com validação física estrita e limpeza
  app.post('/api/admin/products/:id/main-image', authenticate, isAdmin, upload.single('image'), async (req, res) => {
    const productId = Number(req.params.id);
    const file = req.file;
    const { image_url, slug: bodySlug } = req.body || {};

    try {
      if (image_url) {
        const cleanUrl = String(image_url).trim();
        if (!cleanUrl.startsWith('/uploads/')) {
          return res.status(400).json({ error: 'Caminho de imagem inválido. Deve apontar para a pasta /uploads/' });
        }

        const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', productId) as any;
        if (!product) {
          return res.status(404).json({ error: 'Produto não encontrado.' });
        }

        await dbAsync.run('UPDATE products SET image = ? WHERE id = ?', cleanUrl, productId);
        return res.json({ success: true, image: cleanUrl });
      }

      if (!file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      if (!allowedExts.includes(ext)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Tipo de arquivo inválido. Formatos aceitos: JPG, JPEG, PNG, WEBP e GIF.' });
      }

      const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', productId) as any;
      if (!product) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      // Se um novo slug foi passado no corpo da requisição, usar e atualizar no banco
      let activeSlug = product.slug || 'produto';
      if (bodySlug && typeof bodySlug === 'string' && bodySlug.trim() && bodySlug.trim() !== product.slug) {
        const cleanSlug = bodySlug.trim();
        const uniqueSlug = await createUniqueProductSlug(cleanSlug, productId);
        await dbAsync.run('UPDATE products SET slug = ? WHERE id = ?', uniqueSlug, productId);
        activeSlug = uniqueSlug;
      }

      const publicUploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
      // A saída final sempre será .jpg (após watermark)
      const finalName = buildProductMediaName(activeSlug, productId, '.jpg');
      const physicalPath = path.join(publicUploadsDir, finalName);
      // Caminho temporário da imagem recebida antes de aplicar watermark
      const tempPath = file.path;

      // Aplicar marca d'água: lê o arquivo temporário, processa, salva em physicalPath
      await applyWatermark(tempPath, physicalPath);

      // Remover arquivo temporário original (sem watermark)
      if (fs.existsSync(tempPath) && tempPath !== physicalPath) {
        try { fs.unlinkSync(tempPath); } catch (_) { /* ignorar */ }
      }

      // Validação física estrita
      if (!fs.existsSync(physicalPath)) {
        return res.status(500).json({ error: 'Erro de disco: A imagem não pôde ser gravada fisicamente no servidor.' });
      }

      // Se houver uma imagem antiga cadastrada e ela for diferente da nova, remover fisicamente
      const oldImage = product.image;
      if (oldImage && oldImage !== `/uploads/${finalName}`) {
        const oldImageName = oldImage.split('/').pop();
        if (oldImageName) {
          const oldPhysicalPath = path.join(publicUploadsDir, oldImageName);
          if (fs.existsSync(oldPhysicalPath)) {
            try {
              fs.unlinkSync(oldPhysicalPath);
            } catch (err) {
              console.error('Erro ao deletar imagem substituída:', err);
            }
          }
        }
      }

      const finalPublicUrl = `/uploads/${finalName}`;
      await dbAsync.run('UPDATE products SET image = ? WHERE id = ?', finalPublicUrl, productId);

      return res.json({ success: true, image: finalPublicUrl });
    } catch (error: any) {
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      console.error('Upload main-image error:', error);
      return res.status(500).json({ error: 'Erro ao fazer upload da imagem principal: ' + error.message });
    }
  });

  // DELETE /api/admin/products/:id/main-image - Remoção assíncrona da imagem principal (apenas desvincula no banco de dados sem excluir do disco)
  app.delete('/api/admin/products/:id/main-image', authenticate, isAdmin, async (req, res) => {
    const productId = Number(req.params.id);

    try {
      const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', productId) as any;
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      await dbAsync.run('UPDATE products SET image = NULL WHERE id = ?', productId);
      
      console.log(`[Admin Product Image Remove] Vínculo de imagem principal removido para produto ID ${productId} pelo admin`);
      
      return res.json({ success: true });
    } catch (error: any) {
      console.error('Delete main-image error:', error);
      return res.status(500).json({ error: 'Erro ao remover imagem principal: ' + error.message });
    }
  });

  // API Routes - ADMIN CATEGORIES
  app.get('/api/admin/categories', authenticate, isAdmin, async (req, res) => {
    const categories = await dbAsync.all(`
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

  app.post('/api/admin/categories', authenticate, isAdmin, async (req, res) => {
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
      const existingCategory = await dbAsync.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE slug = ?
      `, slug) as any;

      if (existingCategory) {
        return res.status(200).json(existingCategory);
      }

      const result = await dbAsync.run(`
        INSERT IGNORE INTO product_categories (name, slug, parent_id, sort_order, status, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `, safeName, slug, parent_id || null, sort_order || 0, status || 'active', description || null);

      const createdCategory = await dbAsync.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE id = ?
      `, result.lastInsertRowid) as any;

      return res.status(200).json(createdCategory);
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        const existingCategory = await dbAsync.get(`
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

  app.put('/api/admin/categories/:id', authenticate, isAdmin, async (req, res) => {
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
      const existingCategory = await dbAsync.get(`
        SELECT id, name, slug, parent_id, sort_order, status, description
        FROM product_categories
        WHERE slug = ? AND id != ?
      `, slug, categoryId) as any;

      if (existingCategory) {
        return res.status(200).json(existingCategory);
      }

      await dbAsync.run(`
        UPDATE product_categories 
        SET name = ?, slug = ?, parent_id = ?, sort_order = ?, status = ?, description = ?
        WHERE id = ?
      `, safeName, slug, parent_id || null, sort_order || 0, status || 'active', description || null, categoryId);

      const updatedCategory = await dbAsync.get(`
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
        const existingCategory = await dbAsync.get(`
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

  app.delete('/api/admin/categories/:id', authenticate, isAdmin, async (req, res) => {
    try {
      await dbAsync.run('DELETE FROM product_categories WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
  });

  app.post('/api/admin/categories/bulk-delete', authenticate, isAdmin, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalizedIds = ids
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isInteger(value) && value > 0);

    if (normalizedIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma categoria vÃƒÆ’Ã‚Â¡lida foi informada' });
    }

    try {
      const placeholders = normalizedIds.map(() => '?').join(', ');
      const result = await dbAsync.run(`DELETE FROM product_categories WHERE id IN (${placeholders})`, ...normalizedIds);
      res.json({ success: true, deleted: result.changes });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir categorias em massa' });
    }
  });

  // API Routes - ADMIN TAGS
  app.get('/api/admin/tags', authenticate, isAdmin, async (req, res) => {
    try {
      const search = req.query.q;
      let query = 'SELECT * FROM product_tags';
      const params: any[] = [];

      if (search) {
        query += ' WHERE name LIKE ?';
        params.push(`%${search}%`);
      }

      query += ' ORDER BY name ASC LIMIT 100';
      const tags = await dbAsync.all(query, ...params);
      res.json(tags);
    } catch (error) {
      console.error('Admin Fetch Tags Error:', error);
      res.status(500).json({ error: 'Erro ao buscar tags' });
    }
  });

  app.get('/api/admin/tags/most-used', authenticate, isAdmin, async (req, res) => {
    const limitParam = Number(req.query.limit);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
    const tags = await dbAsync.all(`
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
    const freshUser = await getUserById(Number(user?.id || 0));
    if (!freshUser) {
      return res.status(401).json({ error: 'Usuario nao encontrado' });
    }
    if (freshUser.status !== 'ativo' && freshUser.status !== 'active') {
      return res.status(403).json({ error: 'Conta inativa' });
    }
    // Bloqueio de e-mail verificado desabilitado na rota de pagamento
    // if ((await resolveEmailVerificationRequired()) && !freshUser.email_verified_at) {
    //   return res.status(403).json({
    //     error: 'Confirme seu e-mail para finalizar compras.',
    //     code: 'EMAIL_NOT_VERIFIED',
    //   });
    // }

    const lgpd = await resolveLgpdSettings();
    if (lgpd.enabled) {
      const compliance = await ensureUserLgpdCompliance(Number(freshUser.id));
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

        const product = await dbAsync.get(`
          SELECT p.id, p.name, p.slug, p.description, p.image, p.price, p.sale_price, p.category_id, c.name AS category_name
          FROM products p
          LEFT JOIN product_categories c ON c.id = p.category_id
          WHERE p.id = ?
        `, productId) as any;
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
          product_description: String(product.description || ''),
          product_image: String(product.image || ''),
          product_category: String(product.category_name || product.category_id || ''),
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
      const payerPhone = String((payer as any)?.phone || '').trim();
      const payerCity = String((payer as any)?.city || '').trim();
      const payerState = String((payer as any)?.state || '').trim();
      const payerPostalCode = String((payer as any)?.postal_code || (payer as any)?.zip || (payer as any)?.zip_code || '').trim();
      const payerAddress = String((payer as any)?.address || (payer as any)?.street || '').trim();
      const payerNumber = String((payer as any)?.number || '').trim();
      const payerNeighborhood = String((payer as any)?.neighborhood || '').trim();
      const payerComplement = String((payer as any)?.complement || '').trim();

      if (!payerEmail) {
        return res.status(400).json({ error: 'E-mail do pagador ÃƒÂ© obrigatÃƒÂ³rio' });
      }
      if (!payerCpf) {
        return res.status(400).json({ error: 'CPF do pagador ÃƒÂ© obrigatÃƒÂ³rio' });
      }

      const orderId = await dbAsync.transaction(async (conn) => {
        const [orderResultRaw] = await conn.execute(`
          INSERT INTO orders (user_id, total, status, payment_method, customer_email, customer_name)
          VALUES (?, ?, 'pending', ?, ?, ?)
        `, [user.id, subtotal, payment_method, payerEmail, `${payerFirstName} ${payerLastName}`.trim() || null]);

        const orderIdTx = Number((orderResultRaw as any)?.insertId || 0);
        for (const oi of orderItems) {
          await conn.execute(`
            INSERT INTO order_items (order_id, product_id, product_name, product_slug, price, quantity)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [orderIdTx, oi.product_id, oi.product_name, oi.product_slug, oi.price, oi.quantity]);
        }
        return orderIdTx;
      });

      await dbAsync.run(`
        INSERT INTO order_customer_details
          (order_id, first_name, last_name, cpf, email, phone, city, state, postal_code, address_line, number, neighborhood, complement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          cpf = VALUES(cpf),
          email = VALUES(email),
          phone = VALUES(phone),
          city = VALUES(city),
          state = VALUES(state),
          postal_code = VALUES(postal_code),
          address_line = VALUES(address_line),
          number = VALUES(number),
          neighborhood = VALUES(neighborhood),
          complement = VALUES(complement),
          updated_at = CURRENT_TIMESTAMP
      `,
        orderId,
        payerFirstName || null,
        payerLastName || null,
        payerCpf || null,
        payerEmail || null,
        payerPhone || null,
        payerCity || null,
        payerState || null,
        payerPostalCode || null,
        payerAddress || null,
        payerNumber || null,
        payerNeighborhood || null,
        payerComplement || null,
      );

      const { mode, accessToken } = resolveMercadoPagoSettings();

      if (lgpd.enabled && parseBooleanSetting(checkout_data_processing_accepted, false)) {
        await upsertUserConsent({
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
        await dbAsync.run(`UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, orderId);
        return res.status(400).json({
          error: 'Mercado Pago nao configurado. Preencha o Access Token em Configuracoes > Meios de Pagamento.',
        });
      }

      const paymentClient = createMercadoPagoPaymentClient();
      const notificationBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const mpItems = orderItems.map((oi) => {
        const normalizedImage = normalizePublicMediaUrl(oi.product_image || '');
        const pictureUrl = normalizedImage
          ? (normalizedImage.startsWith('http') ? normalizedImage : `${notificationBaseUrl}${normalizedImage}`)
          : '';
        return {
          id: String(oi.product_slug || oi.product_id),
          title: String(oi.product_name || ''),
          description: String(oi.product_description || '').slice(0, 500),
          category_id: String(oi.product_category || 'matrizes'),
          quantity: Number(oi.quantity || 1),
          unit_price: Number(Number(oi.price || 0).toFixed(2)),
          picture_url: pictureUrl,
        };
      });

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
        additional_info: {
          items: mpItems,
        },
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
              payment_method_id: payment_method_id || undefined,
              issuer_id: issuer_id || undefined,
            },
          });
        }
      } catch (gatewayError: any) {
        const parsed = extractGatewayError(gatewayError);
        await dbAsync.run(`UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, orderId);
        console.error('MercadoPago payment error:', parsed.details || gatewayError);
        return res.status(parsed.status >= 400 && parsed.status < 500 ? parsed.status : 400).json({
          error: parsed.message,
          details: parsed.details || null,
        });
      }

      const paymentId = payment?.id ? String(payment.id) : null;
      const paymentStatus = String(payment?.status || 'pending');

      if (paymentId) {
        await dbAsync.run(`
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
        await dbAsync.run(`
          UPDATE orders
          SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, orderId);
      }

      const pixData = payment?.point_of_interaction?.transaction_data || {};
      
      // TRIGGER EMAIL: order_created
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const emailPayload = await buildOrderEmailPayload(orderId, payment_method, paymentStatus, appUrl);
      if (emailPayload?.customerEmail) {
        sendEmail({
          to: emailPayload.customerEmail,
          templateKey: 'order_created',
          variables: emailPayload.variables,
        }).catch(err => console.error('Failed to send order_created email:', err));
      }

      const orderNotificationEmail = await getOrderNotificationEmail();
      if (orderNotificationEmail && emailPayload) {
        sendEmail({
          to: orderNotificationEmail,
          templateKey: 'order_created',
          variables: emailPayload.adminVariables,
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

      const order = await dbAsync.get('SELECT id, user_id FROM orders WHERE transaction_id = ? LIMIT 1', paymentId) as any;
      const orderId = order?.id ? Number(order.id) : null;
      if (orderId && Number(order.user_id) !== Number(user?.id)) {
        return res.status(403).json({ error: 'Pagamento nao pertence ao usuario autenticado' });
      }
      if (orderId && status === 'approved') {
        await dbAsync.run(`
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
      await dbAsync.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify(payload), 'received');
      const signatureCheck = await verifyMercadoPagoWebhookSignature(req, payload);
      if (!signatureCheck.ok) {
        await dbAsync.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify({ payload, reason: signatureCheck.reason }), 'invalid_signature');
        return res.status(401).json({ error: 'invalid_signature' });
      }

      const eventType = String((payload as any)?.type || (payload as any)?.action || '');
      const paymentId = String((payload as any)?.data?.id || (payload as any)?.id || '');
      const eventId = String(req.headers['x-request-id'] || `${eventType}:${paymentId || 'unknown'}`);
      if (await isWebhookAlreadyProcessed('mercadopago', eventId)) {
        return res.sendStatus(200);
      }

      if (eventType === 'payment' || eventType === 'payment.created' || eventType === 'payment.updated') {
        if (paymentId) {
          const paymentClient = createMercadoPagoPaymentClient();
          const payment = await paymentClient.get({ id: String(paymentId) });
          const paymentStatus = String(payment?.status || 'pending');
          const transactionId = String(payment?.id || paymentId);
          const order = await dbAsync.get('SELECT * FROM orders WHERE transaction_id = ? LIMIT 1', transactionId) as any;
          if (order?.id) {
            const previousStatus = order.status;
            if (paymentStatus === 'approved') {
              await dbAsync.run(`
                UPDATE orders
                SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `, Number(order.id));

              if (previousStatus !== 'paid') {
                const appUrl = process.env.APP_URL || `http://${req.get('host')}`;
                const itemsList = await dbAsync.all('SELECT product_name, quantity, price FROM order_items WHERE order_id = ?', order.id) as any[];
                const itemsHtml = itemsList.map(i => `<li>${i.quantity}x ${i.product_name} - R$ ${i.price.toFixed(2)}</li>`).join('');

                sendEmail({
                  to: order.customer_email,
                  templateKey: 'order_paid',
                  variables: {
                    name: order.customer_name || 'Cliente',
                    order_id: order.id,
                    order_total: `R$ ${order.total.toFixed(2)}`,
                    items: `<ul>${itemsHtml}</ul>`,
                    downloads_url: `${appUrl}/minha-conta`,
                  },
                }).catch(err => console.error('Failed to send order_paid email:', err));

                const orderNotificationEmail = await getOrderNotificationEmail();
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
              await dbAsync.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', paymentStatus, Number(order.id));

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

          await markWebhookProcessed('mercadopago', eventId, paymentId);
          await dbAsync.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify({ eventType, paymentStatus, paymentId, eventId }), 'processed');
        }
      }
    } catch (error) {
      console.error('MercadoPago webhook error:', error);
      await dbAsync.run('INSERT INTO webhook_logs (payload, status) VALUES (?, ?)', JSON.stringify(payload), 'error');
    }

    return res.sendStatus(200);
  });
  app.get('/api/customer/account', authenticate, async (req, res) => {
    const user = (req as any).user;
    try {
      const lgpd = await resolveLgpdSettings();
      const profile = await dbAsync.get(`
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

      const summary = await dbAsync.get(`
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
          compliance: await ensureUserLgpdCompliance(Number(user.id)),
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

  app.get('/api/customer/orders', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const orders = await dbAsync.all(`
        SELECT
          o.*,
          COALESCE(SUM(oi.quantity), 0) AS total_items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, user.id) as any[];

      for (const order of orders) {
        const items = await dbAsync.all(`
          SELECT 
            oi.id,
            oi.product_id,
            oi.product_name,
            oi.product_slug,
            oi.price,
            oi.quantity,
            p.image AS product_image
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?
        `, order.id) as any[];
        
        order.items = items.map(item => ({
          ...item,
          product_image: normalizePublicMediaUrl(item.product_image)
        }));
      }

      return res.json(orders);
    } catch (error) {
      console.error('Customer Orders Error:', error);
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  });

  // API Routes - ADMIN ORDERS
  app.get('/api/admin/orders', authenticate, isAdmin, async (req, res) => {
    try {
      const orders = await dbAsync.all(`
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


  app.get('/api/customer/orders/:id', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: 'Pedido invalido' });
      }

      const order = await dbAsync.get(`
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

      const items = await dbAsync.all(`
        SELECT
          oi.id,
          oi.product_id,
          COALESCE(oi.product_name, p_by_id.name, p_by_slug.name, p_by_name.name) AS product_name,
          COALESCE(oi.product_slug, p_by_id.slug, p_by_slug.slug, p_by_name.slug) AS product_slug,
          COALESCE(p_by_id.image, p_by_slug.image, p_by_name.image) AS product_image,
          oi.quantity,
          oi.price
        FROM order_items oi
        LEFT JOIN products p_by_id ON p_by_id.id = oi.product_id
        LEFT JOIN products p_by_slug ON oi.product_id IS NULL
          AND LOWER(TRIM(COALESCE(p_by_slug.slug, ''))) = LOWER(TRIM(COALESCE(oi.product_slug, '')))
        LEFT JOIN products p_by_name ON oi.product_id IS NULL
          AND (oi.product_slug IS NULL OR TRIM(oi.product_slug) = '')
          AND LOWER(TRIM(COALESCE(p_by_name.name, ''))) = LOWER(TRIM(COALESCE(oi.product_name, '')))
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `, orderId) as any[];

      const normalizedItems = items.map((item) => ({
        ...item,
        product_image: resolvePublicMediaWithFallback(item?.product_image, String(item?.product_slug || ''), 'image', Number(item?.product_id || 0)),
      }));

      return res.json({ order, items: normalizedItems });
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

      const freshUser = await getUserById(Number(user?.id || 0));
      if (!freshUser) {
        return deny(401, 'Usuario nao encontrado');
      }
      if (!(await canUserAccessDownloads(Number(freshUser.id), String(freshUser.email || ''), freshUser.email_verified_at))) {
        return deny(403, 'Confirme seu e-mail para acessar downloads.', { code: 'EMAIL_NOT_VERIFIED' });
      }

      const lgpdCompliance = await ensureUserLgpdCompliance(Number(freshUser.id));
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
      const ownedDownload = await dbAsync.get(`
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
        WHERE o.user_id = ?
          AND LOWER(COALESCE(o.status, '')) IN (${statusPlaceholders})
          AND f.file_path IN (${placeholders})
        ORDER BY o.created_at DESC, oi.id DESC
        LIMIT 1
      `, Number(user.id), ...DOWNLOAD_ALLOWED_STATUSES, ...filePathCandidates) as any;

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

  app.get('/api/customer/downloads', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const freshUser = await getUserById(Number(user?.id || 0));
      if (!freshUser) {
        return res.status(401).json({ error: 'Usuario nao encontrado' });
      }
      if (!(await canUserAccessDownloads(Number(freshUser.id), String(freshUser.email || ''), freshUser.email_verified_at))) {
        return res.status(403).json({ error: 'Confirme seu e-mail para acessar downloads.', code: 'EMAIL_NOT_VERIFIED' });
      }
      const lgpdCompliance = await ensureUserLgpdCompliance(Number(freshUser.id));
      if (!lgpdCompliance.ok) {
        return res.status(403).json({ error: 'Aceite as politicas LGPD para acessar seus downloads.', code: lgpdCompliance.code, missing: lgpdCompliance.missing });
      }

      const statusPlaceholders = getDownloadStatusPlaceholders();
      const downloads = await dbAsync.all(`
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
        WHERE o.user_id = ?
          AND LOWER(COALESCE(o.status, '')) IN (${statusPlaceholders})
          AND f.file_path IS NOT NULL
          AND f.file_path <> ''
        ORDER BY o.created_at DESC, oi.id DESC
      `, user.id, ...DOWNLOAD_ALLOWED_STATUSES) as any[];

      const normalizedDownloads = downloads.map((item) => ({
        ...item,
        product_image: normalizePublicMediaUrl(item?.product_image),
        production_sheet: normalizePublicMediaUrl(item?.production_sheet),
      }));

      return res.json(normalizedDownloads);
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

      const duplicate = await dbAsync.get('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, user.id) as any;
      if (duplicate) {
        return res.status(409).json({ error: 'Este e-mail ja esta em uso por outra conta' });
      }

      await dbAsync.transaction(async (conn) => {
        await conn.execute(`
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
        `, [normalizedDisplayName, normalizedEmail, normalizedFirstName || null, normalizedLastName || null, normalizedPhone || null, normalizedCpf || null, user.id]);

        const [customerRows] = await conn.execute('SELECT id FROM customers WHERE user_id = ?', [user.id]);
        const customer = Array.isArray(customerRows) ? (customerRows as any[])[0] : undefined;
        if (customer?.id) {
          await conn.execute('UPDATE customers SET phone = ?, cpf = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [normalizedPhone || null, normalizedCpf || null, user.id]);
        } else {
          await conn.execute('INSERT INTO customers (user_id, phone, cpf) VALUES (?, ?, ?)', [user.id, normalizedPhone || null, normalizedCpf || null]);
        }
      });

      const updated = await dbAsync.get(`
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

      const dbUser = await dbAsync.get('SELECT id, password, email, name FROM users WHERE id = ? LIMIT 1', user.id) as any;
      if (!dbUser) {
        return res.status(404).json({ error: 'Usuario nao encontrado' });
      }

      const isValidCurrentPassword = await comparePassword(String(current_password), String(dbUser.password || ''));
      if (!isValidCurrentPassword) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      const hashed = await hashPassword(String(new_password));
      await dbAsync.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', hashed, user.id);

      return res.json({ success: true, message: 'Senha atualizada com sucesso' });
    } catch (error) {
      console.error('Customer Update Password Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
  });

  app.put('/api/customer/addresses', authenticate, async (req, res) => {
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

      const customer = await dbAsync.get('SELECT id FROM customers WHERE user_id = ?', user.id) as any;
      if (customer?.id) {
        await dbAsync.run(`
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
        await dbAsync.run(`
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

  app.post('/api/customer/avatar', authenticate, upload.single('avatar'), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!req.file?.filename) {
        return res.status(400).json({ error: 'Arquivo de avatar nao enviado' });
      }
      const avatarUrl = `/uploads/${req.file.filename}`;
      await dbAsync.run('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', avatarUrl, user.id);
      return res.json({ success: true, avatar_url: avatarUrl });
    } catch (error) {
      console.error('Customer Upload Avatar Error:', error);
      return res.status(500).json({ error: 'Erro ao atualizar foto do perfil' });
    }
  });

  app.get('/api/lgpd/policies/active', async (req, res) => {
    try {
      const lgpd = await resolveLgpdSettings();
      const policies = await getActivePolicies();
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

  app.post('/api/lgpd/cookies/consent', async (req, res) => {
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
      const lgpd = await resolveLgpdSettings();
      await dbAsync.run(
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
        await recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'cookies',
          policyVersion: lgpd.policyVersionCookies,
          req,
          source: 'cookie_banner',
        });
        await upsertUserConsent({
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

  app.get('/api/customer/privacy', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const lgpd = await resolveLgpdSettings();
      const consents = await dbAsync.all(
        `SELECT consent_key, granted, legal_basis, purpose, source, policy_version, updated_at, revoked_at
         FROM lgpd_consents
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
        user.id,
      );
      const acceptances = await dbAsync.all(
        `SELECT policy_type, policy_version, accepted_at, source
         FROM lgpd_user_acceptances
         WHERE user_id = ?
         ORDER BY accepted_at DESC`,
        user.id,
      );
      const requests = await dbAsync.all(
        `SELECT id, request_type, status, payload, response_notes, created_at, handled_at
         FROM lgpd_requests
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        user.id,
      );
      const compliance = await ensureUserLgpdCompliance(Number(user.id));
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
      const lgpd = await resolveLgpdSettings();
      const requiredVersions = await resolveRequiredPolicyVersions(lgpd);

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
        await upsertUserConsent({
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
        await recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'privacy',
          policyVersion: requiredVersions.privacy,
          req,
          source: 'my_account',
        });
        await upsertUserConsent({
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
        await recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'terms',
          policyVersion: requiredVersions.terms,
          req,
          source: 'my_account',
        });
        await upsertUserConsent({
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
        await recordPolicyAcceptance({
          userId: Number(user.id),
          policyType: 'cookies',
          policyVersion: requiredVersions.cookies,
          req,
          source: 'my_account',
        });
        await upsertUserConsent({
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

      const freshUser = await dbAsync.get('SELECT id, name, email FROM users WHERE id = ?', Number(user.id)) as any;
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
        compliance: await ensureUserLgpdCompliance(Number(user.id)),
      });
    } catch (error) {
      console.error('Update privacy consents error:', error);
      res.status(500).json({ error: 'Erro ao atualizar consentimentos' });
    }
  });

  app.post('/api/customer/privacy/request', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { request_type, details = '' } = req.body || {};
      const allowed = ['export', 'delete', 'correction', 'revoke'];
      const normalizedType = String(request_type || '').trim().toLowerCase();
      if (!allowed.includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de solicitacao invalido' });
      }

      const result = await dbAsync.run(
        `INSERT INTO lgpd_requests (user_id, request_type, status, payload)
         VALUES (?, ?, 'pending', ?)`,
        Number(user.id),
        normalizedType,
        JSON.stringify({ details: String(details || '').slice(0, 4000) }),
      );

      const requestId = Number(result.lastInsertRowid);
      await logLgpdEvent({
        req,
        userId: Number(user.id),
        actorUserId: Number(user.id),
        eventType: 'request',
        action: 'request_created',
        details: { request_id: requestId, request_type: normalizedType },
      });

      const freshUser = await dbAsync.get('SELECT id, name, email FROM users WHERE id = ?', Number(user.id)) as any;
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
      const payload = await buildUserLgpdExportPayload(Number(user.id));
      if (!payload?.user) return res.status(404).json({ error: 'Usuario nao encontrado' });

      await logLgpdEvent({
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

  app.get('/api/admin/lgpd/policies', authenticate, isAdmin, async (req, res) => {
    try {
      const policies = await dbAsync.all(
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

  app.get('/api/admin/lgpd/policies/diff', authenticate, isAdmin, async (req, res) => {
    try {
      const leftId = Number(req.query.left || 0);
      const rightId = Number(req.query.right || 0);
      if (!Number.isFinite(leftId) || leftId <= 0 || !Number.isFinite(rightId) || rightId <= 0) {
        return res.status(400).json({ error: 'Parametros left e right sao obrigatorios' });
      }

      const leftPolicy = await dbAsync.get(
        'SELECT id, policy_type, version, title, content, is_active, updated_at FROM lgpd_policies WHERE id = ? LIMIT 1',
        leftId,
      ) as any;
      const rightPolicy = await dbAsync.get(
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

      const payload = await buildUserLgpdExportPayload(targetUserId);
      if (!payload?.user) return res.status(404).json({ error: 'Usuario nao encontrado' });

      await logLgpdEvent({
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

  app.post('/api/admin/lgpd/policies', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const { policy_type, version, title, content, is_active = false, force_reaccept = false } = req.body || {};
      const normalizedType = String(policy_type || '').toLowerCase();
      if (!['privacy', 'terms', 'cookies'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de politica invalido' });
      }
      const safePolicyContent = sanitizeRichHtml(content).trim();
      if (!version || !title || !safePolicyContent) {
        return res.status(400).json({ error: 'version, title e content sao obrigatorios' });
      }

      const result = await dbAsync.run(
        `INSERT INTO lgpd_policies (policy_type, version, title, content, is_active, force_reaccept, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        normalizedType,
        String(version).trim(),
        String(title).trim(),
        safePolicyContent,
        parseBooleanSetting(is_active, false) ? 1 : 0,
        parseBooleanSetting(force_reaccept, false) ? 1 : 0,
        Number(adminUser.id),
      );

      if (parseBooleanSetting(is_active, false)) {
        await dbAsync.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ? AND id <> ?', normalizedType, Number(result.lastInsertRowid));
        if (normalizedType === 'privacy') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(version).trim());
        if (normalizedType === 'terms') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(version).trim());
        if (normalizedType === 'cookies') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(version).trim());
      }

      if (parseBooleanSetting(force_reaccept, false)) {
        await dbAsync.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      if (parseBooleanSetting(is_active, false)) {
        const lgpd = await resolveLgpdSettings();
        const policyUrl =
          normalizedType === 'privacy'
            ? lgpd.privacyUrl
            : normalizedType === 'terms'
              ? lgpd.termsUrl
              : lgpd.cookiePolicyUrl;
        await notifyCustomersPolicyUpdated({
          policyType: normalizedType as 'privacy' | 'terms' | 'cookies',
          policyVersion: String(version).trim(),
          policyUrl,
          actorUserId: Number(adminUser.id),
          req,
        });
      }

      await logLgpdEvent({
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

  app.put('/api/admin/lgpd/policies/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policyId = Number(req.params.id);
      if (!Number.isFinite(policyId) || policyId <= 0) {
        return res.status(400).json({ error: 'ID da politica invalido' });
      }

      const currentPolicy = await dbAsync.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', policyId) as any;
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
      const normalizedContent = sanitizeRichHtml(content).trim();

      if (!['privacy', 'terms', 'cookies'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Tipo de politica invalido' });
      }
      if (!normalizedVersion || !normalizedTitle || !normalizedContent) {
        return res.status(400).json({ error: 'version, title e content sao obrigatorios' });
      }

      const duplicated = await dbAsync.get(
        'SELECT id FROM lgpd_policies WHERE policy_type = ? AND version = ? AND id <> ? LIMIT 1',
        normalizedType,
        normalizedVersion,
        policyId,
      ) as any;
      if (duplicated) {
        return res.status(409).json({ error: 'Ja existe outra politica com este tipo e versao' });
      }

      await dbAsync.run(
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
        await dbAsync.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ? AND id <> ?', normalizedType, policyId);
        if (normalizedType === 'privacy') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', normalizedVersion);
        if (normalizedType === 'terms') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', normalizedVersion);
        if (normalizedType === 'cookies') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', normalizedVersion);
      }

      if (parseBooleanSetting(force_reaccept, false)) {
        await dbAsync.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      if (parseBooleanSetting(is_active, false)) {
        const lgpd = await resolveLgpdSettings();
        const policyUrl =
          normalizedType === 'privacy'
            ? lgpd.privacyUrl
            : normalizedType === 'terms'
              ? lgpd.termsUrl
              : lgpd.cookiePolicyUrl;
        await notifyCustomersPolicyUpdated({
          policyType: normalizedType as 'privacy' | 'terms' | 'cookies',
          policyVersion: normalizedVersion,
          policyUrl,
          actorUserId: Number(adminUser.id),
          req,
        });
      }

      await logLgpdEvent({
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

  app.delete('/api/admin/lgpd/policies/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policyId = Number(req.params.id);
      if (!Number.isFinite(policyId) || policyId <= 0) {
        return res.status(400).json({ error: 'ID da politica invalido' });
      }

      const policy = await dbAsync.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', policyId) as any;
      if (!policy) {
        return res.status(404).json({ error: 'Politica nao encontrada' });
      }

      const policyType = String(policy.policy_type || '');
      const isActive = Number(policy.is_active) === 1;

      if (isActive) {
        const replacement = await dbAsync.get(
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

        await dbAsync.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ?', policyType);
        await dbAsync.run('UPDATE lgpd_policies SET is_active = 1 WHERE id = ?', Number(replacement.id));

        const replacementPolicy = await dbAsync.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', Number(replacement.id)) as any;
        if (replacementPolicy) {
          if (policyType === 'privacy') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(replacementPolicy.version || '1.0'));
          if (policyType === 'terms') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(replacementPolicy.version || '1.0'));
          if (policyType === 'cookies') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(replacementPolicy.version || '1.0'));
        }
      }

      await dbAsync.run('DELETE FROM lgpd_policies WHERE id = ?', policyId);

      await logLgpdEvent({
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

  app.post('/api/admin/lgpd/policies/:id/activate', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const policy = await dbAsync.get('SELECT * FROM lgpd_policies WHERE id = ? LIMIT 1', Number(req.params.id)) as any;
      if (!policy) return res.status(404).json({ error: 'Politica nao encontrada' });

      await dbAsync.run('UPDATE lgpd_policies SET is_active = 0 WHERE policy_type = ?', policy.policy_type);
      await dbAsync.run('UPDATE lgpd_policies SET is_active = 1 WHERE id = ?', Number(policy.id));

      if (policy.policy_type === 'privacy') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_privacy"', String(policy.version));
      if (policy.policy_type === 'terms') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_terms"', String(policy.version));
      if (policy.policy_type === 'cookies') await dbAsync.run('UPDATE settings SET value = ? WHERE `key` = "lgpd_policy_version_cookies"', String(policy.version));

      if (parseBooleanSetting(req.body?.force_reaccept, false) || Number(policy.force_reaccept) === 1) {
        await dbAsync.run('UPDATE users SET privacy_reaccept_required = 1 WHERE role = "customer"');
      }

      const lgpd = await resolveLgpdSettings();
      const policyUrl =
        policy.policy_type === 'privacy'
          ? lgpd.privacyUrl
          : policy.policy_type === 'terms'
            ? lgpd.termsUrl
            : lgpd.cookiePolicyUrl;
      await notifyCustomersPolicyUpdated({
        policyType: String(policy.policy_type) as 'privacy' | 'terms' | 'cookies',
        policyVersion: String(policy.version),
        policyUrl,
        actorUserId: Number(adminUser.id),
        req,
      });

      await logLgpdEvent({
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

  app.get('/api/admin/lgpd/consents', authenticate, isAdmin, async (req, res) => {
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
      const countRow = await dbAsync.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_consents c
         JOIN users u ON u.id = c.user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = await dbAsync.all(
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

  app.put('/api/admin/lgpd/consents/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const consentId = Number(req.params.id);
      if (!Number.isFinite(consentId) || consentId <= 0) {
        return res.status(400).json({ error: 'ID de consentimento invÃ¡lido' });
      }

      const consent = await dbAsync.get(
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

      await upsertUserConsent({
        userId: Number(consent.user_id),
        consentKey: String(consent.consent_key || ''),
        granted,
        req,
        source: 'admin_panel',
        legalBasis: String(consent.legal_basis || 'consent'),
        purpose: reason || String(consent.purpose || 'atualizacao administrativa'),
        policyVersion: consent.policy_version ? String(consent.policy_version) : null,
      });

      await logLgpdEvent({
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

  app.get('/api/admin/lgpd/requests', authenticate, isAdmin, async (req, res) => {
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
      const countRow = await dbAsync.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_requests r
         JOIN users u ON u.id = r.user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = await dbAsync.all(
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

      const requestRow = await dbAsync.get('SELECT * FROM lgpd_requests WHERE id = ?', requestId) as any;
      if (!requestRow) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
      const targetUser = await dbAsync.get('SELECT id, name, email FROM users WHERE id = ?', Number(requestRow.user_id)) as any;

      await dbAsync.run(
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
        const targetUserBeforeAnonymize = await dbAsync.get('SELECT email, name FROM users WHERE id = ?', targetUserId) as any;
        await dbAsync.run(
          `UPDATE users
           SET name = CONCAT('Usuario ', id), email = CONCAT('anon+', id, '@anon.local'),
               phone = NULL, cpf = NULL, first_name = NULL, last_name = NULL,
               avatar_url = NULL, status = 'inactive', anonymized_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          targetUserId,
        );
        await dbAsync.run('UPDATE customers SET phone = NULL, cpf = NULL, address = NULL, city = NULL, state = NULL, zip = NULL, country = NULL, billing_address = NULL, billing_city = NULL, billing_neighborhood = NULL, billing_state = NULL, billing_zip = NULL, billing_country = NULL, shipping_address = NULL, shipping_city = NULL, shipping_neighborhood = NULL, shipping_state = NULL, shipping_zip = NULL, shipping_country = NULL WHERE user_id = ?', targetUserId);
        await dbAsync.run('DELETE FROM favorites WHERE user_id = ?', targetUserId);
        await dbAsync.run('UPDATE lgpd_consents SET granted = 0, revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?', targetUserId);
        await dbAsync.run('DELETE FROM download_tokens WHERE user_id = ?', targetUserId);
        await dbAsync.run('DELETE FROM email_verification_tokens WHERE user_id = ?', targetUserId);
        await dbAsync.run('DELETE FROM password_reset_tokens WHERE user_id = ?', targetUserId);
        await dbAsync.run('DELETE FROM login_attempts WHERE email = ?', String(targetUserBeforeAnonymize?.email || ''));

        if (targetUserBeforeAnonymize?.email) {
          sendEmail({
            to: targetUserBeforeAnonymize.email,
            templateKey: 'lgpd_deletion_completed',
            variables: { name: targetUserBeforeAnonymize.name || 'Cliente' },
          }).catch((err) => console.error('LGPD deletion email error:', err));
        }
      }

      if (normalizedStatus === 'completed' && String(requestRow.request_type) === 'export' && targetUser?.email) {
        const settings = await loadSettingsMapAsync(['app_url', 'lgpd_export_ttl_hours']);
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

      await logLgpdEvent({
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

  app.get('/api/admin/lgpd/logs', authenticate, isAdmin, async (req, res) => {
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
      const countRow = await dbAsync.get(
        `SELECT COUNT(*) AS total
         FROM lgpd_logs l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN users a ON a.id = l.actor_user_id
         ${whereClause}`,
        ...params,
      ) as any;
      const total = Number(countRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const rows = await dbAsync.all(
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
  app.post('/api/dev/approve-order/:id', authenticate, isAdmin, async (req, res) => {
    if (isProduction) {
      return res.status(404).json({ error: 'Rota indisponivel neste ambiente' });
    }
    const orderId = req.params.id;
    try {
      await dbAsync.run("UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?", orderId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao aprovar pedido' });
    }
  });

  app.post('/api/admin/tags', authenticate, isAdmin, async (req, res) => {
    const { name } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (!normalizedName) {
      return res.status(400).json({ error: 'Nome da tag ÃƒÆ’Ã‚Â© obrigatÃƒÆ’Ã‚Â³rio' });
    }

    const safeName = normalizedName.slice(0, 255);
    const generatedSlug = slugify(safeName, { lower: true, strict: false, trim: true });
    const slug = (generatedSlug || safeName.toLowerCase().replace(/\s+/g, '-')).slice(0, 191);

    try {
      const existingTag = await dbAsync.get('SELECT id, name, slug FROM product_tags WHERE slug = ?', slug) as any;
      if (existingTag) {
        return res.status(200).json(existingTag);
      }

      const result = await dbAsync.run('INSERT IGNORE INTO product_tags (name, slug) VALUES (?, ?)', safeName, slug);
      const createdTag = await dbAsync.get('SELECT id, name, slug FROM product_tags WHERE id = ?', result.lastInsertRowid) as any;
      return res.status(200).json(createdTag);
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed') || error?.code === 'ER_DUP_ENTRY') {
        const existingTag = await dbAsync.get('SELECT id, name, slug FROM product_tags WHERE slug = ?', slug) as any;
        if (existingTag) {
          return res.status(200).json(existingTag);
        }
      }
      res.status(500).json({ error: 'Erro ao criar tag' });
    }
  });

  app.delete('/api/admin/tags/:id', authenticate, isAdmin, async (req, res) => {
    try {
      await dbAsync.run('DELETE FROM product_tags WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Fetch Orders Error:', error);
      res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
  });

  app.post('/api/admin/orders/import', authenticate, isAdmin, async (req, res) => {
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
      const orderId = await dbAsync.transaction(async (conn) => {
        let safeUserId: number | null = rawUserId;
        if (safeUserId !== null) {
          const [existingUserRows] = await conn.execute('SELECT id FROM users WHERE id = ?', [safeUserId]);
          const existingUser = Array.isArray(existingUserRows) ? (existingUserRows as any[])[0] : undefined;
          if (!existingUser) {
            safeUserId = null;
          }
        }

        const [orderResultRaw] = await conn.execute(`
          INSERT INTO orders (
            user_id, customer_email, customer_name, total, status, payment_method, transaction_id,
            billing_address, woo_order_id, created_at, paid_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, CURRENT_TIMESTAMP)
        `, [
          safeUserId,
          customer_email ? String(customer_email).trim().toLowerCase() : null,
          customer_name ? String(customer_name).trim() : null,
          Number(orderTotal.toFixed(2)),
          typeof status === 'string' && status.trim() ? status.trim() : 'pending',
          payment_method ? String(payment_method) : null,
          transaction_id ? String(transaction_id) : null,
          billing_address ? String(billing_address) : null,
          woo_order_id ? String(woo_order_id) : null,
          created_at || null,
          paid_at || null,
        ]);

        const orderIdTx = Number((orderResultRaw as any)?.insertId || 0);
        for (const item of normalizedItems) {
          let safeProductId: number | null = item.product_id;
          if (safeProductId !== null) {
            const [existingProductRows] = await conn.execute('SELECT id FROM products WHERE id = ?', [safeProductId]);
            const existingProduct = Array.isArray(existingProductRows) ? (existingProductRows as any[])[0] : undefined;
            if (!existingProduct) {
              safeProductId = null;
            }
          }

          await conn.execute(`
            INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
            VALUES (?, ?, ?, ?, ?)
          `, [orderIdTx, safeProductId, item.product_name, item.price, item.quantity]);
        }

        return orderIdTx;
      });

      const createdOrder = await dbAsync.get('SELECT id, status FROM orders WHERE id = ?', orderId) as any;
      return res.status(201).json({
        id: Number(createdOrder?.id || orderId),
        status: createdOrder?.status || 'pending',
      });
    } catch (error) {
      console.error('Admin Import Order Error:', error);
      return res.status(500).json({ error: 'Erro ao importar pedido' });
    }
  });

  app.get('/api/admin/orders/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const order = await dbAsync.get(`
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
      `, req.params.id) as any;

      if (!order) return res.status(404).json({ error: 'Pedido nÃƒÆ’Ã‚Â£o encontrado' });

      const items = await dbAsync.all(`
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

  app.put('/api/admin/orders/:id/status', authenticate, isAdmin, async (req, res) => {
    const { status } = req.body;
    try {
      const updateData: any[] = [status, req.params.id];
      let query = 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP';
      
      if (status === 'paid') {
        query += ', paid_at = CURRENT_TIMESTAMP';
      }
      
      query += ' WHERE id = ?';
      
      await dbAsync.run(query, ...updateData);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Update Order Status Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
    }
  });

  // API Routes - ADMIN USERS
  app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limitRaw = Number(req.query.limit || 20);
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
      const offset = (page - 1) * limit;
      const searchTerm = String(req.query.search || '').trim().toLowerCase();
      const roleFilter = String(req.query.role || 'all').trim().toLowerCase();
      const sortBy = String(req.query.sortBy || 'created_at').trim().toLowerCase();
      const sortOrder = String(req.query.sortOrder || 'desc').trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const { whereClause, params } = buildUsersBaseQuery({ searchTerm, roleFilter });

      const totalRow = await dbAsync.get(`
        SELECT COUNT(*) AS total
        FROM users u
        ${whereClause}
      `, ...params) as any;
      const total = Number(totalRow?.total || 0);

      let orderBy = 'u.created_at';
      if (sortBy === 'order_count') {
        orderBy = 'order_count';
      } else if (sortBy === 'total_spent') {
        orderBy = 'total_spent';
      } else if (sortBy === 'name') {
        orderBy = 'u.name';
      }

      const users = await dbAsync.all(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at,
          u.phone, u.cpf, u.first_name, u.last_name, u.date_registered,
          c.address, c.city, c.state, c.zip, c.country,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count,
          (SELECT SUM(total) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') as total_spent
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        ${whereClause}
        ORDER BY ${orderBy} ${sortOrder}
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

  app.get('/api/admin/users/:id/orders', authenticate, isAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      
      // Buscar todos os pedidos do usuário
      const orders = await dbAsync.all(`
        SELECT o.* 
        FROM orders o
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
      `, userId) as any[];

      // Para cada pedido, buscar os itens comprados
      const ordersWithItems = await Promise.all(orders.map(async (order) => {
        const items = await dbAsync.all(`
          SELECT oi.*, COALESCE(oi.product_name, p.name, 'Produto sem nome') as product_name, p.image as product_image
          FROM order_items oi
          LEFT JOIN products p ON (
            oi.product_id = p.id OR 
            (oi.product_id IS NULL AND (oi.product_slug = p.slug OR oi.product_name = p.name))
          )
          WHERE oi.order_id = ?
        `, order.id);
        return {
          ...order,
          items
        };
      }));

      res.json(ordersWithItems);
    } catch (error) {
      console.error('Admin Fetch User Orders Error:', error);
      res.status(500).json({ error: 'Erro ao buscar pedidos do cliente' });
    }
  });

  app.get('/api/admin/users/export', authenticate, isAdmin, async (req, res) => {
    try {
      const format = String(req.query.format || 'csv').trim().toLowerCase();
      const searchTerm = String(req.query.search || '').trim().toLowerCase();
      const roleFilter = String(req.query.role || 'all').trim().toLowerCase();
      const { whereClause, params } = buildUsersBaseQuery({ searchTerm, roleFilter });

      const users = await dbAsync.all(`
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

    const existingUser = await dbAsync.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
    if (existingUser) {
      return res.status(409).json({ error: 'E-mail jÃƒÆ’Ã‚Â¡ cadastrado' });
    }

    const hashedPassword = await hashPassword(String(password));

    try {
      const userId = await dbAsync.transaction(async (conn) => {
        const [userResultRaw] = await conn.execute(`
          INSERT INTO users (
            name, email, password, role, status, phone, cpf, first_name, last_name, date_registered
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
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
        ]);

        const userIdTx = Number((userResultRaw as any)?.insertId || 0);
        const [existingCustomerRows] = await conn.execute('SELECT id FROM customers WHERE user_id = ? LIMIT 1', [userIdTx]);
        const existingCustomer = Array.isArray(existingCustomerRows) ? (existingCustomerRows as any[])[0] : undefined;

        if (existingCustomer) {
          await conn.execute(`
            UPDATE customers
            SET phone = ?, cpf = ?, address = ?, city = ?, state = ?, zip = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `, [
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
            userIdTx,
          ]);
        } else {
          await conn.execute(`
            INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            userIdTx,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
          ]);
        }

        return userIdTx;
      });
      const createdUser = await dbAsync.get(`
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

  app.post('/api/admin/users/import', authenticate, isAdmin, async (req, res) => {
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

    const existingUser = await dbAsync.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
    if (existingUser) {
      return res.status(409).json({ error: 'already_exists', id: Number(existingUser.id) });
    }

    try {
      const userId = await dbAsync.transaction(async (conn) => {
        const [userResultRaw] = await conn.execute(`
          INSERT INTO users (
            name, email, password, role, status, phone, cpf, date_registered, first_name, last_name, woo_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          normalizedName,
          normalizedEmail,
          String(password),
          normalizedRole,
          normalizedStatus,
          phone || null,
          cpf || null,
          date_registered || null,
          first_name || null,
          last_name || null,
          woo_user_id ? String(woo_user_id) : null,
        ]);

        const userIdTx = Number((userResultRaw as any)?.insertId || 0);
        await conn.execute(`
          INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userIdTx,
          phone || null,
          cpf || null,
          address || null,
          city || null,
          state || null,
          zip || null,
          country || null,
        ]);
        return userIdTx;
      });

      return res.status(201).json({ id: userId, status: 'created' });
    } catch (error: any) {
      if (error?.message?.includes('Duplicate entry') || error?.code === 'ER_DUP_ENTRY') {
        const duplicate = await dbAsync.get('SELECT id FROM users WHERE email = ?', normalizedEmail) as any;
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

    const existingUser = await dbAsync.get('SELECT id FROM users WHERE id = ?', userId) as any;
    if (!existingUser) {
      return res.status(404).json({ error: 'UsuÃƒÂ¡rio nÃƒÂ£o encontrado' });
    }

    const duplicateEmail = await dbAsync.get('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, userId) as any;
    if (duplicateEmail) {
      return res.status(409).json({ error: 'E-mail jÃƒÂ¡ cadastrado' });
    }

    try {
      let hashedPassword: string | undefined;
      if (normalizedPassword) {
        hashedPassword = await hashPassword(normalizedPassword);
      }

      await dbAsync.transaction(async (conn) => {
        if (normalizedPassword) {
          await conn.execute(`
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
          `, [
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
          ]);
        } else {
          await conn.execute(`
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
          `, [
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
          ]);
        }

        const [existingCustomerRows] = await conn.execute('SELECT id FROM customers WHERE user_id = ? LIMIT 1', [userId]);
        const existingCustomer = Array.isArray(existingCustomerRows) ? (existingCustomerRows as any[])[0] : undefined;
        if (existingCustomer) {
          await conn.execute(`
            UPDATE customers
            SET phone = ?, cpf = ?, address = ?, city = ?, state = ?, zip = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
          `, [
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
            userId,
          ]);
        } else {
          await conn.execute(`
            INSERT INTO customers (user_id, phone, cpf, address, city, state, zip, country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            userId,
            phone || null,
            cpf || null,
            address || null,
            city || null,
            state || null,
            zip || null,
            country || null,
          ]);
        }
      });

      const updatedUser = await dbAsync.get(`
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

  app.put('/api/admin/users/:id/role', authenticate, isAdmin, async (req, res) => {
    const { role } = req.body;
    try {
      await dbAsync.run('UPDATE users SET role = ? WHERE id = ?', role, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Update User Role Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar cargo do usuÃƒÆ’Ã‚Â¡rio' });
    }
  });

  app.delete('/api/admin/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
      // Don't allow deleting self
      if (req.params.id === (req as any).user.id.toString()) {
        return res.status(400).json({ error: 'VocÃƒÆ’Ã‚Âª nÃƒÆ’Ã‚Â£o pode excluir a si mesmo' });
      }
      await dbAsync.run('DELETE FROM users WHERE id = ?', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin Delete User Error:', error);
      res.status(500).json({ error: 'Erro ao excluir usuÃƒÆ’Ã‚Â¡rio' });
    }
  });
  
  app.get('/api/admin/settings', authenticate, isAdmin, async (req, res) => {
    try {
      const rows = await dbAsync.all('SELECT `key`, value FROM settings') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);
    } catch (error) {
      console.error('Fetch Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
    }
  });

  app.post('/api/admin/settings', authenticate, isAdmin, async (req, res) => {
    const settings = req.body;
    try {
      await dbAsync.transaction(async (conn) => {
        for (const [key, value] of Object.entries(settings || {})) {
          await conn.execute(
            'INSERT INTO settings (`key`, value) VALUES (?, COALESCE(?, \'\')) ON DUPLICATE KEY UPDATE value = COALESCE(VALUES(value), \'\')',
            [key, value == null ? '' : String(value)],
          );
        }
      });
      apiCache.delete('public_settings');
      settingsCacheExpiresAt = 0;
      res.json({ success: true });
    } catch (error) {
      console.error('Update Settings Error:', error);
      res.status(500).json({ error: 'Erro ao atualizar configuraÃƒÂ§ÃƒÂµes' });
    }
  });

  async function performSystemBackup(mode: 'full' | 'incremental', userId: number | null): Promise<any> {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const backupKey = `backup-${mode}-${stamp}`;
    const backupRoot = path.join(process.cwd(), 'storage', 'backups');
    const snapshotPath = path.join(backupRoot, backupKey, 'snapshot');
    const archivePath = path.join(backupRoot, `${backupKey}.tar.gz`);
    const dbPath = path.join(snapshotPath, 'database');
    const filesPath = path.join(snapshotPath, 'files');
    ensureDirSync(dbPath);
    ensureDirSync(filesPath);

    const allTables = await getAllTableNames();
    const ignoredTables = new Set(['system_backups']);
    for (const tableName of allTables) {
      if (ignoredTables.has(tableName)) continue;
      const rows = await dbAsync.all(`SELECT * FROM \`${tableName}\``) as any[];
      safeJsonWrite(path.join(dbPath, `${tableName}.json`), rows);
    }

    const uploadsSource = path.join(process.cwd(), 'public', 'uploads');
    const uploadsTarget = path.join(filesPath, 'public', 'uploads');
    copyDirectoryRecursive(uploadsSource, uploadsTarget);

    const rootUploadsSource = path.join(process.cwd(), 'uploads');
    const rootUploadsTarget = path.join(filesPath, 'uploads');
    copyDirectoryRecursive(rootUploadsSource, rootUploadsTarget);

    const metadata = {
      key: backupKey,
      mode,
      created_at: now.toISOString(),
      table_count: allTables.filter((name) => !ignoredTables.has(name)).length,
      includes: ['database', 'public/uploads', 'uploads'],
      node_env: process.env.NODE_ENV || 'development',
    };
    safeJsonWrite(path.join(snapshotPath, 'metadata.json'), metadata);

    buildBackupArchive(snapshotPath, archivePath);
    const archiveStat = fs.statSync(archivePath);
    const snapshotStat = fs.statSync(path.join(snapshotPath, 'metadata.json'));
    const integrityOk = archiveStat.size > 0 && snapshotStat.size > 0 ? 1 : 0;

    await dbAsync.run(
      `INSERT INTO system_backups
        (backup_key, mode, status, archive_path, snapshot_path, size_bytes, integrity_ok, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      backupKey,
      mode,
      integrityOk ? 'completed' : 'warning',
      archivePath,
      snapshotPath,
      Number(archiveStat.size || 0),
      integrityOk,
      integrityOk ? 'Backup concluido com sucesso.' : 'Backup finalizado com alerta de integridade.',
      userId,
    );

    return {
      success: true,
      backup_key: backupKey,
      mode,
      archive_path: archivePath,
      size_bytes: Number(archiveStat.size || 0),
      integrity_ok: Boolean(integrityOk),
    };
  }

  app.get('/api/admin/backups', authenticate, isAdmin, async (req, res) => {
    try {
      const rows = await dbAsync.all(`
        SELECT id, backup_key, mode, status, archive_path, snapshot_path, size_bytes, integrity_ok, notes, created_by, created_at
        FROM system_backups
        ORDER BY created_at DESC
        LIMIT 200
      `) as any[];
      res.json(rows);
    } catch (error) {
      console.error('List backups error:', error);
      res.status(500).json({ error: 'Erro ao listar backups.' });
    }
  });

  app.post('/api/admin/backups/create', authenticate, isAdmin, async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'full').toLowerCase() === 'incremental' ? 'incremental' : 'full';
      const userId = Number((req as any)?.user?.id || 0) || null;
      const result = await performSystemBackup(mode, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Create backup error:', error);
      res.status(500).json({ error: error?.message || 'Erro ao criar backup.' });
    }
  });

  app.get('/api/admin/backups/download/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const row = await dbAsync.get(
        'SELECT id, backup_key, archive_path FROM system_backups WHERE id = ?',
        Number(req.params.id),
      ) as any;
      if (!row) return res.status(404).json({ error: 'Backup nao encontrado.' });
      const archivePath = String(row.archive_path || '');
      if (!archivePath || !fs.existsSync(archivePath)) {
        return res.status(404).json({ error: 'Arquivo do backup nao encontrado no servidor.' });
      }
      return res.download(archivePath, `${row.backup_key}.tar.gz`);
    } catch (error) {
      console.error('Download backup error:', error);
      return res.status(500).json({ error: 'Erro ao baixar backup.' });
    }
  });

  app.delete('/api/admin/backups/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const row = await dbAsync.get(
        'SELECT id, archive_path, snapshot_path FROM system_backups WHERE id = ?',
        Number(req.params.id),
      ) as any;
      if (!row) return res.status(404).json({ error: 'Backup nao encontrado.' });

      const archivePath = String(row.archive_path || '');
      const snapshotPath = String(row.snapshot_path || '');
      if (archivePath && fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
      if (snapshotPath && fs.existsSync(snapshotPath)) fs.rmSync(snapshotPath, { recursive: true, force: true });

      await dbAsync.run('DELETE FROM system_backups WHERE id = ?', Number(req.params.id));
      return res.json({ success: true });
    } catch (error) {
      console.error('Delete backup error:', error);
      return res.status(500).json({ error: 'Erro ao excluir backup.' });
    }
  });

  app.post('/api/admin/backups/restore/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const row = await dbAsync.get(
        'SELECT id, archive_path, snapshot_path, backup_key FROM system_backups WHERE id = ?',
        Number(req.params.id),
      ) as any;
      if (!row) return res.status(404).json({ error: 'Backup nao encontrado.' });

      let snapshotPath = String(row.snapshot_path || '');
      if (!snapshotPath || !fs.existsSync(snapshotPath)) {
        const archivePath = String(row.archive_path || '');
        if (!archivePath || !fs.existsSync(archivePath)) {
          return res.status(404).json({ error: 'Snapshot e arquivo compactado nao encontrados.' });
        }
        const restoreRoot = path.join(process.cwd(), 'storage', 'backups', `${row.backup_key}-restore`);
        if (fs.existsSync(restoreRoot)) fs.rmSync(restoreRoot, { recursive: true, force: true });
        ensureDirSync(restoreRoot);
        extractBackupArchive(archivePath, restoreRoot);
        snapshotPath = restoreRoot;
      }

      const dbPath = path.join(snapshotPath, 'database');
      if (!fs.existsSync(dbPath)) {
        return res.status(400).json({ error: 'Snapshot invalido: pasta de banco nao encontrada.' });
      }

      const tableFiles = fs.readdirSync(dbPath).filter((f) => f.toLowerCase().endsWith('.json'));
      const skipTables = new Set(['system_backups']);
      await dbAsync.transaction(async (conn) => {
        for (const fileName of tableFiles) {
          const tableName = fileName.replace(/\.json$/i, '');
          if (!tableName || skipTables.has(tableName)) continue;
          const rows = JSON.parse(fs.readFileSync(path.join(dbPath, fileName), 'utf8'));
          if (!Array.isArray(rows)) continue;
          await conn.execute(`DELETE FROM \`${tableName}\``);
          for (const rowData of rows) {
            const keys = Object.keys(rowData || {});
            if (keys.length === 0) continue;
            const placeholders = keys.map(() => '?').join(',');
            const columns = keys.map((key) => `\`${key}\``).join(',');
            const values = keys.map((key) => (rowData as any)[key]);
            await conn.execute(
              `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`,
              values,
            );
          }
        }
      });

      const uploadsFrom = path.join(snapshotPath, 'files', 'public', 'uploads');
      const uploadsTo = path.join(process.cwd(), 'public', 'uploads');
      if (fs.existsSync(uploadsFrom)) {
        copyDirectoryRecursive(uploadsFrom, uploadsTo);
      }

      await dbAsync.run(
        `INSERT INTO system_backups
          (backup_key, mode, status, archive_path, snapshot_path, size_bytes, integrity_ok, notes, created_by)
         VALUES (?, 'restore', 'completed', ?, ?, 0, 1, ?, ?)`,
        `restore-${Date.now()}`,
        String(row.archive_path || ''),
        snapshotPath,
        `Restauracao aplicada a partir de ${row.backup_key}.`,
        Number((req as any)?.user?.id || 0) || null,
      );

      return res.json({ success: true, restored_from: row.backup_key });
    } catch (error: any) {
      console.error('Restore backup error:', error);
      return res.status(500).json({ error: error?.message || 'Erro ao restaurar backup.' });
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
  app.get('/api/admin/email-templates', authenticate, isAdmin, async (req, res) => {
    try {
      const templates = await dbAsync.all('SELECT * FROM email_templates ORDER BY id ASC');
      res.json(templates);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ error: 'Erro ao buscar templates' });
    }
  });

  app.get('/api/admin/email-templates/:key', authenticate, isAdmin, async (req, res) => {
    try {
      const template = await dbAsync.get('SELECT * FROM email_templates WHERE `key` = ?', req.params.key);
      if (!template) return res.status(404).json({ error: 'Template nÃƒÂ£o encontrado' });
      res.json(template);
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: 'Erro ao buscar template' });
    }
  });

  app.put('/api/admin/email-templates/:key', authenticate, isAdmin, async (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) return res.status(400).json({ error: 'Subject e body são obrigatórios' });

      const changes = await dbAsync.run(
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
      const rows = await dbAsync.all('SELECT `key`, value FROM settings WHERE `key` IN ("smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_secure")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      
      const allowInvalidTls = process.env.SMTP_ALLOW_INVALID_TLS === 'true';
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: Number(settings.smtp_port) || 587,
        secure: settings.smtp_secure === 'true' || settings.smtp_secure === '1',
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        },
        tls: {
          rejectUnauthorized: !allowInvalidTls
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
        account_url: 'https://digitalbordados.com.br/minha-conta',
        downloads_url: 'https://digitalbordados.com.br/minha-conta',
        retry_url: 'https://digitalbordados.com.br/checkout',
        pix_code: '00020126580014br.gov.bcb.pix...',
        expires_at: new Date(Date.now() + 3600000).toLocaleString('pt-BR'),
        temp_password: 'SenhaTemporaria123',
        change_password_url: 'https://digitalbordados.com.br/minha-conta',
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

  app.post('/api/admin/email-templates/seed', authenticate, isAdmin, async (req, res) => {
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

      await dbAsync.transaction(async (conn) => {
        for (const t of seedTemplates) {
          await conn.execute(
            'INSERT IGNORE INTO email_templates (`key`, name, subject, body, variables, active) VALUES (?, ?, ?, ?, ?, 1)',
            [t.key, t.name, t.subject, t.body, t.variables],
          );
        }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error seeding templates:', error);
      res.status(500).json({ error: 'Erro ao gerar templates' });
    }
  });

  app.get('/api/admin/email-logs', authenticate, isAdmin, async (req, res) => {
    try {
      const logs = await dbAsync.all('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 100');
      res.json(logs);
    } catch (error) {
      console.error('Error fetching email logs:', error);
      res.status(500).json({ error: 'Erro ao buscar logs' });
    }
  });

  app.get('/api/admin/email/budget-logs', authenticate, isAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim().toLowerCase();
      const q = String(req.query.q || '').trim();
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 300)));
      const where: string[] = [];
      const params: any[] = [];
      if (status && ['pending', 'sent', 'erro'].includes(status)) {
        where.push('l.status = ?');
        params.push(status);
      }
      if (q) {
        where.push('(mr.name LIKE ? OR mr.email LIKE ? OR l.to_email LIKE ? OR l.template_key LIKE ?)');
        params.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%');
      }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const logs = await dbAsync.all(`
        SELECT
          l.*,
          mr.name AS requester_name,
          mr.email AS requester_email,
          mr.whatsapp AS requester_whatsapp
        FROM matrix_request_email_logs l
        LEFT JOIN matrix_requests mr ON mr.id = l.matrix_request_id
        ${whereSql}
        ORDER BY l.created_at DESC
        LIMIT ${limit}
      `, ...params);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching budget email logs:', error);
      res.status(500).json({ error: 'Erro ao buscar logs de orçamento' });
    }
  });

  app.post('/api/admin/email/budget-logs/:id/retry', authenticate, isAdmin, async (req, res) => {
    try {
      const logId = Number(req.params.id || 0);
      if (!logId) return res.status(400).json({ error: 'Log inválido.' });
      const row = await dbAsync.get(`
        SELECT l.*, mr.name, mr.email, mr.whatsapp, mr.details, mr.reference_image
        FROM matrix_request_email_logs l
        LEFT JOIN matrix_requests mr ON mr.id = l.matrix_request_id
        WHERE l.id = ?
      `, logId) as any;
      if (!row) return res.status(404).json({ error: 'Log não encontrado.' });
      if (!row.to_email || !row.template_key) {
        return res.status(400).json({ error: 'Log sem destinatário/template para reenvio.' });
      }

      const settings = await loadSettingsMapAsync(['app_url']);
      const appUrl = settings.app_url || `${req.protocol}${req.get('host')}`;
      const referenceImageUrl = row.reference_image ? `${appUrl}${row.reference_image}` : '';
      await dbAsync.run('UPDATE matrix_request_email_logs SET status = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'pending', logId);

      const result = await sendEmail({
        to: String(row.to_email),
        templateKey: String(row.template_key),
        variables: {
          request_id: row.matrix_request_id,
          name: row.name || '',
          email: row.email || '',
          whatsapp: row.whatsapp || '',
          details: row.details || '',
          reference_image: referenceImageUrl,
        },
      });

      if (!result.success) {
        await dbAsync.run(
          'UPDATE matrix_request_email_logs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          'erro',
          String(result.error || 'Falha no reenvio').slice(0, 2000),
          logId,
        );
        return res.status(400).json({ success: false, error: result.error || 'Falha no reenvio' });
      }

      await dbAsync.run('UPDATE matrix_request_email_logs SET status = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'sent', logId);
      return res.json({ success: true });
    } catch (error: any) {
      console.error('Retry budget email error:', error);
      return res.status(500).json({ error: error?.message || 'Erro ao reenviar e-mail.' });
    }
  });

  app.get('/api/admin/dashboard/stats', authenticate, isAdmin, async (req, res) => {
    const cached = apiCache.get('admin_dashboard_stats');
    if (cached) return res.json(cached);

    try {
      // PerÃƒÂ­odo Atual (30 dias)
      const currentStats = await dbAsync.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // PerÃƒÂ­odo Anterior (30-60 dias atrÃƒÂ¡s) para cÃƒÂ¡lculo de tendÃƒÂªncia
      const previousStats = await dbAsync.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      const activeProducts = await dbAsync.get("SELECT COUNT(*) as count FROM products WHERE status = 'active'") as any;
      const totalCustomers = await dbAsync.get("SELECT COUNT(*) as count FROM users WHERE role = 'customer'") as any;
      
      const prevCustomers = await dbAsync.get(`
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

      const recentOrders = await dbAsync.all(`
        SELECT o.*, COALESCE(o.customer_name, u.name) as display_name, u.email as customer_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC 
        LIMIT 6
      `);

      const salesChart = await dbAsync.all(`
        SELECT DATE_FORMAT(created_at, '%d/%m') as date, SUM(total) as total 
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY date
        ORDER BY MIN(created_at) ASC
      `);

      const activities = await dbAsync.all(`
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

  app.get('/api/admin/reports', authenticate, isAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || '30d');
      const start = String(req.query.start || '');
      const end = String(req.query.end || '');
      const paidStatuses = "'paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing'";
      let dateFormat = '%d/%m';
      let whereCurrent = '';
      let wherePrevious = '';

      if (period === 'today') {
        whereCurrent = 'DATE(created_at) = CURDATE()';
        wherePrevious = 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
        dateFormat = '%H:00';
      } else if (period === 'yesterday') {
        whereCurrent = 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
        wherePrevious = 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 2 DAY)';
        dateFormat = '%H:00';
      } else if (period === '7d') {
        whereCurrent = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
        wherePrevious = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
      } else if (period === '30d') {
        whereCurrent = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        wherePrevious = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      } else if (period === 'current_month') {
        whereCurrent = 'YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())';
        wherePrevious = 'YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))';
      } else if (period === 'last_month') {
        whereCurrent = 'YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))';
        wherePrevious = 'YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 2 MONTH)) AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 2 MONTH))';
      } else if (period === 'current_year') {
        whereCurrent = 'YEAR(created_at) = YEAR(CURDATE())';
        wherePrevious = 'YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 YEAR))';
        dateFormat = '%m/%Y';
      } else if (period === 'custom' && start && end) {
        whereCurrent = `DATE(created_at) BETWEEN '${start}' AND '${end}'`;
        wherePrevious = '';
      } else {
        whereCurrent = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        wherePrevious = 'created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      }

      const revenueData = await dbAsync.get(`
        SELECT
          SUM(total) as gross_total,
          SUM(total) as net_total,
          AVG(total) as average,
          COUNT(*) as orderCount
        FROM orders
        WHERE status IN (${paidStatuses})
          AND ${whereCurrent}
      `) as any;

      const previousData = wherePrevious
        ? (await dbAsync.get(`
            SELECT
              SUM(total) as gross_total,
              SUM(total) as net_total,
              COUNT(*) as orderCount
            FROM orders
            WHERE status IN (${paidStatuses})
              AND ${wherePrevious}
          `) as any)
        : { gross_total: 0, net_total: 0, orderCount: 0 };

      const salesChart = await dbAsync.all(`
        SELECT DATE_FORMAT(created_at, '${dateFormat}') as name, SUM(total) as value
        FROM orders
        WHERE status IN (${paidStatuses})
          AND ${whereCurrent}
        GROUP BY name
        ORDER BY MIN(created_at) ASC
      `);

      const topProducts = await dbAsync.all(`
        SELECT
          COALESCE(p.name, oi.product_name, 'Produto Indefinido') as name,
          COUNT(oi.id) as sales
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN (${paidStatuses})
          AND ${whereCurrent.split('created_at').join('o.created_at')}
        GROUP BY name
        ORDER BY sales DESC
        LIMIT 12
      `);

      const paymentMethods = await dbAsync.all(`
        SELECT payment_method as name, COUNT(*) as value
        FROM orders
        WHERE status IN (${paidStatuses})
          AND ${whereCurrent}
        GROUP BY payment_method
      `);

      const categoryUsage = await dbAsync.all(`
        SELECT pc.name, COUNT(oi.id) as count
        FROM order_items oi
        LEFT JOIN products p ON (oi.product_id = p.id OR oi.product_name = p.name)
        JOIN product_categories pc ON p.category_id = pc.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN (${paidStatuses})
          AND ${whereCurrent.split('created_at').join('o.created_at')}
        GROUP BY pc.name
        ORDER BY count DESC
        LIMIT 12
      `);

      const soldProducts = await dbAsync.all(`
        SELECT
          o.id as order_id,
          COALESCE(o.customer_name, u.name, 'Cliente Indefinido') as customer_name,
          oi.product_id as id,
          COALESCE(p.name, oi.product_name, 'Produto Indefinido') as name,
          p.slug,
          p.image,
          oi.quantity,
          (oi.price * oi.quantity) as total_revenue,
          o.created_at
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.status IN (${paidStatuses})
          AND ${whereCurrent.split('created_at').join('o.created_at')}
        ORDER BY o.id DESC
      `);

      const calcTrend = (current: number, previous: number) => {
        const c = Number(current || 0);
        const p = Number(previous || 0);
        if (!p) return c > 0 ? 100 : 0;
        return ((c - p) / p) * 100;
      };

      const grossCurrent = Number(revenueData?.gross_total || 0);
      const netCurrent = Number(revenueData?.net_total || 0);
      const ordersCurrent = Number(revenueData?.orderCount || 0);
      const grossPrevious = Number(previousData?.gross_total || 0);
      const netPrevious = Number(previousData?.net_total || 0);
      const ordersPrevious = Number(previousData?.orderCount || 0);
      const avgCurrent = ordersCurrent > 0 ? netCurrent / ordersCurrent : 0;
      const avgPrevious = ordersPrevious > 0 ? netPrevious / ordersPrevious : 0;

      res.json({
        revenue: {
          total: netCurrent,
          average: Number(revenueData?.average || avgCurrent || 0),
          gross: grossCurrent,
          net: netCurrent,
        },
        orders: { total: ordersCurrent },
        comparison: {
          gross: calcTrend(grossCurrent, grossPrevious),
          net: calcTrend(netCurrent, netPrevious),
          orders: calcTrend(ordersCurrent, ordersPrevious),
          average_ticket: calcTrend(avgCurrent, avgPrevious),
        },
        salesChart,
        topProducts,
        paymentMethods,
        categoryUsage,
        soldProducts,
      });
    } catch (error) {
      console.error('Reports Stats Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados dos relat?rios' });
    }
  });

  // API Routes - CONTENT
  app.get('/robots.txt', (req, res) => {
    try {
      const s = loadSettingsMap([
        'seo_robots_index',
        'seo_robots_follow',
        'seo_robots_custom_rules',
        'seo_sitemap_enabled',
        'app_url',
      ]);
      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const indexAllowed = String(s.seo_robots_index || 'true').toLowerCase() === 'true';
      const followAllowed = String(s.seo_robots_follow || 'true').toLowerCase() === 'true';
      const customRules = String(s.seo_robots_custom_rules || '').trim();
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';

      const baseRules = indexAllowed && followAllowed
        ? ['User-agent: *', 'Allow: /']
        : ['User-agent: *', 'Disallow: /'];
      const lines = [
        ...baseRules,
        ...(customRules ? [customRules] : []),
        ...(sitemapEnabled ? [`Sitemap: ${appUrl}/sitemap.xml`] : []),
      ];

      res.type('text/plain; charset=utf-8');
      return res.send(`${lines.join('\n')}\n`);
    } catch (error) {
      console.error('robots.txt error:', error);
      res.type('text/plain; charset=utf-8');
      return res.send('User-agent: *\nAllow: /\n');
    }
  });

  app.get('/sitemap.xml', async (req, res) => {
    try {
      const s = await loadSettingsMapAsync(['seo_sitemap_enabled', 'app_url']);
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';
      if (!sitemapEnabled) {
        return res.status(404).type('text/plain').send('Sitemap desabilitado');
      }

      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${appUrl}/sitemap-static.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${appUrl}/sitemap-products.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${appUrl}/sitemap-categories.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${appUrl}/sitemap-images.xml</loc>
  </sitemap>
</sitemapindex>`;
      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('sitemap.xml index error:', error);
      return res.status(500).type('text/plain').send('Erro ao gerar sitemap index');
    }
  });

  app.get('/sitemap-static.xml', async (req, res) => {
    try {
      const s = await loadSettingsMapAsync(['seo_sitemap_enabled', 'app_url']);
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';
      if (!sitemapEnabled) return res.status(404).type('text/plain').send('Sitemap desabilitado');

      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const staticPaths = ['/', '/loja', '/contato', '/orcamento', '/login', '/cadastro'];

      const body = staticPaths.map(p => `
  <url>
    <loc>${appUrl}${p}</loc>
    <priority>${p === '/' ? '1.0' : '0.8'}</priority>
    <changefreq>daily</changefreq>
  </url>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}
</urlset>`;
      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('sitemap-static.xml error:', error);
      return res.status(500).type('text/plain').send('Erro');
    }
  });

  app.get('/sitemap-products.xml', async (req, res) => {
    try {
      const s = await loadSettingsMapAsync(['seo_sitemap_enabled', 'app_url']);
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';
      if (!sitemapEnabled) return res.status(404).type('text/plain').send('Sitemap desabilitado');

      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const products = await dbAsync.all(`SELECT slug, updated_at, created_at FROM products WHERE status = 'active'`) as any[];

      const formatLastMod = (dateVal: any): string => {
        if (!dateVal) return new Date().toISOString().slice(0, 10);
        try {
          const d = new Date(dateVal);
          return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
        } catch {
          return new Date().toISOString().slice(0, 10);
        }
      };

      const xmlEscape = (v: string) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

      const body = products.map(p => `
  <url>
    <loc>${appUrl}/produto/${xmlEscape(p.slug)}</loc>
    <lastmod>${formatLastMod(p.updated_at || p.created_at)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}
</urlset>`;
      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('sitemap-products.xml error:', error);
      return res.status(500).type('text/plain').send('Erro');
    }
  });

  app.get('/sitemap-categories.xml', async (req, res) => {
    try {
      const s = await loadSettingsMapAsync(['seo_sitemap_enabled', 'app_url']);
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';
      if (!sitemapEnabled) return res.status(404).type('text/plain').send('Sitemap desabilitado');

      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const categories = await dbAsync.all(`SELECT slug, created_at FROM product_categories WHERE status = 'active'`) as any[];

      const formatLastMod = (dateVal: any): string => {
        if (!dateVal) return new Date().toISOString().slice(0, 10);
        try {
          const d = new Date(dateVal);
          return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
        } catch {
          return new Date().toISOString().slice(0, 10);
        }
      };

      const xmlEscape = (v: string) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

      const body = categories.map(c => `
  <url>
    <loc>${appUrl}/?category=${xmlEscape(c.slug)}</loc>
    <lastmod>${formatLastMod(c.created_at)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}
</urlset>`;
      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('sitemap-categories.xml error:', error);
      return res.status(500).type('text/plain').send('Erro');
    }
  });

  app.get('/sitemap-images.xml', async (req, res) => {
    try {
      const s = await loadSettingsMapAsync(['seo_sitemap_enabled', 'app_url']);
      const sitemapEnabled = String(s.seo_sitemap_enabled || 'true').toLowerCase() === 'true';
      if (!sitemapEnabled) return res.status(404).type('text/plain').send('Sitemap desabilitado');

      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const products = await dbAsync.all(`SELECT name, slug, image, image_alt FROM products WHERE status = 'active' AND image IS NOT NULL AND image != ''`) as any[];

      const xmlEscape = (v: string) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

      const body = products.map(p => {
        const imgUrl = p.image.startsWith('http') ? p.image : `${appUrl}${p.image.startsWith('/') ? '' : '/'}${p.image}`;
        return `
  <url>
    <loc>${appUrl}/produto/${xmlEscape(p.slug)}</loc>
    <image:image>
      <image:loc>${xmlEscape(imgUrl)}</image:loc>
      <image:title>${xmlEscape(p.name)}</image:title>
      <image:caption>${xmlEscape(p.image_alt || p.name)}</image:caption>
    </image:image>
  </url>`;
      }).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}
</urlset>`;
      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('sitemap-images.xml error:', error);
      return res.status(500).type('text/plain').send('Erro');
    }
  });

  const handleGoogleMerchant = async (req: express.Request, res: express.Response) => {
    try {
      const s = await loadSettingsMapAsync(['site_name', 'site_description', 'app_url', 'seo_organization_name']);
      const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const siteName = s.site_name || 'Digital Bordados';
      const siteDescription = s.site_description || 'Matrizes de Bordados Computadorizados de Alta Qualidade';
      const brandName = s.seo_organization_name || siteName;

      const products = await dbAsync.all(`
        SELECT p.*, c.name as category_name 
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        WHERE p.status = 'active' AND p.price > 0 AND p.image IS NOT NULL AND p.image != ''
      `) as any[];

      const xmlEscape = (v: string) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const stripHtml = (html: string) => String(html || '').replace(/<[^>]*>/g, '').trim();

      const items = products.map(p => {
        const prodUrl = `${appUrl}/produto/${p.slug}`;
        const imgUrl = p.image.startsWith('http') ? p.image : `${appUrl}${p.image}`;
        
        let desc = stripHtml(p.description || '');
        if (desc.length < 10) {
          desc = `Matriz de bordado profissional computadorizada: ${p.name}. Produto digital disponível para download imediato em diversas extensões (PES, JEF, DST, XXX, EXP).`;
        }
        
        return `
    <item>
      <g:id>${p.id}</g:id>
      <title>${xmlEscape(p.name)}</title>
      <description>${xmlEscape(desc)}</description>
      <link>${xmlEscape(prodUrl)}</link>
      <g:image_link>${xmlEscape(imgUrl)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>in stock</g:availability>
      <g:price>${Number(p.price).toFixed(2)} BRL</g:price>
      <g:brand>${xmlEscape(brandName)}</g:brand>
      <g:mpn>${xmlEscape(`${p.slug}-${p.id}`)}</g:mpn>
      <g:google_product_category>Arts &amp; Entertainment &gt; Hobbies &amp; Creative Arts &gt; Crafts &amp; Hobbies &gt; Needlecraft &amp; Sewing</g:google_product_category>
    </item>`;
      }).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${xmlEscape(siteName)}</title>
    <link>${xmlEscape(appUrl)}</link>
    <description>${xmlEscape(siteDescription)}</description>
    <language>pt-BR</language>${items}
  </channel>
</rss>`;

      res.type('application/xml; charset=utf-8');
      return res.send(xml);
    } catch (error) {
      console.error('google-merchant.xml error:', error);
      return res.status(500).type('text/plain').send('Erro ao gerar feed do Google Merchant');
    }
  };

  app.get('/google-merchant.xml', handleGoogleMerchant);
  app.get('/api/seo/google-merchant.xml', handleGoogleMerchant);

  app.get('/api/settings', async (req, res) => {
    try {
      const cached = apiCache.get('public_settings');
      if (cached) return res.json(cached);

      const rows = await dbAsync.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "address", "contact_hours", "contact_whatsapp", "support_whatsapp", "support_email", "new_badge_days", "redirect_to_checkout_after_add_to_cart", "brand_logos", "facebook_url", "instagram_url", "youtube_url", "lgpd_enabled", "lgpd_require_consent_register", "lgpd_require_checkout_consent", "lgpd_require_marketing_optin", "lgpd_require_cookie_consent", "lgpd_require_policy_acceptance", "lgpd_require_terms_acceptance", "lgpd_dpo_name", "lgpd_dpo_email", "lgpd_dpo_phone", "lgpd_privacy_url", "lgpd_terms_url", "lgpd_cookie_policy_url", "lgpd_policy_version_privacy", "lgpd_policy_version_terms", "lgpd_policy_version_cookies", "top_bar_message", "top_bar_enabled", "home_company_enabled", "home_company_title", "home_company_subtitle", "home_company_text", "home_company_mission", "home_company_vision", "home_company_values", "home_company_image_main", "home_company_image_secondary", "home_company_cta_text", "home_company_cta_link", "home_company_bg_color", "home_company_text_color", "home_company_icons", "seo_meta_title", "seo_meta_description", "seo_keywords", "seo_robots_index", "seo_robots_follow", "seo_og_image", "favicon_url", "seo_twitter_card", "seo_facebook_url", "seo_instagram_url", "seo_twitter_url", "seo_organization_name", "seo_organization_logo", "seo_enable_product_schema", "seo_enable_organization_schema", "seo_enable_breadcrumb_schema", "seo_sitemap_enabled", "seo_robots_custom_rules")') as any[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);
    } catch (error) {
      console.error('Fetch Public Settings Error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuraÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes' });
    }
  });

  app.get('/api/categories', async (req, res) => {
    try {
      const cached = apiCache.get('public_categories');
      if (cached) return res.json(cached);

      const categories = await dbAsync.all(`
        SELECT 
          c.*,
          (
            SELECT COUNT(DISTINCT pcr.product_id)
            FROM product_category_relations pcr
            JOIN products p ON pcr.product_id = p.id
            WHERE pcr.category_id = c.id AND p.status IN ('active', 'ativo')
          ) AS product_count
        FROM product_categories c
        WHERE c.status = 'active'
        ORDER BY c.sort_order ASC, c.name ASC
      `);
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

      const insertResult = await dbAsync.run(`
        INSERT INTO matrix_requests (name, email, whatsapp, details, reference_image, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, normalizedName, normalizedEmail, normalizedWhatsapp, normalizedDetails || null, referenceImagePath);

      const settings = await loadSettingsMapAsync(['app_url', 'email_contact', 'matrix_request_team_email', 'email_requests']);
      const appUrl = settings.app_url || `${req.protocol}://${req.get('host')}`;
      const referenceImageUrl = referenceImagePath ? `${appUrl}${referenceImagePath}` : '';
      const requestId = Number(insertResult.lastInsertRowid || 0);
      const teamEmail = String(settings.email_requests || settings.matrix_request_team_email || settings.email_contact || '').trim().toLowerCase();

      // Ajuste 5: Preparar data/hora formatada em PT-BR e HTML para details
      const now = new Date();
      const dateTimeStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const detailsHtml = normalizedDetails.replace(/\n/g, '<br/>');

      const createBudgetLog = async (recipientType: 'team' | 'customer', toEmail: string, templateKey: string) => {
        const result = await dbAsync.run(`
          INSERT INTO matrix_request_email_logs (matrix_request_id, recipient_type, to_email, template_key, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, requestId, recipientType, toEmail || null, templateKey);
        return Number(result.lastInsertRowid || 0);
      };
      const resolveEmailError = (value: any) => String(value || '').slice(0, 2000);
      const markBudgetLog = async (logId: number, status: 'sent' | 'erro' | 'pending', errorMsg?: string) => {
        if (!logId) return;
        await dbAsync.run(`
          UPDATE matrix_request_email_logs
          SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, status, errorMsg || null, logId);
      };

      let teamStatus: 'sent' | 'erro' | 'pending' = 'pending';
      let customerStatus: 'sent' | 'erro' | 'pending' = 'pending';
      let teamError = '';
      let customerError = '';

      if (teamEmail) {
        const teamLogId = await createBudgetLog('team', teamEmail, 'matrix_request_team_received');
        const teamEmailResult = await sendEmail({
          to: teamEmail,
          templateKey: 'matrix_request_team_received',
          variables: {
            request_id: requestId,
            name: normalizedName,
            email: normalizedEmail,
            whatsapp: normalizedWhatsapp,
            details: normalizedDetails,
            details_html: detailsHtml,
            date_time: dateTimeStr,
            reference_image: referenceImageUrl,
          },
        });
        if (!teamEmailResult.success) {
          await markBudgetLog(teamLogId, 'erro', resolveEmailError(teamEmailResult.error));
          teamStatus = 'erro';
          teamError = resolveEmailError(teamEmailResult.error);
          console.error('Matrix request team email failed:', teamEmailResult.error);
        } else {
          await markBudgetLog(teamLogId, 'sent');
          teamStatus = 'sent';
        }
      } else {
        teamStatus = 'erro';
        teamError = 'Email da equipe nao configurado em Configuracoes > Aparência e Home.';
      }

      const customerLogId = await createBudgetLog('customer', normalizedEmail, 'matrix_request_in_analysis');
      const customerEmailResult = await sendEmail({
        to: normalizedEmail,
        templateKey: 'matrix_request_in_analysis',
        variables: {
          request_id: requestId,
          name: normalizedName,
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          details: normalizedDetails,
          details_html: detailsHtml,
          date_time: dateTimeStr,
          reference_image: referenceImageUrl,
        },
      });
      if (!customerEmailResult.success) {
        await markBudgetLog(customerLogId, 'erro', resolveEmailError(customerEmailResult.error));
        customerStatus = 'erro';
        customerError = resolveEmailError(customerEmailResult.error);
      } else {
        await markBudgetLog(customerLogId, 'sent');
        customerStatus = 'sent';
      }

      const hasEmailFailure = teamStatus === 'erro' || customerStatus === 'erro';

      return res.status(201).json({
        success: true,
        id: requestId,
        message: hasEmailFailure
          ? 'Solicitacao registrada. Houve falha em um ou mais envios de e-mail; verifique Configuracoes > E-mail > Logs de Orcamento.'
          : 'Solicitacao de matriz enviada com sucesso',
        email_delivery: {
          team: { status: teamStatus, error: teamError || null },
          customer: { status: customerStatus, error: customerError || null },
        },
      });
    } catch (error) {
      console.error('Matrix request submit error:', error);
      return res.status(500).json({ error: 'Erro ao enviar solicitacao de matriz' });
    }
  });



  app.get('/api/products', async (req, res) => {
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

      const totalCountRow = await dbAsync.get(`
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

      const newBadgeDays = await resolveNewBadgeDays();
      const products = (await dbAsync.all(query, ...params, itemsPerPage, offset) as any[]).map((product) => ({
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

  app.get('/api/products/:slug', async (req, res) => {
    try {
      const productRow = await dbAsync.get(`
        SELECT p.*,
               pc.id as category_id,
               pc.name as category_name,
               pc.slug as category_slug,
               pc.parent_id as category_parent_id,
               parent_cat.name as parent_category_name,
               parent_cat.slug as parent_category_slug
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_categories parent_cat ON pc.parent_id = parent_cat.id
        WHERE p.slug = ?
      `, req.params.slug) as any;

      if (!productRow) return res.status(404).json({ error: 'Produto nao encontrado' });

      // Se a categoria principal for nula, buscar a primeira categoria vinculada
      if (!productRow.category_id) {
        const fallbackCat = await dbAsync.get(`
          SELECT pc.id, pc.name, pc.slug, pc.parent_id,
                 parent_cat.name as parent_name, parent_cat.slug as parent_slug
          FROM product_category_relations pcr
          JOIN product_categories pc ON pcr.category_id = pc.id
          LEFT JOIN product_categories parent_cat ON pc.parent_id = parent_cat.id
          WHERE pcr.product_id = ?
          LIMIT 1
        `, productRow.id) as any;

        if (fallbackCat) {
          productRow.category_id = fallbackCat.id;
          productRow.category_name = fallbackCat.name;
          productRow.category_slug = fallbackCat.slug;
          productRow.category_parent_id = fallbackCat.parent_id;
          productRow.parent_category_name = fallbackCat.parent_name;
          productRow.parent_category_slug = fallbackCat.parent_slug;
        }
      }

      const newBadgeDays = await resolveNewBadgeDays();
      const product = {
        ...productRow,
        is_new: resolveProductIsNew(productRow, newBadgeDays),
      };

      // Related products: prioritize same category (strict parent/child hierarchy)
      let relatedCategoryId = product.category_id;
      let isChildCategory = false;

      if (product.category_id) {
        if (product.category_parent_id) {
          isChildCategory = true;
        }
      } else {
        const firstRelation = await dbAsync.get(`
          SELECT pc.id, pc.parent_id
          FROM product_category_relations pcr
          JOIN product_categories pc ON pcr.category_id = pc.id
          WHERE pcr.product_id = ?
          LIMIT 1
        `, product.id) as any;

        if (firstRelation) {
          relatedCategoryId = firstRelation.id;
          if (firstRelation.parent_id) {
            isChildCategory = true;
          }
        }
      }

      const maxRelated = 24;
      let relatedRows: any[] = [];

      if (relatedCategoryId) {
        relatedRows = await dbAsync.all(`
          SELECT
            p.*,
            COALESCE(SUM(
              CASE
                WHEN o.status IN ('paid', 'approved', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing') THEN oi.quantity
                ELSE 0
              END
            ), 0) AS sold_qty
          FROM products p
          LEFT JOIN product_category_relations pcr ON pcr.product_id = p.id
          LEFT JOIN order_items oi ON oi.product_id = p.id
          LEFT JOIN orders o ON o.id = oi.order_id
          WHERE p.id != ?
            AND p.status = 'active'
            AND (
              p.category_id = ?
              OR pcr.category_id = ?
            )
          GROUP BY p.id
          ORDER BY sold_qty DESC, p.created_at DESC, p.id DESC
          LIMIT ?
        `, product.id, relatedCategoryId, relatedCategoryId, maxRelated) as any[];
      }

      // Se for categoria PAI e não tiver itens suficientes, ou se não houver categoria, preencher com RAND
      if (!isChildCategory && relatedRows.length < maxRelated) {
        const existingIds = new Set<number>(relatedRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
        const missing = maxRelated - relatedRows.length;
        const fallbackRows = await dbAsync.all(`
          SELECT p.*
          FROM products p
          WHERE p.id != ?
            AND p.status = 'active'
          ORDER BY RAND()
          LIMIT ?
        `, product.id, missing * 2) as any[];

        fallbackRows.forEach((row) => {
          const id = Number(row?.id || 0);
          if (!id || existingIds.has(id) || relatedRows.length >= maxRelated) return;
          existingIds.add(id);
          relatedRows.push({ ...row, sold_qty: 0, relevance_score: 0 });
        });
      }

      const relatedProducts = relatedRows.map((relatedProduct) => ({
        ...relatedProduct,
        is_new: resolveProductIsNew(relatedProduct, newBadgeDays),
      }));

      // Gallery images
      const galleryRows = await dbAsync.all(`
        SELECT id, product_id, url, alt_text, is_featured, created_at, file_type
        FROM product_images
        WHERE product_id = ?
          AND (
            file_type = 'gallery'
            OR file_type IS NULL
            OR file_type = ''
          )
        ORDER BY id ASC
      `, product.id) as any[];
      const gallery = galleryRows.map((row) => ({
        id: row.id,
        product_id: row.product_id,
        url: String(row?.url || '').trim(),
        alt_text: String(row?.alt_text || '').trim(),
        full_url: normalizePublicMediaUrl(row?.url),
        is_featured: row?.is_featured ?? 0,
        created_at: row?.created_at ?? null,
        file_type: row?.file_type ?? null,
      }));

      const resolvedMainImage = resolvePublicMediaWithFallback(product?.image, product?.slug || '', 'image', Number(product?.id || 0));
      const resolvedProductionSheet = resolvePublicMediaWithFallback(product?.production_sheet, product?.slug || '', 'pdf', Number(product?.id || 0));

      const normalizedProduct = {
        ...product,
        image: resolvedMainImage,
        production_sheet: resolvedProductionSheet,
      };
      const normalizedRelatedProducts = relatedProducts.map((relatedProduct) => ({
        ...relatedProduct,
        image: normalizePublicMediaUrl(relatedProduct?.image),
      }));

      // Carregar todas as categorias vinculadas ao produto
      const categoriesRows = await dbAsync.all(`
        SELECT DISTINCT pc.id, pc.name, pc.slug, pc.parent_id,
               parent_cat.name as parent_name, parent_cat.slug as parent_slug
        FROM product_category_relations pcr
        JOIN product_categories pc ON pcr.category_id = pc.id
        LEFT JOIN product_categories parent_cat ON pc.parent_id = parent_cat.id
        WHERE pcr.product_id = ?
      `, product.id) as any[];

      const categories = categoriesRows.map((row) => ({
        id: row.id,
        name: String(row?.name || '').trim(),
        slug: String(row?.slug || '').trim(),
        parent_id: row?.parent_id ?? null,
        parent_name: row?.parent_name ? String(row.parent_name).trim() : null,
        parent_slug: row?.parent_slug ? String(row.parent_slug).trim() : null,
      }));

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[api/products/:slug] production_sheet raw:', product?.production_sheet);
        console.debug('[api/products/:slug] production_sheet normalized:', normalizedProduct.production_sheet);
        console.debug('[api/products/:slug] gallery rows:', gallery);
        console.debug('[api/products/:slug] product categories:', categories);
      }

      res.json({ ...normalizedProduct, gallery, relatedProducts: normalizedRelatedProducts, categories });
    } catch (error) {
      console.error('Error fetching product detail:', error);
      res.status(500).json({ error: 'Erro interno ao buscar produto' });
    }
  });

  // -------------------------------- Reviews --------------------------------
  app.get('/api/products/:slug/reviews', async (req, res) => {
    try {
      const { slug } = req.params;
      const product = await dbAsync.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });

      const reviews = await dbAsync.all(`
        SELECT r.*, u.name as user_name 
        FROM reviews r 
        LEFT JOIN users u ON r.user_id = u.id 
        WHERE r.product_id = ? AND r.status = 'approved'
        ORDER BY r.created_at DESC
      `, product.id);

      const stats = await dbAsync.get('SELECT AVG(rating) as avgRating FROM reviews WHERE product_id = ? AND status = "approved"', product.id) as any;

      res.json({ reviews, avgRating: stats?.avgRating || 0 });
    } catch (error) {
      console.error('Fetch reviews error:', error);
      res.status(500).json({ error: 'Erro ao buscar avaliaÃƒÂ§ÃƒÂµes' });
    }
  });

  app.post('/api/products/:slug/reviews', authenticate, async (req, res) => {
    try {
      const { slug } = req.params;
      const { rating, comment } = req.body;
      const user = (req as any).user;

      if (!rating || !comment) {
        return res.status(400).json({ error: 'Nota e comentÃƒÂ¡rio sÃƒÂ£o obrigatÃƒÂ³rios' });
      }

      const product = await dbAsync.get('SELECT id FROM products WHERE slug = ?', slug) as any;
      if (!product) return res.status(404).json({ error: 'Produto nÃƒÂ£o encontrado' });

      await dbAsync.run(`
        INSERT INTO reviews (user_id, product_id, rating, comment, status) 
        VALUES (?, ?, ?, ?, 'approved')
      `, user.id, product.id, rating, comment);

      res.json({ success: true });
    } catch (error) {
      console.error('Submit review error:', error);
      res.status(500).json({ error: 'Erro ao enviar avaliaÃƒÂ§ÃƒÂ£o' });
    }
  });

  // -------------------------------- Admin Reviews --------------------------------
  app.get('/api/admin/reviews', authenticate, isAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const offset = (page - 1) * limit;
      const statusFilter = req.query.status as string;
      const search = req.query.q as string;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (statusFilter && statusFilter !== 'all') {
        whereClause += ' AND r.status = ?';
        params.push(statusFilter);
      }

      if (search) {
        whereClause += ' AND (r.comment LIKE ? OR u.name LIKE ? OR p.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const reviews = await dbAsync.all(`
        SELECT r.*, u.name as user_name, u.email as user_email, p.name as product_name, p.slug as product_slug
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN products p ON r.product_id = p.id
        ${whereClause}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `, ...params, limit, offset) as any[];

      const totalRow = await dbAsync.get(`
        SELECT COUNT(*) as total
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN products p ON r.product_id = p.id
        ${whereClause}
      `, ...params) as any;

      const total = totalRow?.total || 0;
      const pages = Math.ceil(total / limit) || 1;

      res.json({
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages
        }
      });
    } catch (error) {
      console.error('Fetch admin reviews error:', error);
      res.status(500).json({ error: 'Erro ao buscar avaliaÃ§Ãµes no painel de controle' });
    }
  });

  app.patch('/api/admin/reviews/:id/status', authenticate, isAdmin, async (req, res) => {
    try {
      const reviewId = Number(req.params.id);
      const { status } = req.body;

      if (!['approved', 'pending', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status invÃ¡lido. Escolha: approved, pending ou rejected.' });
      }

      const review = await dbAsync.get('SELECT id FROM reviews WHERE id = ?', reviewId);
      if (!review) return res.status(404).json({ error: 'AvaliaÃ§Ã£o nÃ£o encontrada' });

      await dbAsync.run('UPDATE reviews SET status = ? WHERE id = ?', status, reviewId);
      res.json({ success: true });
    } catch (error) {
      console.error('Moderate review error:', error);
      res.status(500).json({ error: 'Erro ao moderar status da avaliaÃ§Ã£o' });
    }
  });

  app.delete('/api/admin/reviews/:id', authenticate, isAdmin, async (req, res) => {
    try {
      const reviewId = Number(req.params.id);
      const review = await dbAsync.get('SELECT id FROM reviews WHERE id = ?', reviewId);
      if (!review) return res.status(404).json({ error: 'AvaliaÃ§Ã£o nÃ£o encontrada' });

      await dbAsync.run('DELETE FROM reviews WHERE id = ?', reviewId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete review error:', error);
      res.status(500).json({ error: 'Erro ao excluir avaliaÃ§Ã£o' });
    }
  });



  // -------------------------------- PayPal Utilities --------------------------------

  async function getPayPalConfig() {
    const s = await loadSettingsMapAsync([
      'paypal_enabled', 'paypal_mode',
      'paypal_sandbox_client_id', 'paypal_sandbox_client_secret',
      'paypal_production_client_id', 'paypal_production_client_secret',
      'paypal_default_currency', 'paypal_brl_usd_rate', 'paypal_brl_eur_rate', 'paypal_webhook_id',
    ]);
    // Prioridade máxima para as configurações alteradas/salvas no banco de dados (settings)
    const mode = (s.paypal_mode || process.env.PAYPAL_MODE || 'sandbox').toLowerCase() as 'sandbox' | 'production';
    const clientId = mode === 'production'
      ? (s.paypal_production_client_id || process.env.PAYPAL_PRODUCTION_CLIENT_ID || '')
      : (s.paypal_sandbox_client_id || process.env.PAYPAL_SANDBOX_CLIENT_ID || '');
    const clientSecret = mode === 'production'
      ? (s.paypal_production_client_secret || process.env.PAYPAL_PRODUCTION_CLIENT_SECRET || '')
      : (s.paypal_sandbox_client_secret || process.env.PAYPAL_SANDBOX_CLIENT_SECRET || '');
    const rawCurrency = String(s.paypal_default_currency || process.env.PAYPAL_DEFAULT_CURRENCY || 'USD').toUpperCase();
    const currency = (['BRL', 'USD', 'EUR'].includes(rawCurrency) ? rawCurrency : 'USD') as 'BRL' | 'USD' | 'EUR';
    const usdRate = parseFloat(s.paypal_brl_usd_rate || process.env.PAYPAL_BRL_USD_RATE || '5.20');
    const eurRate = parseFloat(s.paypal_brl_eur_rate || process.env.PAYPAL_BRL_EUR_RATE || '6.00');
    const webhookId = s.paypal_webhook_id || process.env.PAYPAL_WEBHOOK_ID || '';
    const enabled = (s.paypal_enabled === 'true');
    return {
      mode,
      clientId,
      clientSecret,
      currency,
      usdRate: Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 5.2,
      eurRate: Number.isFinite(eurRate) && eurRate > 0 ? eurRate : 6.0,
      webhookId,
      enabled,
    };
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

  function convertBrlToCurrency(totalBrl: number, currency: 'BRL' | 'USD' | 'EUR', usdRate: number, eurRate: number) {
    if (currency === 'BRL') return Math.round(totalBrl * 100) / 100;
    if (currency === 'EUR') return Math.round((totalBrl / eurRate) * 100) / 100;
    return Math.round((totalBrl / usdRate) * 100) / 100;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PayPal Endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  // POST /api/paypal/create-order
  app.post('/api/paypal/create-order', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const freshUser = await getUserById(Number(user?.id || 0));
      if (!freshUser) return res.status(401).json({ error: 'Usuario nao encontrado' });
      if (freshUser.status !== 'ativo' && freshUser.status !== 'active') {
        return res.status(403).json({ error: 'Conta inativa' });
      }
      // Bloqueio de e-mail verificado desabilitado na rota de pagamento
      // if ((await resolveEmailVerificationRequired()) && !freshUser.email_verified_at) {
      //   return res.status(403).json({ error: 'Confirme seu e-mail para finalizar compras.', code: 'EMAIL_NOT_VERIFIED' });
      // }

      const { items, checkout_data_processing_accepted } = req.body || {};
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Carrinho vazio' });
      }

      const lgpd = await resolveLgpdSettings();
      if (lgpd.enabled) {
        const lgpdCompliance = await ensureUserLgpdCompliance(Number(freshUser.id));
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
          await upsertUserConsent({
            userId: Number(freshUser.id),
            consentKey: 'checkout_data_processing',
            granted: true,
            source: 'checkout_paypal',
            policyVersion: lgpd.policyVersionPrivacy,
            req,
          });
        }
      }

      const cfg = await getPayPalConfig();
      if (!cfg.enabled) return res.status(400).json({ error: 'PayPal nÃƒÂ£o estÃƒÂ¡ habilitado' });
      if (!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ error: 'Credenciais PayPal nÃƒÂ£o configuradas' });

      // Validate products and calculate total in BRL
      let totalBrl = 0;
      const validatedItems: any[] = [];
      for (const item of items) {
        const product = await dbAsync.get('SELECT id, name, price, sale_price, status FROM products WHERE id = ?', item.product_id) as any;
        if (!product || product.status !== 'active') {
          return res.status(400).json({ error: `Produto ID ${item.product_id} nÃƒÂ£o encontrado ou inativo` });
        }
        const price = product.sale_price || product.price;
        totalBrl += price;
        validatedItems.push({ product_id: product.id, product_name: product.name, price });
      }

      const convertedTotal = convertBrlToCurrency(totalBrl, cfg.currency, cfg.usdRate, cfg.eurRate);
      const baseUrl = getPayPalBaseUrl(cfg.mode);
      const appUrl = process.env.APP_URL || loadSettingsMap(['app_url']).app_url || 'https://digitalbordados.com.br';

      // Create internal order
      const orderResult = await dbAsync.run(`
        INSERT INTO orders (user_id, total, status, payment_method, payment_provider, currency,
          original_total_brl, converted_total_usd, exchange_rate, customer_email, customer_name)
        VALUES (?, ?, 'pending', 'paypal', 'paypal', ?, ?, ?, ?, ?, ?)
      `, user.id, totalBrl, cfg.currency, totalBrl, convertedTotal, cfg.currency === 'EUR' ? cfg.eurRate : cfg.usdRate,
         user.email || '', user.name || '');
      const orderId = Number(orderResult.lastInsertRowid);

      const customerProfile = await dbAsync.get('SELECT * FROM customers WHERE user_id = ? LIMIT 1', Number(user.id)) as any;
      const userNameParts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = String(customerProfile?.first_name || userNameParts[0] || '');
      const lastName = String(customerProfile?.last_name || userNameParts.slice(1).join(' ') || '');
      await dbAsync.run(`
        INSERT INTO order_customer_details
          (order_id, first_name, last_name, cpf, email, phone, city, state, postal_code, address_line, number, neighborhood, complement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        orderId,
        firstName || null,
        lastName || null,
        String(customerProfile?.cpf || '').trim() || null,
        String(user.email || '').trim().toLowerCase() || null,
        String(customerProfile?.phone || '').trim() || null,
        String(customerProfile?.billing_city || customerProfile?.city || '').trim() || null,
        String(customerProfile?.billing_state || customerProfile?.state || '').trim() || null,
        String(customerProfile?.billing_zip || customerProfile?.zip || '').trim() || null,
        String(customerProfile?.billing_address || customerProfile?.address || '').trim() || null,
        String(customerProfile?.billing_number || customerProfile?.number || '').trim() || null,
        String(customerProfile?.billing_neighborhood || customerProfile?.neighborhood || '').trim() || null,
        String(customerProfile?.billing_complement || customerProfile?.complement || '').trim() || null,
      );

      for (const it of validatedItems) {
        await dbAsync.run('INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, 1)',
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
            value: convertedTotal.toFixed(2),
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

      await dbAsync.run('UPDATE orders SET paypal_order_id = ?, paypal_status = ? WHERE id = ?', paypalOrderId, 'CREATED', orderId);

      const createdEmailPayload = await buildOrderEmailPayload(orderId, 'paypal', 'created', appUrl);
      if (createdEmailPayload?.customerEmail) {
        sendEmail({
          to: createdEmailPayload.customerEmail,
          templateKey: 'order_created',
          variables: createdEmailPayload.variables,
        }).catch((err) => console.error('Failed to send PayPal order_created email:', err));
      }
      const orderNotificationEmail = await getOrderNotificationEmail();
      if (orderNotificationEmail && createdEmailPayload) {
        sendEmail({
          to: orderNotificationEmail,
          templateKey: 'order_created',
          variables: createdEmailPayload.adminVariables,
        }).catch((err) => console.error('Failed to send PayPal order_created team email:', err));
      }

      await dbAsync.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
        'paypal', orderId, paypalOrderId, 'created', 'PayPal order created');

      return res.json({
        success: true,
        order_id: orderId,
        paypal_order_id: paypalOrderId,
        approval_url: approvalLink,
        total_brl: totalBrl,
        converted_total: convertedTotal,
        exchange_rate: cfg.currency === 'EUR' ? cfg.eurRate : cfg.usdRate,
        currency: cfg.currency,
      });
    } catch (error: any) {
      const providerError = error?.response?.data || {};
      const issue = providerError?.details?.[0]?.issue || '';
      const description = providerError?.details?.[0]?.description || providerError?.message || '';
      const friendlyError =
        issue === 'CURRENCY_NOT_SUPPORTED'
          ? 'Sua conta PayPal não aceita esta moeda. Habilite a moeda na conta PayPal ou altere a moeda padrão do recebimento.'
          : 'Erro ao criar pedido PayPal';
      console.error('PayPal create-order error:', providerError || error?.message || error);
      await dbAsync.run(
        'INSERT INTO payment_logs (provider, order_id, external_id, status, message, payload_json) VALUES (?, ?, ?, ?, ?, ?)',
        'paypal',
        null,
        null,
        'error',
        `create-order: ${issue || 'unknown'} ${description || ''}`.trim(),
        JSON.stringify(providerError || { message: error?.message || 'unknown_error' }),
      );
      return res.status(500).json({ error: friendlyError });
    }
  });

  // POST /api/paypal/capture-order
  app.post('/api/paypal/capture-order', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { paypal_order_id } = req.body || {};
      if (!paypal_order_id) return res.status(400).json({ error: 'paypal_order_id ÃƒÂ© obrigatÃƒÂ³rio' });

      const order = await dbAsync.get('SELECT * FROM orders WHERE paypal_order_id = ?', paypal_order_id) as any;
      if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
      if (Number(order.user_id) !== Number(user?.id)) {
        return res.status(403).json({ error: 'Pedido nao pertence ao usuario autenticado' });
      }

      const cfg = await getPayPalConfig();
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
        await dbAsync.run(`UPDATE orders SET status = 'paid', paypal_status = 'COMPLETED', paypal_capture_id = ?,
          paypal_payer_email = ?, paid_at = NOW() WHERE id = ?`, captureId, payerEmail, order.id);
        await dbAsync.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
          'paypal', order.id, captureId, 'completed', 'Pagamento capturado com sucesso');

        const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const paidEmailPayload = await buildOrderEmailPayload(Number(order.id), 'paypal', 'paid', appUrl);
        if (paidEmailPayload?.customerEmail) {
          sendEmail({
            to: paidEmailPayload.customerEmail,
            templateKey: 'order_paid',
            variables: {
              ...paidEmailPayload.variables,
              downloads_url: `${appUrl}/minha-conta`,
            },
          }).catch((err) => console.error('Failed to send PayPal order_paid email:', err));
        }
        const orderNotificationEmail = await getOrderNotificationEmail();
        if (orderNotificationEmail && paidEmailPayload) {
          sendEmail({
            to: orderNotificationEmail,
            templateKey: 'order_paid',
            variables: {
              ...paidEmailPayload.adminVariables,
              downloads_url: `${appUrl}/admin/pedidos`,
            },
          }).catch((err) => console.error('Failed to send PayPal order_paid team email:', err));
        }

        return res.json({ success: true, status: 'paid', order_id: order.id, capture_id: captureId });
      } else {
        await dbAsync.run("UPDATE orders SET paypal_status = ? WHERE id = ?", captureStatus, order.id);
        await dbAsync.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
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
      if (await isWebhookAlreadyProcessed('paypal', String(eventId))) {
        return res.status(200).json({ received: true, duplicated: true });
      }

      const signatureCheck = await verifyPayPalWebhookSignature(req, payload);
      if (!signatureCheck.ok) {
        await dbAsync.run(`INSERT INTO paypal_webhook_logs (event_id, event_type, resource_id, payload_json, verification_status)
          VALUES (?, ?, ?, ?, ?)`, String(eventId), String(eventType), String(resourceId), JSON.stringify(payload), `invalid:${signatureCheck.reason}`);
        return res.status(401).json({ received: false, error: 'invalid_signature' });
      }

      await dbAsync.run(`INSERT INTO paypal_webhook_logs (event_id, event_type, resource_id, payload_json, verification_status)
        VALUES (?, ?, ?, ?, 'verified')`, eventId, eventType, resourceId, JSON.stringify(payload));

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const captureId = resourceId;
        const order = await dbAsync.get('SELECT * FROM orders WHERE paypal_capture_id = ? OR paypal_order_id = ?',
          captureId, payload?.resource?.supplementary_data?.related_ids?.order_id || '') as any;
        if (order && order.status !== 'paid') {
          await dbAsync.run("UPDATE orders SET status = 'paid', paypal_status = 'COMPLETED', paid_at = NOW() WHERE id = ?", order.id);
          await dbAsync.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
            'paypal', order.id, captureId, 'webhook_completed', 'Pago via webhook PAYMENT.CAPTURE.COMPLETED');

          const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
          const paidEmailPayload = await buildOrderEmailPayload(Number(order.id), 'paypal', 'paid', appUrl);
          if (paidEmailPayload?.customerEmail) {
            sendEmail({
              to: paidEmailPayload.customerEmail,
              templateKey: 'order_paid',
              variables: {
                ...paidEmailPayload.variables,
                downloads_url: `${appUrl}/minha-conta`,
              },
            }).catch((err) => console.error('Failed to send PayPal webhook order_paid email:', err));
          }
          const orderNotificationEmail = await getOrderNotificationEmail();
          if (orderNotificationEmail && paidEmailPayload) {
            sendEmail({
              to: orderNotificationEmail,
              templateKey: 'order_paid',
              variables: {
                ...paidEmailPayload.adminVariables,
                downloads_url: `${appUrl}/admin/pedidos`,
              },
            }).catch((err) => console.error('Failed to send PayPal webhook order_paid team email:', err));
          }
        }
      } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
        const captureId = resourceId;
        const order = await dbAsync.get('SELECT * FROM orders WHERE paypal_capture_id = ?', captureId) as any;
        if (order) {
          await dbAsync.run("UPDATE orders SET status = 'failed', paypal_status = 'DENIED' WHERE id = ?", order.id);
          await dbAsync.run('INSERT INTO payment_logs (provider, order_id, external_id, status, message) VALUES (?, ?, ?, ?, ?)',
            'paypal', order.id, captureId, 'denied', 'Captura negada via webhook PAYMENT.CAPTURE.DENIED');
        }
      }

      await markWebhookProcessed('paypal', String(eventId), String(resourceId || ''));
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      return res.status(200).json({ received: true });
    }
  });

  // GET /api/admin/paypal/test
  app.get('/api/admin/paypal/test', authenticate, isAdmin, async (req, res) => {
    try {
      const cfg = await getPayPalConfig();
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
  app.get('/api/admin/paypal/webhook-logs', authenticate, isAdmin, async (req, res) => {
    try {
      const logs = await dbAsync.all('SELECT id, event_id, event_type, resource_id, verification_status, created_at FROM paypal_webhook_logs ORDER BY created_at DESC LIMIT 100');
      return res.json(logs);
    } catch (error) {
      console.error('PayPal webhook-logs error:', error);
      return res.status(500).json({ error: 'Erro ao buscar logs PayPal' });
    }
  });

  // GET /api/checkout/paypal/config (pÃƒÂºblico - retorna apenas client_id e modo)
  app.get('/api/checkout/paypal/config', async (req, res) => {
    try {
      const cfg = await getPayPalConfig();
      return res.json({
        enabled: cfg.enabled,
        mode: cfg.mode,
        client_id: cfg.clientId,
        currency: cfg.currency,
        brl_usd_rate: cfg.usdRate,
        brl_eur_rate: cfg.eurRate,
        supported_currencies: ['BRL', 'USD', 'EUR'],
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar config PayPal' });
    }
  });

  // --- MÓDULO FILE MANAGER ADMINISTRATIVO SEGURO ---
  const ALLOWED_ROOTS: { [key: string]: string } = {
    'public-uploads': path.resolve(process.cwd(), 'public/uploads'),
    'uploads-arquivos': path.resolve(process.cwd(), 'uploads/arquivos')
  };

  // Garante que as pastas existam no disco
  if (!fs.existsSync(ALLOWED_ROOTS['public-uploads'])) {
    fs.mkdirSync(ALLOWED_ROOTS['public-uploads'], { recursive: true });
  }
  if (!fs.existsSync(ALLOWED_ROOTS['uploads-arquivos'])) {
    fs.mkdirSync(ALLOWED_ROOTS['uploads-arquivos'], { recursive: true });
  }

  const DANGEROUS_EXTENSIONS = ['.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps', '.js', '.jsx', '.ts', '.tsx', '.sh', '.bat', '.cmd', '.exe', '.json', '.htaccess', '.config'];

  function isDangerousFile(fileName: string) {
    const ext = path.extname(fileName).toLowerCase();
    return DANGEROUS_EXTENSIONS.includes(ext);
  }

  function getSafePath(rootKey: string, inputPath: string): string {
    const baseDir = ALLOWED_ROOTS[rootKey];
    if (!baseDir) {
      throw new Error('Área de arquivos inválida ou não autorizada.');
    }
    const resolvedPath = path.resolve(baseDir, inputPath || '');
    const relative = path.relative(baseDir, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Acesso negado: Path Traversal detectado.');
    }
    return resolvedPath;
  }

  function getDiskSpaceInfo() {
    const info = { total: 100 * 1024 * 1024 * 1024, free: 60 * 1024 * 1024 * 1024, used: 40 * 1024 * 1024 * 1024 };
    try {
      if (process.platform === 'win32') {
        const currentDrive = process.cwd().includes(':') ? process.cwd().split(':')[0] + ':' : 'C:';
        const { execSync } = require('child_process');
        const output = execSync(`wmic logicaldisk where "DeviceID='${currentDrive}'" get FreeSpace,Size /format:list`, { encoding: 'utf8' });
        const freeMatch = output.match(/FreeSpace=(\d+)/i);
        const sizeMatch = output.match(/Size=(\d+)/i);
        if (freeMatch && sizeMatch) {
          const free = parseInt(freeMatch[1], 10);
          const total = parseInt(sizeMatch[1], 10);
          return { total, free, used: total - free };
        }
      } else {
        const { execSync } = require('child_process');
        const output = execSync('df -B1 / | tail -n 1', { encoding: 'utf8' });
        const parts = output.trim().split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const free = parseInt(parts[3], 10);
          return { total, free, used };
        }
      }
    } catch (err) {
      console.error('Falha ao ler espaço em disco real, usando fallback:', err);
    }
    return info;
  }

  // GET /api/admin/files - Listar
  app.get('/api/admin/files', authenticate, isAdmin, async (req, res) => {
    try {
      const rootKey = String(req.query.rootKey || '').trim();
      const queryPath = String(req.query.path || '').trim();
      const disk = getDiskSpaceInfo();

      if (!rootKey) {
        // Modo de seleção de raízes: Exibe os dois cards principais como pastas virtuais
        return res.json({
          isRootSelector: true,
          currentPath: '',
          items: [
            { name: 'public/uploads', isDir: true, rootKey: 'public-uploads', size: 0, updatedAt: new Date(), relative: '' },
            { name: 'uploads/arquivos', isDir: true, rootKey: 'uploads-arquivos', size: 0, updatedAt: new Date(), relative: '' }
          ],
          disk
        });
      }

      const targetDir = getSafePath(rootKey, queryPath);
      
      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Diretório não encontrado' });
      }

      const stats = fs.statSync(targetDir);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'O caminho especificado não é um diretório' });
      }

      const files = fs.readdirSync(targetDir);
      const items = files.map((fileName) => {
        const fullPath = path.join(targetDir, fileName);
        try {
          const s = fs.statSync(fullPath);
          return {
            name: fileName,
            isDir: s.isDirectory(),
            size: s.size,
            updatedAt: s.mtime,
            relative: path.relative(ALLOWED_ROOTS[rootKey], fullPath).replace(/\\/g, '/')
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      // Ordenar: pastas primeiro, depois arquivos por data de modificação decrescente (último enviado primeiro)
      items.sort((a: any, b: any) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      const currentRelative = path.relative(ALLOWED_ROOTS[rootKey], targetDir).replace(/\\/g, '/');

      return res.json({
        currentPath: currentRelative,
        rootKey,
        items,
        disk
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao listar arquivos' });
    }
  });

  // GET /api/admin/files/download - Download seguro de arquivo
  app.get('/api/admin/files/download', authenticate, isAdmin, (req, res) => {
    try {
      const rootKey = String(req.query.rootKey || '').trim();
      const relativePath = String(req.query.path || '').trim();
      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      const safePath = getSafePath(rootKey, relativePath);
      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        return res.status(404).json({ error: 'Arquivo não encontrado.' });
      }
      return res.download(safePath);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });

  // POST /api/admin/files/mkdir - Criar pasta
  app.post('/api/admin/files/mkdir', authenticate, isAdmin, async (req, res) => {
    try {
      const rootKey = String(req.body.rootKey || '').trim();
      const baseDirInput = String(req.body.path || '').trim();
      const folderName = String(req.body.name || '').trim();
      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      if (!folderName || isDangerousFile(folderName) || folderName.includes('/') || folderName.includes('\\')) {
        return res.status(400).json({ error: 'Nome de pasta inválido ou contendo caracteres proibidos' });
      }

      const baseDir = getSafePath(rootKey, baseDirInput);
      const targetPath = path.join(baseDir, folderName);
      
      // Validação final de Path Traversal
      getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], targetPath));

      if (fs.existsSync(targetPath)) {
        return res.status(400).json({ error: 'Já existe uma pasta ou arquivo com este nome' });
      }

      fs.mkdirSync(targetPath);
      return res.json({ success: true, message: 'Diretório criado com sucesso!' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao criar diretório' });
    }
  });

  // POST /api/admin/files/rename - Renomear
  app.post('/api/admin/files/rename', authenticate, isAdmin, async (req, res) => {
    try {
      const rootKey = String(req.body.rootKey || '').trim();
      const baseDirInput = String(req.body.path || '').trim();
      const oldName = String(req.body.oldName || '').trim();
      const newName = String(req.body.newName || '').trim();

      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      if (!oldName || !newName || isDangerousFile(newName) || newName.includes('/') || newName.includes('\\')) {
        return res.status(400).json({ error: 'Nome de arquivo inválido ou extensão perigosa' });
      }

      const baseDir = getSafePath(rootKey, baseDirInput);
      const oldPath = path.join(baseDir, oldName);
      const newPath = path.join(baseDir, newName);

      // Validação Path Traversal
      getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], oldPath));
      getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], newPath));

      if (!fs.existsSync(oldPath)) {
        return res.status(404).json({ error: 'Arquivo ou diretório original não encontrado' });
      }
      if (fs.existsSync(newPath)) {
        return res.status(400).json({ error: 'Já existe um arquivo ou pasta com este nome' });
      }

      fs.renameSync(oldPath, newPath);
      return res.json({ success: true, message: 'Renomeado com sucesso!' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao renomear arquivo' });
    }
  });

  // POST /api/admin/files/delete - Excluir
  app.post('/api/admin/files/delete', authenticate, isAdmin, async (req, res) => {
    try {
      const rootKey = String(req.body.rootKey || '').trim();
      const baseDirInput = String(req.body.path || '').trim();
      const name = String(req.body.name || '').trim();

      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Nome do arquivo ou diretório é obrigatório' });
      }

      const baseDir = getSafePath(rootKey, baseDirInput);
      const targetPath = path.join(baseDir, name);

      // Validação Path Traversal
      getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], targetPath));

      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Arquivo ou diretório não encontrado' });
      }

      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }

      return res.json({ success: true, message: 'Excluído com sucesso!' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao excluir' });
    }
  });

  // Configuração do multer temporário para a API de arquivos
  const fileManagerTempDir = path.join(process.cwd(), 'temp/uploads_temp');
  if (!fs.existsSync(fileManagerTempDir)) {
    fs.mkdirSync(fileManagerTempDir, { recursive: true });
  }
  const fileManagerUpload = multer({ dest: fileManagerTempDir });

  // POST /api/admin/files/upload - Upload
  app.post('/api/admin/files/upload', authenticate, isAdmin, fileManagerUpload.array('files'), async (req, res) => {
    try {
      const rootKey = String(req.body.rootKey || req.query.rootKey || '').trim();
      const baseDirInput = String(req.body.path || '').trim();
      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      const baseDir = getSafePath(rootKey, baseDirInput);
      const reqFiles = (req.files || []) as any;

      if (reqFiles.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const uploadedFiles = [];
      const skippedFiles = [];

      for (const file of reqFiles) {
        const originalName = file.originalname;
        if (isDangerousFile(originalName)) {
          fs.unlinkSync(file.path); // Apaga temporário perigoso
          skippedFiles.push(originalName);
          continue;
        }

        const targetPath = path.join(baseDir, originalName);
        
        // Validação Path Traversal final
        getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], targetPath));

        // Mover com fallback EXDEV
        try {
          fs.renameSync(file.path, targetPath);
        } catch (renameError: any) {
          if (renameError.code === 'EXDEV') {
            fs.copyFileSync(file.path, targetPath);
            fs.unlinkSync(file.path);
          } else {
            throw renameError;
          }
        }
        uploadedFiles.push(originalName);
      }

      return res.json({
        success: true,
        message: 'Upload concluído!',
        uploaded: uploadedFiles,
        skipped: skippedFiles
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao realizar upload' });
    }
  });

  // POST /api/admin/files/unzip - Descompactar ZIP com proteção Zip Slip
  app.post('/api/admin/files/unzip', authenticate, isAdmin, async (req, res) => {
    try {
      const rootKey = String(req.body.rootKey || '').trim();
      const baseDirInput = String(req.body.path || '').trim();
      const fileName = String(req.body.name || '').trim();

      if (!rootKey) {
        return res.status(400).json({ error: 'Parâmetro rootKey é obrigatório.' });
      }
      if (!fileName || path.extname(fileName).toLowerCase() !== '.zip') {
        return res.status(400).json({ error: 'Apenas arquivos .zip são permitidos para extração' });
      }

      const baseDir = getSafePath(rootKey, baseDirInput);
      const zipPath = path.join(baseDir, fileName);

      // Validação Path Traversal
      getSafePath(rootKey, path.relative(ALLOWED_ROOTS[rootKey], zipPath));

      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: 'Arquivo ZIP não encontrado' });
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // Validação antecipada contra Zip Slip e extensões nocivas
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName;
        
        if (isDangerousFile(entryName)) {
          return res.status(400).json({ error: `O arquivo contido '${entryName}' possui uma extensão proibida por segurança.` });
        }

        const targetPath = path.resolve(baseDir, entryName);
        const relative = path.relative(baseDir, targetPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return res.status(400).json({ error: 'Acesso negado: Tentativa de Zip Slip detectada no arquivo ZIP.' });
        }
      }

      // Extração segura
      zip.extractAllTo(baseDir, true);
      return res.json({ success: true, message: 'Arquivo ZIP descompactado com sucesso!' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao descompactar arquivo ZIP' });
    }
  });

  // Vite Integration
  const isProdEnv = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const hasDistIndex = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')) || fs.existsSync(path.join(_dirname, 'index.html'));
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
    const distCandidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(_dirname),
      path.resolve(_dirname, 'dist'),
      path.resolve(_dirname, '..', 'dist'),
    ];
    const distPath = distCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));
    if (!distPath) {
      throw new Error(
        `Production build not found. Tried: ${distCandidates.join(', ')}`,
      );
    }
    console.log('Resolved dist path:', distPath);
    const assetsPath = path.join(distPath, 'assets');
    const indexFilePath = path.join(distPath, 'index.html');

    if (!fs.existsSync(assetsPath)) {
      throw new Error(`Assets directory not found: ${assetsPath}`);
    }

    app.use(
      '/assets',
      express.static(assetsPath, {
        fallthrough: false,
        immutable: true,
        maxAge: '365d',
      }),
    );
    app.use('/assets', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!err) return next();
      const status = Number(err?.status || err?.statusCode || 500);
      if (status === 404) {
        return res.status(404).type('text/plain').send('Asset not found');
      }
      console.error('Asset delivery error:', req.originalUrl, err);
      return res.status(500).type('text/plain').send('Asset delivery error');
    });

    app.use(
      express.static(distPath, {
        fallthrough: true,
        index: false
      }),
    );

    app.get('*', async (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/')) return next();
      if (req.path.startsWith('/assets/')) return next();

      const accept = String(req.headers.accept || '');
      if (!accept.includes('text/html')) return next();

      try {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        let html = '';
        try {
          html = await fs.promises.readFile(indexFilePath, 'utf-8');
        } catch (err) {
          return next(err);
        }

        const s = await loadSettingsMapAsync([
          'site_name',
          'site_description',
          'logo_url',
          'facebook_url',
          'instagram_url',
          'youtube_url',
          'app_url',
          'seo_meta_title',
          'seo_meta_description',
          'seo_og_image',
          'seo_organization_name',
          'seo_organization_logo'
        ]);

        const appUrl = String(process.env.APP_URL || s.app_url || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const siteName = s.site_name || 'Digital Bordados';
        const orgName = s.seo_organization_name || siteName;
        const orgLogo = s.seo_organization_logo || s.logo_url || '/logo.png';
        const absoluteOrgLogo = orgLogo.startsWith('http') ? orgLogo : `${appUrl}${orgLogo.startsWith('/') ? '' : '/'}${orgLogo}`;

        let title = s.seo_meta_title || siteName;
        let description = s.seo_meta_description || s.site_description || 'Matrizes de Bordados Computadorizados';
        let canonicalUrl = `${appUrl}${req.path}`;
        if (req.query.category) {
          canonicalUrl += `?category=${encodeURIComponent(String(req.query.category))}`;
        }
        let ogImage = s.seo_og_image || s.logo_url || '/logo.png';
        let absoluteOgImage = ogImage.startsWith('http') ? ogImage : `${appUrl}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`;
        let ogType = 'website';
        
        const jsonLdGraph: any[] = [];

        // Adicionar Website no grafo
        jsonLdGraph.push({
          "@type": "WebSite",
          "@id": `${appUrl}/#website`,
          "url": `${appUrl}/`,
          "name": siteName,
          "description": description,
          "publisher": { "@id": `${appUrl}/#organization` },
          "potentialAction": [{
            "@type": "SearchAction",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": `${appUrl}/loja?search={search_term_string}`
            },
            "query-input": "required name=search_term_string"
          }]
        });

        // Adicionar Organization no grafo
        const sameAsLinks = [s.facebook_url, s.instagram_url, s.youtube_url].filter(Boolean) as string[];
        jsonLdGraph.push({
          "@type": "Organization",
          "@id": `${appUrl}/#organization`,
          "name": orgName,
          "url": `${appUrl}/`,
          "logo": {
            "@type": "ImageObject",
            "@id": `${appUrl}/#logo`,
            "url": absoluteOrgLogo,
            "caption": orgName
          },
          "sameAs": sameAsLinks
        });

        // Detecção de Rota de Produto
        const productMatch = req.path.match(/^\/produto\/([^/]+)$/);
        
        if (productMatch) {
          const productSlug = productMatch[1];
          const product = await dbAsync.get(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.slug = ? AND p.status = 'active'
          `, productSlug) as any;

          if (product) {
            title = `${product.name} | ${siteName}`;
            
            // Gerar descrição dinamicamente se estiver muito curta ou vazia
            let rawDesc = product.description ? String(product.description).replace(/<[^>]*>/g, '').trim() : '';
            if (rawDesc.length < 10) {
              description = `Compre a matriz de bordado ${product.name} na Digital Bordados. Arquivo digital de alta qualidade pronto para download imediato em PES, JEF, DST, XXX, EXP.`;
            } else {
              description = rawDesc.slice(0, 160);
            }

            canonicalUrl = `${appUrl}/produto/${product.slug}`;
            if (product.image) {
              absoluteOgImage = product.image.startsWith('http') ? product.image : `${appUrl}${product.image.startsWith('/') ? '' : '/'}${product.image}`;
            }
            ogType = 'product';

            // Adicionar Breadcrumb do Produto
            jsonLdGraph.push({
              "@type": "BreadcrumbList",
              "@id": `${canonicalUrl}/#breadcrumb`,
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Início",
                  "item": `${appUrl}/`
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "Loja",
                  "item": `${appUrl}/loja`
                },
                {
                  "@type": "ListItem",
                  "position": 3,
                  "name": product.category_name || "Matrizes",
                  "item": product.category_name ? `${appUrl}/?category=${encodeURIComponent(product.category_name.toLowerCase())}` : `${appUrl}/loja`
                },
                {
                  "@type": "ListItem",
                  "position": 4,
                  "name": product.name,
                  "item": canonicalUrl
                }
              ]
            });

            // Adicionar Product no grafo
            const offers: any = {
              "@type": "Offer",
              "url": canonicalUrl,
              "priceCurrency": "BRL",
              "price": Number(product.price || 0).toFixed(2),
              "priceValidUntil": "2029-12-31",
              "availability": "https://schema.org/InStock",
              "itemCondition": "https://schema.org/NewCondition"
            };

            const images = [absoluteOgImage];
            
            // Adicionar galeria se houver (opcional)
            const galleryImages = await dbAsync.all('SELECT url FROM product_images WHERE product_id = ?', product.id) as any[];
            galleryImages.forEach(g => {
              if (g.url) {
                images.push(g.url.startsWith('http') ? g.url : `${appUrl}${g.url.startsWith('/') ? '' : '/'}${g.url}`);
              }
            });

            jsonLdGraph.push({
              "@type": "Product",
              "@id": `${canonicalUrl}/#product`,
              "name": product.name,
              "image": images,
              "description": description,
              "sku": `${product.slug}-${product.id}`,
              "mpn": `${product.slug}-${product.id}`,
              "brand": {
                "@type": "Brand",
                "name": orgName
              },
              "offers": offers
            });

            // Adicionar ImageObject no grafo para o Google Imagens
            jsonLdGraph.push({
              "@type": "ImageObject",
              "@id": `${canonicalUrl}/#primaryimage`,
              "url": absoluteOgImage,
              "contentUrl": absoluteOgImage,
              "caption": product.image_alt || product.name
            });
          }
        } else {
          // Adicionar Breadcrumb genérico para outras páginas
          let breadcrumbName = 'Página';
          if (req.path === '/loja') breadcrumbName = 'Loja';
          else if (req.path === '/contato') breadcrumbName = 'Contato';
          else if (req.path === '/orcamento') breadcrumbName = 'Solicitar Orçamento';
          else if (req.path === '/login') breadcrumbName = 'Entrar';
          else if (req.path === '/cadastro') breadcrumbName = 'Cadastrar';

          jsonLdGraph.push({
            "@type": "BreadcrumbList",
            "@id": `${canonicalUrl}/#breadcrumb`,
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Início",
                "item": `${appUrl}/`
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": breadcrumbName,
                "item": canonicalUrl
              }
            ]
          });
        }

        const xmlEscape = (v: string) =>
          String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const seoTags = `
  <title>${xmlEscape(title)}</title>
  <meta name="description" content="${xmlEscape(description)}" />
  <link rel="canonical" href="${xmlEscape(canonicalUrl)}" />
  <meta property="og:title" content="${xmlEscape(title)}" />
  <meta property="og:description" content="${xmlEscape(description)}" />
  <meta property="og:url" content="${xmlEscape(canonicalUrl)}" />
  <meta property="og:image" content="${xmlEscape(absoluteOgImage)}" />
  <meta property="og:type" content="${xmlEscape(ogType)}" />
  <meta property="og:site_name" content="${xmlEscape(siteName)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${xmlEscape(title)}" />
  <meta name="twitter:description" content="${xmlEscape(description)}" />
  <meta name="twitter:image" content="${xmlEscape(absoluteOgImage)}" />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": jsonLdGraph
  })}</script>
`;

        // Substitui a tag title original e insere as tags SEO + JSON-LD no head
        html = html.replace(/<title>.*?<\/title>/i, '');
        html = html.replace('</head>', `${seoTags}\n</head>`);

        return res.type('text/html').send(html);
      } catch (err) {
        console.error('Prerender error:', err);
        return res.sendFile(indexFilePath);
      }
    });
  }

  // Cron Job: Pending PIX Reminder (Runs every 30 minutes)
  setInterval(async () => {
    try {
      console.log('[Cron] Checking for pending PIX payments...');
      
      const pendingOrders = await dbAsync.all(`
        SELECT * FROM orders 
        WHERE status = 'pending' 
        AND payment_method = 'pix'
        AND created_at <= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `) as any[];

      const notifiedLogs = await dbAsync.all(`SELECT subject FROM email_logs WHERE template_key = 'payment_pending_pix'`) as any[];
      const notifiedOrderIds = notifiedLogs.map(log => {
        const match = log.subject.match(/#(\d+)/);
        return match ? Number(match[1]) : null;
      }).filter(Boolean);

      const _settings = (await dbAsync.all('SELECT * FROM settings LIMIT 1') as any[])[0] || null;
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

  // Cron Job para Backup Automático (Roda a cada 15 minutos)
  setInterval(async () => {
    try {
      const rows = await dbAsync.all('SELECT `key`, value FROM settings WHERE `key` IN ("backup_auto_enabled", "backup_auto_frequency", "backup_auto_hour", "backup_auto_mode", "backup_last_run")') as any[];
      const config = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {} as any);
      
      const enabled = config.backup_auto_enabled === 'true';
      if (!enabled) return;

      const frequency = config.backup_auto_frequency || 'daily';
      const targetHour = parseInt(config.backup_auto_hour || '3', 10);
      const mode = (config.backup_auto_mode === 'incremental' ? 'incremental' : 'full') as 'full' | 'incremental';
      const lastRunStr = config.backup_last_run;

      const now = new Date();
      const currentHour = now.getHours();

      if (currentHour < targetHour) return;

      let shouldRun = false;
      const lastRun = lastRunStr ? new Date(lastRunStr) : null;

      if (!lastRun) {
        shouldRun = true;
      } else {
        const diffMs = now.getTime() - lastRun.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (frequency === 'daily') {
          const lastRunDayStr = `${lastRun.getFullYear()}-${lastRun.getMonth()}-${lastRun.getDate()}`;
          const currentDayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
          if (lastRunDayStr !== currentDayStr) {
            shouldRun = true;
          }
        } else if (frequency === 'weekly') {
          if (diffDays >= 7) {
            shouldRun = true;
          }
        } else if (frequency === 'monthly') {
          if (diffDays >= 30) {
            shouldRun = true;
          }
        }
      }

      if (shouldRun) {
        console.log(`[Cron Backup] Iniciando backup automático agendado (${frequency}, modo: ${mode})...`);
        const result = await performSystemBackup(mode, null);
        
        await dbAsync.run(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
          'backup_last_run',
          now.toISOString(),
          now.toISOString()
        );
        console.log(`[Cron Backup] Backup automático executado com sucesso: ${result.backup_key}`);
      }
    } catch (error) {
      console.error('[Cron Backup] Erro no agendamento de backup:', error);
    }
  }, 15 * 60 * 1000);

  async function ensureEmailTemplatesUpdated() {
    try {
      const templates = [
        {
          key: 'matrix_request_team_received',
          name: 'Solicitação de Matriz — Notificação Interna',
          subject: 'Nova solicitação recebida - Digital Bordados',
          variables: JSON.stringify(['request_id', 'name', 'email', 'whatsapp', 'details', 'details_html', 'date_time', 'reference_image', 'store_name']),
          body: `<div style="font-family: Arial, sans-serif; padding: 25px; background-color: #f8fafc; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
  <div style="text-align: center; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px;">
    <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Nova solicitação recebida</h2>
    <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px; font-weight: 600;">Digital Bordados — Notificação Interna</p>
  </div>
  
  <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #334155;"><strong style="color: #0f172a; display: inline-block; width: 120px;">ID:</strong> #{{request_id}}</p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #334155;"><strong style="color: #0f172a; display: inline-block; width: 120px;">Nome:</strong> {{name}}</p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #334155;"><strong style="color: #0f172a; display: inline-block; width: 120px;">E-mail:</strong> <a href="mailto:{{email}}" style="color: #2563eb; text-decoration: none; font-weight: 600;">{{email}}</a></p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #334155;"><strong style="color: #0f172a; display: inline-block; width: 120px;">WhatsApp:</strong> <a href="https://wa.me/{{whatsapp}}" style="color: #2563eb; text-decoration: none; font-weight: 600;">{{whatsapp}}</a></p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #334155;"><strong style="color: #0f172a; display: inline-block; width: 120px;">Data/Hora:</strong> {{date_time}}</p>
  </div>

  <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
    <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Dados do Formulário</h4>
    <div style="font-size: 13px; color: #334155; line-height: 1.6; font-weight: 500;">
      {{{details_html}}}
    </div>
  </div>

  {{#if reference_image}}
  <div style="text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
    <a href="{{reference_image}}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; padding: 12px 25px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
      Visualizar Referência
    </a>
  </div>
  {{/if}}
</div>`
        },
        {
          key: 'matrix_request_in_analysis',
          name: 'Solicitação de Matriz em Análise',
          subject: 'Recebemos sua solicitação - Digital Bordados',
          variables: JSON.stringify(['request_id', 'name', 'details_html', 'store_logo', 'store_name']),
          body: `<div style="font-family: Arial, sans-serif; padding: 25px; background-color: #f8fafc; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
  <div style="text-align: center; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px;">
    {{#if store_logo}}
    <img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 50px; margin-bottom: 15px;" />
    {{/if}}
    <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Recebemos sua solicitação</h2>
    <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px; font-weight: 600;">Olá, {{name}}.</p>
  </div>

  <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; line-height: 1.6;">
    <p style="margin: 0 0 15px 0; font-size: 14px; color: #334155; font-weight: 500;">
      Recebemos sua solicitação com sucesso.
    </p>
    <p style="margin: 0; font-size: 14px; color: #334155; font-weight: 500;">
      Nossa equipe irá analisar as informações enviadas e retornará em breve com os próximos passos.
    </p>
  </div>

  <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
    <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Resumo da solicitação</h4>
    <div style="font-size: 13px; color: #334155; line-height: 1.6; font-weight: 500;">
      {{{details_html}}}
    </div>
  </div>

  <div style="text-align: center; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; font-weight: 600; line-height: 1.5;">
    Atenciosamente,<br/>
    <strong style="color: #0f172a;">Equipe {{store_name}}</strong>
  </div>
</div>`
        }
      ];

      for (const t of templates) {
        await dbAsync.run(`
          INSERT INTO email_templates (\`key\`, name, subject, body, variables)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            name = VALUES(name), 
            subject = VALUES(subject), 
            body = VALUES(body), 
            variables = VALUES(variables)
        `, t.key, t.name, t.subject, t.body, t.variables);
      }
      console.log('[EmailTemplates] Templates de solicitação de orçamento atualizados com sucesso.');
    } catch (err) {
      console.error('[EmailTemplates] Erro ao atualizar templates de email:', err);
    }
  }

  ensureEmailTemplatesUpdated().catch(err => console.error('Erro na atualização de templates:', err));

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


