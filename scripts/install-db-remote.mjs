/**
 * install-db-remote.mjs
 * Instala toda a estrutura do banco de dados Monttera no servidor remoto.
 * Executa: criação de tabelas, índices, migrações e dados iniciais.
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env manualmente
const envPath = resolve(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.substring(0, eqIdx).trim();
  const val = trimmed.substring(eqIdx + 1).trim();
  process.env[key] = val;
}

const config = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: 'utf8mb4',
  multipleStatements: true,
  connectTimeout: 20000,
};

console.log(`\n🚀 Iniciando instalação do banco de dados...`);
console.log(`   Host: ${config.host}:${config.port}`);
console.log(`   Banco: ${config.database}`);
console.log(`   Usuário: ${config.user}\n`);

const conn = await mysql.createConnection(config);

let ok = 0, erros = 0;

async function exec(label, sql) {
  try {
    await conn.query(sql);
    console.log(`  ✅ ${label}`);
    ok++;
  } catch (e) {
    // Ignora erros de "já existe" (idempotente)
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_TABLE_EXISTS_ERROR' ||
        e.code === 'ER_DUP_KEY' || e.message.includes('Duplicate column') ||
        e.message.includes('already exists') || e.message.includes('Duplicate entry')) {
      console.log(`  ⏭️  ${label} (já existe, ignorado)`);
      ok++;
    } else {
      console.error(`  ❌ ${label}: ${e.message}`);
      erros++;
    }
  }
}

// ─── TABELAS PRINCIPAIS ────────────────────────────────────────────────────────

await exec('Tabela: users', `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NULL,
    role ENUM('admin','customer') NOT NULL,
    status VARCHAR(50) DEFAULT 'ativo',
    woo_user_id VARCHAR(50) NULL,
    email_verified_at DATETIME NULL,
    language VARCHAR(10) DEFAULT 'pt',
    auth_provider VARCHAR(50) NULL DEFAULT 'local',
    last_login_at DATETIME NULL,
    privacy_reaccept_required TINYINT(1) DEFAULT 0,
    anonymized_at DATETIME NULL,
    deleted_at DATETIME NULL,
    phone VARCHAR(20) NULL,
    cpf VARCHAR(14) NULL,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    date_registered DATETIME NULL,
    avatar_url TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: customers', `
  CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    phone VARCHAR(50),
    cpf VARCHAR(50),
    address TEXT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(50) NULL,
    zip VARCHAR(10) NULL,
    country VARCHAR(50) NULL,
    billing_address TEXT NULL,
    billing_city VARCHAR(100) NULL,
    billing_neighborhood VARCHAR(120) NULL,
    billing_state VARCHAR(50) NULL,
    billing_zip VARCHAR(10) NULL,
    billing_country VARCHAR(50) NULL,
    shipping_address TEXT NULL,
    shipping_city VARCHAR(100) NULL,
    shipping_neighborhood VARCHAR(120) NULL,
    shipping_state VARCHAR(50) NULL,
    shipping_zip VARCHAR(10) NULL,
    shipping_country VARCHAR(50) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_categories', `
  CREATE TABLE IF NOT EXISTS product_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    name_es VARCHAR(255) NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    slug_en VARCHAR(255) NULL,
    slug_es VARCHAR(255) NULL,
    parent_id INT NULL,
    image TEXT,
    description TEXT,
    description_en TEXT NULL,
    description_es TEXT NULL,
    icon VARCHAR(255) NULL,
    seo_title_en VARCHAR(255) NULL,
    seo_title_es VARCHAR(255) NULL,
    seo_description_en VARCHAR(255) NULL,
    seo_description_es VARCHAR(255) NULL,
    status VARCHAR(50) DEFAULT 'active',
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_tags', `
  CREATE TABLE IF NOT EXISTS product_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    name_es VARCHAR(255) NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    slug_en VARCHAR(255) NULL,
    slug_es VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: products', `
  CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    name_es VARCHAR(255) NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    slug_en VARCHAR(255) NULL,
    slug_es VARCHAR(255) NULL,
    description TEXT,
    description_en LONGTEXT NULL,
    description_es LONGTEXT NULL,
    short_description TEXT NULL,
    short_description_en TEXT NULL,
    short_description_es TEXT NULL,
    price DECIMAL(12,2) NOT NULL,
    sale_price DECIMAL(12,2) NULL,
    image TEXT,
    image_webp TEXT NULL,
    image_alt TEXT NULL,
    image_alt_en VARCHAR(255) NULL,
    image_alt_es VARCHAR(255) NULL,
    production_sheet TEXT NULL,
    category_id INT NULL,
    type VARCHAR(50) DEFAULT 'simple',
    is_virtual TINYINT(1) DEFAULT 1,
    is_downloadable TINYINT(1) DEFAULT 1,
    stitch_count INT NULL,
    colors VARCHAR(255) NULL,
    is_featured TINYINT(1) DEFAULT 0,
    is_new TINYINT(1) DEFAULT 0,
    seo_title TEXT,
    seo_title_en VARCHAR(255) NULL,
    seo_title_es VARCHAR(255) NULL,
    seo_description TEXT,
    seo_description_en VARCHAR(255) NULL,
    seo_description_es VARCHAR(255) NULL,
    seo_keywords TEXT NULL,
    canonical_url TEXT NULL,
    og_image TEXT NULL,
    noindex TINYINT(1) DEFAULT 0,
    sku VARCHAR(120) NULL,
    brand VARCHAR(120) NULL,
    model VARCHAR(120) NULL,
    availability VARCHAR(60) DEFAULT 'in_stock',
    condition_type VARCHAR(60) DEFAULT 'new',
    search_terms TEXT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_category_relations', `
  CREATE TABLE IF NOT EXISTS product_category_relations (
    product_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (product_id, category_id),
    CONSTRAINT fk_pcr_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcr_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_images', `
  CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    url TEXT NOT NULL,
    url_webp TEXT NULL,
    alt_text TEXT NULL,
    file_type VARCHAR(50) DEFAULT 'gallery',
    is_featured TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_files', `
  CREATE TABLE IF NOT EXISTS product_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_files_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: product_tag_relations', `
  CREATE TABLE IF NOT EXISTS product_tag_relations (
    product_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    CONSTRAINT fk_ptr_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_ptr_tag FOREIGN KEY (tag_id) REFERENCES product_tags(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: favorites', `
  CREATE TABLE IF NOT EXISTS favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    product_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_favorites_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: reviews', `
  CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    product_id INT NULL,
    rating INT,
    comment TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: orders', `
  CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    total DECIMAL(12,2),
    status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(100),
    payment_provider VARCHAR(50) NULL DEFAULT 'mercadopago',
    transaction_id VARCHAR(255),
    paid_at DATETIME NULL,
    language VARCHAR(10) DEFAULT 'pt',
    customer_email VARCHAR(255) NULL,
    customer_name VARCHAR(255) NULL,
    billing_address TEXT NULL,
    notes TEXT NULL,
    woo_order_id VARCHAR(50) NULL,
    order_key VARCHAR(100) NULL,
    paypal_order_id VARCHAR(255) NULL,
    paypal_capture_id VARCHAR(255) NULL,
    paypal_payer_email VARCHAR(255) NULL,
    paypal_status VARCHAR(100) NULL,
    currency VARCHAR(10) NULL DEFAULT 'BRL',
    original_total_brl DECIMAL(12,2) NULL,
    converted_total_usd DECIMAL(12,2) NULL,
    exchange_rate DECIMAL(10,4) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: order_items', `
  CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NULL,
    product_id INT NULL,
    price DECIMAL(12,2),
    quantity INT,
    product_name VARCHAR(255) NULL,
    product_slug VARCHAR(255) NULL,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: order_customer_details', `
  CREATE TABLE IF NOT EXISTS order_customer_details (
    order_id INT PRIMARY KEY,
    first_name VARCHAR(120) NULL,
    last_name VARCHAR(120) NULL,
    cpf VARCHAR(30) NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(40) NULL,
    city VARCHAR(120) NULL,
    state VARCHAR(80) NULL,
    postal_code VARCHAR(30) NULL,
    address_line VARCHAR(255) NULL,
    number VARCHAR(40) NULL,
    neighborhood VARCHAR(120) NULL,
    complement VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ocd_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: settings', `
  CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(191) PRIMARY KEY,
    value LONGTEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: email_templates', `
  CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(300) NOT NULL,
    subject_en VARCHAR(300) NULL,
    subject_es VARCHAR(300) NULL,
    body LONGTEXT NOT NULL,
    body_en LONGTEXT NULL,
    body_es LONGTEXT NULL,
    variables TEXT COMMENT 'JSON array com as variáveis disponíveis',
    active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: email_logs', `
  CREATE TABLE IF NOT EXISTS email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(300),
    template_key VARCHAR(100),
    status ENUM('sent','failed') DEFAULT 'sent',
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: password_reset_tokens', `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: email_verification_tokens', `
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: login_attempts', `
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NULL,
    ip VARCHAR(64) NULL,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    success TINYINT(1) DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: download_tokens', `
  CREATE TABLE IF NOT EXISTS download_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_item_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_download_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_download_tokens_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: download_logs', `
  CREATE TABLE IF NOT EXISTS download_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    order_id INT NULL,
    order_item_id INT NULL,
    product_id INT NULL,
    file_name VARCHAR(255) NULL,
    file_path TEXT NULL,
    file_size BIGINT NULL,
    sha256 CHAR(64) NULL,
    status ENUM('success','denied','error') DEFAULT 'success',
    error TEXT NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: webhook_logs', `
  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payload LONGTEXT,
    status VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: processed_webhooks', `
  CREATE TABLE IF NOT EXISTS processed_webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255) NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_processed_webhook_event (provider, event_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: import_logs', `
  CREATE TABLE IF NOT EXISTS import_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255),
    result TEXT,
    log LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: matrix_requests', `
  CREATE TABLE IF NOT EXISTS matrix_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50) NOT NULL,
    details TEXT,
    reference_image TEXT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: matrix_request_email_logs', `
  CREATE TABLE IF NOT EXISTS matrix_request_email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    matrix_request_id INT NULL,
    recipient_type VARCHAR(30) DEFAULT 'customer',
    to_email VARCHAR(255) NULL,
    template_key VARCHAR(100) NULL,
    status VARCHAR(30) DEFAULT 'pending',
    error TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mrel_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

// ── LGPD ──────────────────────────────────────────────────────────────────────

await exec('Tabela: lgpd_policies', `
  CREATE TABLE IF NOT EXISTS lgpd_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    policy_type VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    force_reaccept TINYINT(1) DEFAULT 0,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_lgpd_policy_type_version (policy_type, version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: lgpd_user_acceptances', `
  CREATE TABLE IF NOT EXISTS lgpd_user_acceptances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    policy_type VARCHAR(50) NOT NULL,
    policy_version VARCHAR(50) NOT NULL,
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    source VARCHAR(50) DEFAULT 'web',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lgpd_acceptance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: lgpd_consents', `
  CREATE TABLE IF NOT EXISTS lgpd_consents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    consent_key VARCHAR(100) NOT NULL,
    granted TINYINT(1) DEFAULT 0,
    legal_basis VARCHAR(100) NULL,
    purpose TEXT NULL,
    source VARCHAR(50) DEFAULT 'web',
    policy_version VARCHAR(50) NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_lgpd_user_consent (user_id, consent_key),
    CONSTRAINT fk_lgpd_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: lgpd_requests', `
  CREATE TABLE IF NOT EXISTS lgpd_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    payload LONGTEXT NULL,
    response_notes LONGTEXT NULL,
    handled_by INT NULL,
    handled_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lgpd_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: lgpd_logs', `
  CREATE TABLE IF NOT EXISTS lgpd_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    actor_user_id INT NULL,
    event_type VARCHAR(80) NOT NULL,
    action VARCHAR(120) NOT NULL,
    details_json LONGTEXT NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lgpd_logs_event_type (event_type),
    INDEX idx_lgpd_logs_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: lgpd_cookie_consents', `
  CREATE TABLE IF NOT EXISTS lgpd_cookie_consents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    consent_id VARCHAR(64) NOT NULL UNIQUE,
    necessary TINYINT(1) DEFAULT 1,
    statistics TINYINT(1) DEFAULT 0,
    marketing TINYINT(1) DEFAULT 0,
    preferences TINYINT(1) DEFAULT 0,
    consent_version VARCHAR(50) NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_lgpd_cookie_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

// ── PAGAMENTOS ────────────────────────────────────────────────────────────────

await exec('Tabela: paypal_webhook_logs', `
  CREATE TABLE IF NOT EXISTS paypal_webhook_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(255) NULL,
    event_type VARCHAR(255) NULL,
    resource_id VARCHAR(255) NULL,
    payload_json LONGTEXT NULL,
    verification_status VARCHAR(50) NULL DEFAULT 'unverified',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: payment_logs', `
  CREATE TABLE IF NOT EXISTS payment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NULL,
    order_id INT NULL,
    external_id VARCHAR(255) NULL,
    status VARCHAR(100) NULL,
    message TEXT NULL,
    payload_json LONGTEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: mercadopago_product_sync_logs', `
  CREATE TABLE IF NOT EXISTS mercadopago_product_sync_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    product_name VARCHAR(255) NULL,
    sku VARCHAR(255) NULL,
    status VARCHAR(50) DEFAULT 'pending',
    message TEXT NULL,
    payload_json LONGTEXT NULL,
    synced_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mp_sync_product (product_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

// ── SISTEMA ───────────────────────────────────────────────────────────────────

await exec('Tabela: system_backups', `
  CREATE TABLE IF NOT EXISTS system_backups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    backup_key VARCHAR(191) NOT NULL UNIQUE,
    mode VARCHAR(30) DEFAULT 'full',
    status VARCHAR(30) DEFAULT 'completed',
    archive_path TEXT NULL,
    snapshot_path TEXT NULL,
    size_bytes BIGINT DEFAULT 0,
    integrity_ok TINYINT(1) DEFAULT 1,
    notes TEXT NULL,
    created_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: api_rate_limits', `
  CREATE TABLE IF NOT EXISTS api_rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope VARCHAR(120) NOT NULL,
    rate_key VARCHAR(255) NOT NULL,
    window_start DATETIME NOT NULL,
    hits INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_rate_scope_key_window (scope, rate_key, window_start),
    INDEX idx_rate_scope_window (scope, window_start)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: site_visits', `
  CREATE TABLE IF NOT EXISTS site_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(512) NOT NULL,
    full_url TEXT NOT NULL,
    page_title VARCHAR(255) NULL,
    referrer VARCHAR(512) NULL,
    device_type VARCHAR(50) NOT NULL,
    browser VARCHAR(100) NULL,
    os VARCHAR(100) NULL,
    ip_hash VARCHAR(64) NOT NULL,
    visitor_id VARCHAR(64) NOT NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visits_created_at (created_at),
    INDEX idx_visits_visitor_id (visitor_id),
    INDEX idx_visits_path (path(255))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: admin_mfa_challenges', `
  CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_mfa_user_expires (user_id, expires_at),
    CONSTRAINT fk_admin_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: user_social_accounts', `
  CREATE TABLE IF NOT EXISTS user_social_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255) NULL,
    provider_avatar TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_social_provider_user (provider, provider_user_id),
    CONSTRAINT fk_social_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

// ── INTERNACIONALIZAÇÃO (blog e FAQs) ─────────────────────────────────────────

await exec('Tabela: faqs', `
  CREATE TABLE IF NOT EXISTS faqs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_pt TEXT NOT NULL,
    question_en TEXT NULL,
    question_es TEXT NULL,
    answer_pt TEXT NOT NULL,
    answer_en TEXT NULL,
    answer_es TEXT NULL,
    display_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await exec('Tabela: blog_posts', `
  CREATE TABLE IF NOT EXISTS blog_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title_pt VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NULL,
    title_es VARCHAR(255) NULL,
    slug_pt VARCHAR(255) NOT NULL,
    slug_en VARCHAR(255) NULL,
    slug_es VARCHAR(255) NULL,
    content_pt LONGTEXT NOT NULL,
    content_en LONGTEXT NULL,
    content_es LONGTEXT NULL,
    summary_pt TEXT NULL,
    summary_en TEXT NULL,
    summary_es TEXT NULL,
    image_url VARCHAR(512) NULL,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_blog_slug_pt (slug_pt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

// ─── ÍNDICES ──────────────────────────────────────────────────────────────────

const indexes = [
  ['products', 'idx_products_slug', 'CREATE INDEX idx_products_slug ON products(slug)'],
  ['products', 'idx_products_slug_en', 'CREATE INDEX idx_products_slug_en ON products(slug_en(191))'],
  ['products', 'idx_products_slug_es', 'CREATE INDEX idx_products_slug_es ON products(slug_es(191))'],
  ['products', 'idx_products_category', 'CREATE INDEX idx_products_category ON products(category_id)'],
  ['product_categories', 'idx_product_categories_slug', 'CREATE INDEX idx_product_categories_slug ON product_categories(slug)'],
  ['orders', 'idx_orders_user', 'CREATE INDEX idx_orders_user ON orders(user_id)'],
  ['order_items', 'idx_order_items_order', 'CREATE INDEX idx_order_items_order ON order_items(order_id)'],
  ['favorites', 'idx_favorites_user_product', 'CREATE UNIQUE INDEX idx_favorites_user_product ON favorites(user_id, product_id)'],
  ['email_verification_tokens', 'idx_email_verification_user', 'CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id)'],
  ['email_verification_tokens', 'idx_email_verification_expires', 'CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at)'],
  ['login_attempts', 'idx_login_attempts_email_time', 'CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempted_at)'],
  ['login_attempts', 'idx_login_attempts_ip_time', 'CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip, attempted_at)'],
  ['download_tokens', 'idx_download_tokens_user_item', 'CREATE INDEX idx_download_tokens_user_item ON download_tokens(user_id, order_item_id)'],
  ['download_tokens', 'idx_download_tokens_expires', 'CREATE INDEX idx_download_tokens_expires ON download_tokens(expires_at)'],
  ['download_logs', 'idx_download_logs_user_date', 'CREATE INDEX idx_download_logs_user_date ON download_logs(user_id, created_at)'],
  ['download_logs', 'idx_download_logs_order_date', 'CREATE INDEX idx_download_logs_order_date ON download_logs(order_id, created_at)'],
  ['download_logs', 'idx_download_logs_status_date', 'CREATE INDEX idx_download_logs_status_date ON download_logs(status, created_at)'],
  ['lgpd_requests', 'idx_lgpd_requests_user', 'CREATE INDEX idx_lgpd_requests_user ON lgpd_requests(user_id, created_at)'],
  ['lgpd_requests', 'idx_lgpd_requests_status', 'CREATE INDEX idx_lgpd_requests_status ON lgpd_requests(status, created_at)'],
  ['lgpd_consents', 'idx_lgpd_consents_key', 'CREATE INDEX idx_lgpd_consents_key ON lgpd_consents(consent_key, updated_at)'],
  ['lgpd_user_acceptances', 'idx_lgpd_acceptances_user', 'CREATE INDEX idx_lgpd_acceptances_user ON lgpd_user_acceptances(user_id, accepted_at)'],
  ['user_social_accounts', 'idx_social_accounts_user', 'CREATE INDEX idx_social_accounts_user ON user_social_accounts(user_id)'],
];

console.log('\n📊 Criando índices...');
for (const [table, name, ddl] of indexes) {
  const [rows] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [config.database, table, name]
  );
  if (rows.length === 0) {
    await exec(`Índice: ${name}`, ddl);
  } else {
    console.log(`  ⏭️  Índice: ${name} (já existe)`);
  }
}

// ─── TEMPLATES DE EMAIL ───────────────────────────────────────────────────────

console.log('\n📧 Inserindo templates de e-mail padrão...');
const templates = [
  { key: 'user_welcome', name: 'Novo Usuário Cadastrado', subject: 'Bem-vindo(a) à {{store_name}}!', variables: '["name","email","store_name","login_url"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Olá, {{name}}!</h2><p>Bem-vindo(a) à <strong>{{store_name}}</strong>!</p><p><a href="{{login_url}}" style="display:inline-block;padding:12px 25px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:5px">Acessar Minha Conta</a></p></div>' },
  { key: 'email_verification', name: 'Confirmação de E-mail', subject: 'Confirme seu e-mail para ativar sua conta - {{store_name}}', variables: '["name","email","verify_url","expires_in","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Confirme seu e-mail</h2><p>Olá, {{name}}!</p><p><a href="{{verify_url}}" style="display:inline-block;padding:12px 25px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:5px">Confirmar E-mail</a></p><p style="font-size:12px;color:#666">Este link expira em {{expires_in}} horas.</p></div>' },
  { key: 'password_reset', name: 'Recuperação de Senha', subject: 'Redefinição de senha — {{store_name}}', variables: '["name","reset_url","store_name","expires_in"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Recuperação de Senha</h2><p>Olá, {{name}}!</p><p><a href="{{reset_url}}" style="display:inline-block;padding:12px 25px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:5px">Redefinir Minha Senha</a></p><p style="font-size:12px;color:#666">Este link expira em {{expires_in}} horas.</p></div>' },
  { key: 'password_changed', name: 'Senha Alterada com Sucesso', subject: 'Sua senha foi alterada — {{store_name}}', variables: '["name","store_name","login_url"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Senha Atualizada</h2><p>Olá, {{name}}! A senha da sua conta foi alterada com sucesso.</p></div>' },
  { key: 'order_created', name: 'Pedido Realizado com Sucesso', subject: 'Pedido #{{order_id}} recebido — {{store_name}}', variables: '["name","order_id","order_total","items","payment_method","account_url","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Pedido Recebido!</h2><p>Olá, {{name}}! Recebemos seu pedido <strong>#{{order_id}}</strong>.</p><p>Total: {{order_total}}</p><p><a href="{{account_url}}" style="display:inline-block;padding:12px 25px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:5px">Acompanhar Pedido</a></p></div>' },
  { key: 'order_paid', name: 'Pagamento Confirmado / Downloads Liberados', subject: '✅ Pagamento confirmado! — {{store_name}}', variables: '["name","order_id","order_total","items","downloads_url","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Pagamento Confirmado!</h2><p>Olá, {{name}}! O pagamento do pedido <strong>#{{order_id}}</strong> foi aprovado.</p><p><a href="{{downloads_url}}" style="display:inline-block;padding:12px 25px;background:#10b981;color:#fff;text-decoration:none;border-radius:5px">Acessar Meus Downloads</a></p></div>' },
  { key: 'order_cancelled', name: 'Pedido Cancelado', subject: 'Pedido #{{order_id}} cancelado — {{store_name}}', variables: '["name","order_id","order_total","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Pedido Cancelado</h2><p>Olá, {{name}}. Seu pedido <strong>#{{order_id}}</strong> foi cancelado.</p></div>' },
  { key: 'payment_failed', name: 'Pagamento Recusado', subject: 'Pagamento não aprovado — tente novamente', variables: '["name","order_id","retry_url","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Problema no Pagamento</h2><p>Olá, {{name}}. O pagamento do pedido <strong>#{{order_id}}</strong> não foi aprovado.</p><p><a href="{{retry_url}}" style="display:inline-block;padding:12px 25px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:5px">Tentar Novamente</a></p></div>' },
  { key: 'downloads_available', name: 'Downloads Disponíveis', subject: 'Seus arquivos estão disponíveis para download', variables: '["name","order_id","items","downloads_url","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Downloads Liberados!</h2><p>Olá, {{name}}! Os arquivos do pedido <strong>#{{order_id}}</strong> estão disponíveis.</p><p><a href="{{downloads_url}}" style="display:inline-block;padding:12px 25px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:5px">Acessar Meus Downloads</a></p></div>' },
  { key: 'matrix_request_submitted', name: 'Solicitação de Matriz Enviada', subject: 'Recebemos sua solicitação de matriz - {{store_name}}', variables: '["name","whatsapp","details","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Solicitação enviada!</h2><p>Olá, <strong>{{name}}</strong>. Recebemos sua solicitação de matriz personalizada e nossa equipe vai analisar em breve.</p></div>' },
  { key: 'matrix_request_team_received', name: 'Solicitação de Matriz - Interno', subject: 'Nova solicitação de matriz #{{request_id}}', variables: '["request_id","name","email","whatsapp","details","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Nova solicitação de matriz</h2><p><strong>Cliente:</strong> {{name}}</p><p><strong>E-mail:</strong> {{email}}</p><p><strong>WhatsApp:</strong> {{whatsapp}}</p></div>' },
  { key: 'lgpd_consent_confirmation', name: 'LGPD - Confirmação de Consentimento', subject: 'Confirmação de consentimento - {{store_name}}', variables: '["name","consent_key","consent_status","store_name"]', body: '<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2>Consentimento atualizado</h2><p>Olá, {{name}}. Registramos sua preferência de consentimento para <strong>{{consent_key}}</strong>.</p></div>' },
];

for (const t of templates) {
  await exec(`Template: ${t.key}`, `
    INSERT IGNORE INTO email_templates (\`key\`, name, subject, body, variables)
    VALUES (${conn.escape(t.key)}, ${conn.escape(t.name)}, ${conn.escape(t.subject)}, ${conn.escape(t.body)}, ${conn.escape(t.variables)})
  `);
}

// ─── VERIFICAÇÃO FINAL ────────────────────────────────────────────────────────

console.log('\n🔍 Verificando tabelas criadas...');
const [tables] = await conn.query(`SHOW TABLES`);
const tableNames = tables.map(r => Object.values(r)[0]);
console.log(`\n   Total de tabelas no banco: ${tableNames.length}`);
tableNames.forEach(t => console.log(`   📋 ${t}`));

await conn.end();

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Instalação concluída!`);
console.log(`   Operações bem-sucedidas: ${ok}`);
if (erros > 0) console.log(`   ⚠️  Erros não-críticos: ${erros}`);
console.log(`${'─'.repeat(50)}\n`);
