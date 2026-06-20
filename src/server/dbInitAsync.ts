import dbAsync from './dbAsync';

export async function initDb() {
  // Teste de integridade de inicialização
  await dbAsync.query('SELECT 1');

  // Garante a existência da tabela system_backups
  await dbAsync.query(`
    CREATE TABLE IF NOT EXISTS system_backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      backup_key VARCHAR(255) NOT NULL UNIQUE,
      mode VARCHAR(50) NOT NULL DEFAULT 'full',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      archive_path VARCHAR(512) NULL,
      snapshot_path VARCHAR(512) NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      integrity_ok TINYINT(1) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Garante a existência da tabela api_rate_limits
  await dbAsync.query(`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scope VARCHAR(100) NOT NULL,
      rate_key VARCHAR(255) NOT NULL,
      window_start TIMESTAMP NOT NULL,
      hits INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rate_limit (scope, rate_key, window_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Garante a existência da tabela site_visits para analytics
  await dbAsync.query(`
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

  // ── Social Login ──────────────────────────────────────────────────────────────
  await dbAsync.query(`
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

  // Tornar password nullable para usuários sociais
  try {
    await dbAsync.query(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL`);
  } catch (_) { /* já é nullable */ }

  // Campos de provider e último login
  await dbAsync.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) NULL DEFAULT 'local'`);
  await dbAsync.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL`);

  // Adicionar coluna icon em product_categories se não existir
  try {
    await dbAsync.query(`ALTER TABLE product_categories ADD COLUMN icon VARCHAR(255) NULL`);
  } catch (_) {
    // Silencia se a coluna já existir ou a operação falhar
  }

  // Adicionar coluna image_webp em products se não existir
  try {
    await dbAsync.query(`ALTER TABLE products ADD COLUMN image_webp TEXT NULL AFTER image`);
  } catch (_) {}

  // Adicionar coluna url_webp em product_images se não existir
  try {
    await dbAsync.query(`ALTER TABLE product_images ADD COLUMN url_webp TEXT NULL AFTER url`);
  } catch (_) {}
}


