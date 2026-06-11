import MySql from 'sync-mysql2';
import 'dotenv/config';

type QueryRows = Record<string, any>[];
type QueryWriteResult = { affectedRows?: number; changedRows?: number; insertId?: number };

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'digitalbordados_novo',
  charset: 'utf8mb4',
};

const connection = new MySql(dbConfig);
let disposed = false;

function disposeConnection() {
  if (disposed) return;
  disposed = true;
  try {
    connection.dispose();
  } catch (error) {
    console.error('[db] failed to dispose sync-mysql2 connection:', error);
  }
}

function registerShutdownHandlers() {
  const handleSignal = (signal: NodeJS.Signals) => {
    try {
      disposeConnection();
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('beforeExit', () => disposeConnection());
  process.once('exit', () => disposeConnection());
  process.once('uncaughtException', (error) => {
    console.error('[db] uncaughtException:', error);
    disposeConnection();
    process.exit(1);
  });
  process.once('unhandledRejection', (reason) => {
    console.error('[db] unhandledRejection:', reason);
    disposeConnection();
    process.exit(1);
  });
}

registerShutdownHandlers();

function query(sql: string, ...params: any[]) {
  return connection.query(sql, params);
}

function all<T = any>(sql: string, ...params: any[]): T[] {
  const result = query(sql, ...params);
  return Array.isArray(result) ? (result as T[]) : [];
}

function get<T = any>(sql: string, ...params: any[]): T | undefined {
  const rows = all<T>(sql, ...params);
  return rows[0];
}

function run(sql: string, ...params: any[]) {
  const result = query(sql, ...params) as QueryRows | QueryWriteResult;
  if (Array.isArray(result)) {
    return { changes: 0, lastInsertRowid: 0 };
  }

  return {
    changes: result.affectedRows ?? result.changedRows ?? 0,
    lastInsertRowid: result.insertId ?? 0,
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

function tableExists(table: string) {
  const row = get(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    dbConfig.database,
    table,
  ) as any;
  return !!row;
}

function columnExists(table: string, column: string) {
  const row = get(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    dbConfig.database,
    table,
    column,
  ) as any;
  return !!row;
}

function ensureColumn(table: string, column: string, definition: string) {
  if (!columnExists(table, column)) {
    query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

function createIndexIfNotExists(table: string, indexName: string, ddl: string) {
  const existingIndex = get(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    dbConfig.database,
    table,
    indexName,
  ) as any;

  if (!existingIndex) {
    query(ddl);
  }
}

function migrateLegacyTaxonomyTables() {
  const hasLegacyCategories = tableExists('categories');
  const hasLegacyTags = tableExists('tags');

  const hasProductCategories = tableExists('product_categories');
  const hasProductTags = tableExists('product_tags');

  if (hasProductCategories && columnExists('product_categories', 'product_id') && !columnExists('product_categories', 'name')) {
    if (!tableExists('product_category_relations')) {
      query('RENAME TABLE product_categories TO product_category_relations');
    }
  }

  if (hasProductTags && columnExists('product_tags', 'product_id') && !columnExists('product_tags', 'name')) {
    if (!tableExists('product_tag_relations')) {
      query('RENAME TABLE product_tags TO product_tag_relations');
    }
  }

  if (hasLegacyCategories && !tableExists('product_categories')) {
    query('RENAME TABLE categories TO product_categories');
  }

  if (hasLegacyTags && !tableExists('product_tags')) {
    query('RENAME TABLE tags TO product_tags');
  }

  if (tableExists('categories') && tableExists('product_categories')) {
    query(`
      INSERT IGNORE INTO product_categories (id, name, slug, parent_id, image, description, status, sort_order, created_at)
      SELECT id, name, slug, parent_id, image, description, status, sort_order, created_at
      FROM categories
    `);
    query('DROP TABLE categories');
  }

  if (tableExists('tags') && tableExists('product_tags')) {
    query(`
      INSERT IGNORE INTO product_tags (id, name, slug, created_at)
      SELECT id, name, slug, created_at
      FROM tags
    `);
    query('DROP TABLE tags');
  }
}

export function initDb() {
  query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin','customer') NOT NULL,
      status VARCHAR(50) DEFAULT 'ativo',
      woo_user_id VARCHAR(50) NULL,
      email_verified_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone VARCHAR(50),
      cpf VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  migrateLegacyTaxonomyTables();

  query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      parent_id INT NULL,
      image TEXT,
      description TEXT,
      icon VARCHAR(255) NULL,
      status VARCHAR(50) DEFAULT 'active',
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS product_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      short_description TEXT,
      price DECIMAL(12,2) NOT NULL,
      sale_price DECIMAL(12,2) NULL,
      image TEXT,
      image_alt TEXT NULL,
      production_sheet TEXT,
      category_id INT NULL,
      type VARCHAR(50) DEFAULT 'simple',
      is_virtual TINYINT(1) DEFAULT 1,
      is_downloadable TINYINT(1) DEFAULT 1,
      stitch_count INT NULL,
      colors VARCHAR(255) NULL,
      is_featured TINYINT(1) DEFAULT 0,
      is_new TINYINT(1) DEFAULT 0,
      seo_title TEXT,
      seo_description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS product_category_relations (
      product_id INT NOT NULL,
      category_id INT NOT NULL,
      PRIMARY KEY (product_id, category_id),
      CONSTRAINT fk_product_category_relations_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_product_category_relations_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      url TEXT NOT NULL,
      alt_text TEXT NULL,
      file_type VARCHAR(50) DEFAULT 'gallery',
      is_featured TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS product_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_files_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS product_tag_relations (
      product_id INT NOT NULL,
      tag_id INT NOT NULL,
      PRIMARY KEY (product_id, tag_id),
      CONSTRAINT fk_product_tag_relations_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_product_tag_relations_tag FOREIGN KEY (tag_id) REFERENCES product_tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      product_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_favorites_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      total DECIMAL(12,2),
      status VARCHAR(50) DEFAULT 'pending',
      payment_method VARCHAR(100),
      transaction_id VARCHAR(255),
      paid_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NULL,
      product_id INT NULL,
      price DECIMAL(12,2),
      quantity INT,
      CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payload LONGTEXT,
      status VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS import_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255),
      result TEXT,
      log LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(191) PRIMARY KEY,
      value LONGTEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      subject VARCHAR(300) NOT NULL,
      body LONGTEXT NOT NULL,
      variables TEXT COMMENT 'JSON array com as variÃ¡veis disponÃ­veis',
      active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      to_email VARCHAR(255) NOT NULL,
      subject VARCHAR(300),
      template_key VARCHAR(100),
      status ENUM('sent','failed') DEFAULT 'sent',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
      CONSTRAINT fk_order_customer_details_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NULL,
      ip VARCHAR(64) NULL,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      success TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      event_id VARCHAR(255) NOT NULL,
      resource_id VARCHAR(255) NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_processed_webhook_event (provider, event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS matrix_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      whatsapp VARCHAR(50) NOT NULL,
      details TEXT,
      reference_image TEXT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const defaultTemplates = [
    {
      key: 'user_welcome',
      name: 'Novo Usuário Cadastrado',
      subject: 'Bem-vindo(a) à {{store_name}}!',
      variables: JSON.stringify(['name', 'email', 'store_name', 'login_url']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Olá, {{name}}!</h2><p>Bem-vindo(a) à <strong>{{store_name}}</strong>. Estamos muito felizes em ter você conosco.</p><p>Para acessar sua conta, clique no botão abaixo:</p><p style="text-align: center; margin: 30px 0;"><a href="{{login_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Minha Conta</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'email_verification',
      name: 'Confirmação de E-mail',
      subject: 'Confirme seu e-mail para ativar sua conta - {{store_name}}',
      variables: JSON.stringify(['name', 'email', 'verify_url', 'expires_in', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Confirme seu e-mail</h2><p>Olá, {{name}}!</p><p>Para liberar compras, downloads e acesso completo da sua conta, confirme seu e-mail clicando no botão abaixo.</p><p style="text-align: center; margin: 30px 0;"><a href="{{verify_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Confirmar E-mail</a></p><p style="font-size: 12px; color: #666;">Este link expira em {{expires_in}} horas.</p><p>Se você não solicitou este cadastro, ignore este e-mail.</p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'password_reset',
      name: 'Lembrete/Recuperação de Senha',
      subject: 'Redefinição de senha — {{store_name}}',
      variables: JSON.stringify(['name', 'reset_url', 'store_name', 'expires_in']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Recuperação de Senha</h2><p>Olá, {{name}}!</p><p>Recebemos uma solicitação para redefinir a senha da sua conta na <strong>{{store_name}}</strong>. Se você não fez essa solicitação, pode ignorar este e-mail.</p><p>Para criar uma nova senha, clique no botão abaixo:</p><p style="text-align: center; margin: 30px 0;"><a href="{{reset_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Redefinir Minha Senha</a></p><p style="font-size: 12px; color: #666;">Este link expira em {{expires_in}} horas.</p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'password_changed',
      name: 'Senha Alterada com Sucesso',
      subject: 'Sua senha foi alterada — {{store_name}}',
      variables: JSON.stringify(['name', 'store_name', 'login_url']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Senha Atualizada</h2><p>Olá, {{name}}!</p><p>A senha da sua conta na <strong>{{store_name}}</strong> foi alterada com sucesso.</p><p>Se não foi você quem realizou esta alteração, por favor, entre em contato conosco imediatamente.</p><p style="text-align: center; margin: 30px 0;"><a href="{{login_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Fazer Login</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'order_created',
      name: 'Pedido Realizado com Sucesso',
      subject: 'Pedido #{{order_id}} recebido — {{store_name}}',
      variables: JSON.stringify(['name', 'order_id', 'order_total', 'order_status', 'items', 'payment_method', 'account_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Pedido Recebido!</h2><p>Olá, {{name}}!</p><p>Recebemos o seu pedido <strong>#{{order_id}}</strong>. Obrigado por comprar na <strong>{{store_name}}</strong>!</p><p>Forma de pagamento: <strong>{{payment_method}}</strong></p><h3>Resumo do Pedido</h3><div style="background: #f9fafb; padding: 15px; border-radius: 5px;">{{{items}}}</div><p style="text-align: right; font-size: 18px; font-weight: bold; margin-top: 15px;">Total: {{order_total}}</p><p style="text-align: center; margin: 30px 0;"><a href="{{account_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Acompanhar Pedido</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'order_paid',
      name: 'Pagamento Confirmado / Downloads Liberados',
      subject: '✅ Pagamento confirmado! Seus arquivos estão prontos — {{store_name}}',
      variables: JSON.stringify(['name', 'order_id', 'order_total', 'items', 'downloads_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Pagamento Confirmado!</h2><p>Olá, {{name}}!</p><p>Temos boas notícias: o pagamento do seu pedido <strong>#{{order_id}}</strong> foi aprovado.</p><p>Seus arquivos já estão liberados e prontos para download!</p><p style="text-align: center; margin: 30px 0;"><a href="{{downloads_url}}" style="display: inline-block; padding: 12px 25px; background: #10b981; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Meus Downloads</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'order_cancelled',
      name: 'Pedido Cancelado',
      subject: 'Pedido #{{order_id}} cancelado — {{store_name}}',
      variables: JSON.stringify(['name', 'order_id', 'order_total', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Pedido Cancelado</h2><p>Olá, {{name}}.</p><p>Gostaríamos de informar que o seu pedido <strong>#{{order_id}}</strong> na <strong>{{store_name}}</strong> foi cancelado.</p><p>Se você não solicitou este cancelamento ou acha que houve algum erro com o pagamento, entre em contato conosco ou realize uma nova compra em nosso site.</p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'payment_failed',
      name: 'Pagamento Recusado',
      subject: 'Pagamento não aprovado — tente novamente',
      variables: JSON.stringify(['name', 'order_id', 'order_total', 'retry_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Problema no Pagamento</h2><p>Olá, {{name}}.</p><p>Infelizmente o pagamento do seu pedido <strong>#{{order_id}}</strong> não foi aprovado pela operadora do cartão ou instituição financeira.</p><p>Para garantir seus itens, por favor tente realizar o pagamento novamente usando outro método ou cartão.</p><p style="text-align: center; margin: 30px 0;"><a href="{{retry_url}}" style="display: inline-block; padding: 12px 25px; background: #f59e0b; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Tentar Novamente</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'payment_pending_pix',
      name: 'Lembrete de PIX Pendente',
      subject: '⏳ Seu PIX ainda não foi pago — Pedido #{{order_id}}',
      variables: JSON.stringify(['name', 'order_id', 'order_total', 'pix_code', 'expires_at', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Aguardando Pagamento</h2><p>Olá, {{name}}!</p><p>Notamos que você gerou um pedido via PIX (Pedido <strong>#{{order_id}}</strong>), mas o pagamento ainda não foi identificado.</p><p>Lembre-se que o código PIX expira em: <strong>{{expires_at}}</strong>.</p><div style="background: #f9fafb; padding: 15px; border-radius: 5px; word-break: break-all; font-family: monospace; text-align: center; margin: 20px 0;">{{pix_code}}</div><p>Caso já tenha efetuado o pagamento, desconsidere este e-mail. A confirmação deve ocorrer em instantes.</p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'downloads_available',
      name: 'Downloads Disponíveis na Conta',
      subject: 'Seus arquivos estão disponíveis para download',
      variables: JSON.stringify(['name', 'order_id', 'items', 'downloads_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Downloads Liberados!</h2><p>Olá, {{name}}!</p><p>Os arquivos do seu pedido <strong>#{{order_id}}</strong> já estão disponíveis na sua área de cliente.</p><h3>Arquivos Disponíveis:</h3><div style="background: #f9fafb; padding: 15px; border-radius: 5px;">{{{items}}}</div><p style="text-align: center; margin: 30px 0;"><a href="{{downloads_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Meus Downloads</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'password_migration',
      name: 'Aviso de Migração de Senha',
      subject: 'Sua conta foi migrada — acesse com sua nova senha',
      variables: JSON.stringify(['name', 'temp_password', 'login_url', 'change_password_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Conta Atualizada</h2><p>Olá, {{name}}!</p><p>A <strong>{{store_name}}</strong> está de cara nova! Migramos para um novo sistema mais rápido e seguro para você.</p><p>Por questões de segurança, geramos uma senha provisória para o seu primeiro acesso:</p><p style="font-size: 20px; text-align: center; font-weight: bold; margin: 20px 0; padding: 10px; background: #f9fafb; border-radius: 5px;">{{temp_password}}</p><p>Recomendamos que você altere esta senha assim que acessar a sua conta.</p><p style="text-align: center; margin: 30px 0;"><a href="{{login_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Minha Conta</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'first_purchase',
      name: 'Pós-primeira Compra',
      subject: 'Obrigado pela sua primeira compra! 🎉',
      variables: JSON.stringify(['name', 'store_name', 'downloads_url', 'account_url']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Que alegria ter você aqui! 🎉</h2><p>Olá, {{name}}!</p><p>Vimos que você acabou de realizar a sua primeira compra na <strong>{{store_name}}</strong>. Muito obrigado por confiar em nosso trabalho!</p><p>Na sua <a href="{{account_url}}">conta</a>, você pode acompanhar seus pedidos e baixar os arquivos adquiridos a qualquer momento.</p><p style="text-align: center; margin: 30px 0;"><a href="{{downloads_url}}" style="display: inline-block; padding: 12px 25px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">Ir Para Meus Downloads</a></p><p>Atenciosamente,<br>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'matrix_request_submitted',
      name: 'Solicitação de Matriz Enviada com Sucesso',
      subject: 'Recebemos sua solicitação de matriz - {{store_name}}',
      variables: JSON.stringify(['name', 'whatsapp', 'details', 'reference_image', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Solicitação enviada com sucesso!</h2><p>Olá, <strong>{{name}}</strong>.</p><p>Recebemos sua solicitação de matriz personalizada e nosso time vai analisar os detalhes.</p><p><strong>WhatsApp informado:</strong> {{whatsapp}}</p>{{#if details}}<p><strong>Informações enviadas:</strong><br/>{{details}}</p>{{/if}}{{#if reference_image}}<p><strong>Imagem de referência:</strong> <a href="{{reference_image}}" target="_blank" rel="noopener noreferrer">abrir anexo</a></p>{{/if}}<p>Entraremos em contato em breve para confirmar o escopo e iniciar o desenvolvimento.</p><p>Atenciosamente,<br/>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'matrix_request_team_received',
      name: 'Solicitação de Matriz - Notificação Interna',
      subject: 'Nova solicitação de matriz #{{request_id}} - {{store_name}}',
      variables: JSON.stringify(['request_id', 'name', 'email', 'whatsapp', 'details', 'reference_image', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><h2>Nova solicitação de matriz recebida</h2><p><strong>ID:</strong> #{{request_id}}</p><p><strong>Cliente:</strong> {{name}}</p><p><strong>E-mail:</strong> {{email}}</p><p><strong>WhatsApp:</strong> {{whatsapp}}</p>{{#if details}}<p><strong>Detalhes:</strong><br/>{{details}}</p>{{/if}}{{#if reference_image}}<p><strong>Imagem de referência:</strong> <a href="{{reference_image}}" target="_blank" rel="noopener noreferrer">abrir anexo</a></p>{{/if}}</div>'
    },
    {
      key: 'matrix_request_in_analysis',
      name: 'Solicitação de Matriz em Análise',
      subject: 'Seu pedido de matriz já está em análise - {{store_name}}',
      variables: JSON.stringify(['request_id', 'name', 'email', 'whatsapp', 'details', 'reference_image', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Recebemos seu pedido, {{name}}!</h2><p>Seu pedido de matriz <strong>#{{request_id}}</strong> já está em análise pela nossa equipe.</p><p>Assim que concluirmos a avaliação, entraremos em contato no e-mail <strong>{{email}}</strong> e no WhatsApp <strong>{{whatsapp}}</strong>.</p>{{#if details}}<p><strong>Resumo enviado:</strong><br/>{{details}}</p>{{/if}}<p>Obrigado por confiar na {{store_name}}.</p></div>'
    },
    {
      key: 'lgpd_consent_confirmation',
      name: 'LGPD - Confirmação de Consentimento',
      subject: 'Confirmação de consentimento de dados - {{store_name}}',
      variables: JSON.stringify(['name', 'consent_key', 'consent_status', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Consentimento atualizado</h2><p>Olá, {{name}}.</p><p>Registramos sua preferência de consentimento para <strong>{{consent_key}}</strong> como <strong>{{consent_status}}</strong>.</p><p>Se você não reconhece esta alteração, responda este e-mail.</p><p>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'lgpd_policy_updated',
      name: 'LGPD - Política Atualizada',
      subject: 'Atualizamos nossas políticas - {{store_name}}',
      variables: JSON.stringify(['name', 'policy_type', 'policy_version', 'policy_url', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Atualização de política</h2><p>Olá, {{name}}.</p><p>Publicamos uma nova versão de <strong>{{policy_type}}</strong> (versão {{policy_version}}).</p><p>Acesse aqui: <a href="{{policy_url}}">{{policy_url}}</a></p><p>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'lgpd_request_received',
      name: 'LGPD - Solicitação Recebida',
      subject: 'Recebemos sua solicitação LGPD - {{store_name}}',
      variables: JSON.stringify(['name', 'request_type', 'request_id', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Solicitação LGPD recebida</h2><p>Olá, {{name}}.</p><p>Recebemos sua solicitação <strong>{{request_type}}</strong> sob o protocolo <strong>#{{request_id}}</strong>.</p><p>Nosso time vai analisar e responder o mais rápido possível.</p><p>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'lgpd_export_ready',
      name: 'LGPD - Exportação Concluída',
      subject: 'Seus dados estão prontos para download - {{store_name}}',
      variables: JSON.stringify(['name', 'download_url', 'expires_in', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Exportação concluída</h2><p>Olá, {{name}}.</p><p>Sua exportação de dados pessoais foi concluída. Use o link abaixo:</p><p><a href="{{download_url}}">{{download_url}}</a></p><p>Validade: {{expires_in}} horas.</p><p>Equipe {{store_name}}</p></div>'
    },
    {
      key: 'lgpd_deletion_completed',
      name: 'LGPD - Exclusão Concluída',
      subject: 'Sua solicitação de exclusão foi processada - {{store_name}}',
      variables: JSON.stringify(['name', 'store_name']),
      body: '<div style="font-family: Arial, sans-serif; padding: 20px; background: #fff; max-width: 600px; margin: 0 auto; color: #333;"><div style="text-align: center; margin-bottom: 20px;"><img src="{{store_logo}}" alt="{{store_name}}" style="max-height: 80px;" /></div><h2>Exclusão concluída</h2><p>Olá, {{name}}.</p><p>Concluímos o processamento da sua solicitação de exclusão/anonimização de dados pessoais, conforme a LGPD.</p><p>Equipe {{store_name}}</p></div>'
    }
  ];

  for (const t of defaultTemplates) {
    query(`
      INSERT IGNORE INTO email_templates (\`key\`, name, subject, body, variables)
      VALUES (?, ?, ?, ?, ?)
    `, t.key, t.name, t.subject, t.body, t.variables);
  }

  // Limpar acentuação corrompida de templates de e-mail existentes no banco de dados
  for (const t of defaultTemplates) {
    const row = get('SELECT name, subject, body FROM email_templates WHERE `key` = ?', t.key) as any;
    if (row) {
      const hasCorruptedChars = (str: string) => /Ã[¡à¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]|â€”|âœ…|ðŸŽ‰|ÃƒÂ/.test(str || '');
      if (hasCorruptedChars(row.name) || hasCorruptedChars(row.subject) || hasCorruptedChars(row.body)) {
        console.log(`[EmailTemplates] Corrigindo acentuação corrompida no template existente: ${t.key}`);
        query(
          'UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE `key` = ?',
          t.name, t.subject, t.body, t.key
        );
      }
    }
  }

  createIndexIfNotExists('products', 'idx_products_slug', 'CREATE INDEX idx_products_slug ON products(slug)');
  createIndexIfNotExists('products', 'idx_products_category', 'CREATE INDEX idx_products_category ON products(category_id)');
  createIndexIfNotExists('product_categories', 'idx_product_categories_slug', 'CREATE INDEX idx_product_categories_slug ON product_categories(slug)');
  createIndexIfNotExists('orders', 'idx_orders_user', 'CREATE INDEX idx_orders_user ON orders(user_id)');
  // createIndexIfNotExists('orders', 'idx_orders_status_date', 'CREATE INDEX idx_orders_status_date ON orders(status, created_at)');
  // createIndexIfNotExists('users', 'idx_users_role_date', 'CREATE INDEX idx_users_role_date ON users(role, created_at)');
  createIndexIfNotExists('order_items', 'idx_order_items_order', 'CREATE INDEX idx_order_items_order ON order_items(order_id)');
  createIndexIfNotExists('favorites', 'idx_favorites_user_product', 'CREATE UNIQUE INDEX idx_favorites_user_product ON favorites(user_id, product_id)');
  createIndexIfNotExists('email_verification_tokens', 'idx_email_verification_user', 'CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id)');
  createIndexIfNotExists('email_verification_tokens', 'idx_email_verification_expires', 'CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at)');
  createIndexIfNotExists('login_attempts', 'idx_login_attempts_email_time', 'CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempted_at)');
  createIndexIfNotExists('login_attempts', 'idx_login_attempts_ip_time', 'CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip, attempted_at)');
  createIndexIfNotExists('download_tokens', 'idx_download_tokens_user_item', 'CREATE INDEX idx_download_tokens_user_item ON download_tokens(user_id, order_item_id)');
  createIndexIfNotExists('download_tokens', 'idx_download_tokens_expires', 'CREATE INDEX idx_download_tokens_expires ON download_tokens(expires_at)');
  createIndexIfNotExists('download_logs', 'idx_download_logs_user_date', 'CREATE INDEX idx_download_logs_user_date ON download_logs(user_id, created_at)');
  createIndexIfNotExists('download_logs', 'idx_download_logs_order_date', 'CREATE INDEX idx_download_logs_order_date ON download_logs(order_id, created_at)');
  createIndexIfNotExists('download_logs', 'idx_download_logs_status_date', 'CREATE INDEX idx_download_logs_status_date ON download_logs(status, created_at)');
  createIndexIfNotExists('lgpd_requests', 'idx_lgpd_requests_user', 'CREATE INDEX idx_lgpd_requests_user ON lgpd_requests(user_id, created_at)');
  createIndexIfNotExists('lgpd_requests', 'idx_lgpd_requests_status', 'CREATE INDEX idx_lgpd_requests_status ON lgpd_requests(status, created_at)');
  createIndexIfNotExists('lgpd_consents', 'idx_lgpd_consents_key', 'CREATE INDEX idx_lgpd_consents_key ON lgpd_consents(consent_key, updated_at)');
  createIndexIfNotExists('lgpd_user_acceptances', 'idx_lgpd_acceptances_user', 'CREATE INDEX idx_lgpd_acceptances_user ON lgpd_user_acceptances(user_id, accepted_at)');

  ensureColumn('product_categories', 'icon', 'VARCHAR(255) NULL');
  ensureColumn('products', 'short_description', 'TEXT NULL');
  ensureColumn('products', 'production_sheet', 'TEXT NULL');
  ensureColumn('products', 'image_alt', 'TEXT NULL');
  ensureColumn('products', 'stitch_count', 'INT NULL');
  ensureColumn('products', 'colors', 'VARCHAR(255) NULL');
  ensureColumn('products', 'seo_keywords', 'TEXT NULL');
  ensureColumn('products', 'canonical_url', 'TEXT NULL');
  ensureColumn('products', 'og_image', 'TEXT NULL');
  ensureColumn('products', 'noindex', 'TINYINT(1) DEFAULT 0');
  ensureColumn('products', 'sku', 'VARCHAR(120) NULL');
  ensureColumn('products', 'brand', 'VARCHAR(120) NULL');
  ensureColumn('products', 'model', 'VARCHAR(120) NULL');
  ensureColumn('products', 'availability', "VARCHAR(60) DEFAULT 'in_stock'");
  ensureColumn('products', 'condition_type', "VARCHAR(60) DEFAULT 'new'");
  ensureColumn('products', 'search_terms', 'TEXT NULL');
  ensureColumn('product_images', 'file_type', "VARCHAR(50) NULL DEFAULT 'gallery'");
  ensureColumn('product_images', 'alt_text', 'TEXT NULL');
  ensureColumn('settings', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  ensureColumn('users', 'email_verified_at', 'DATETIME NULL');
  ensureColumn('users', 'privacy_reaccept_required', 'TINYINT(1) DEFAULT 0');
  ensureColumn('users', 'anonymized_at', 'DATETIME NULL');
  ensureColumn('users', 'deleted_at', 'DATETIME NULL');

  // WooCommerce migration compatibility expansions
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_registered DATETIME NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS woo_user_id VARCHAR(50) NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL`);

  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS state VARCHAR(50) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip VARCHAR(10) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS country VARCHAR(50) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_address TEXT NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_city VARCHAR(100) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_neighborhood VARCHAR(120) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_state VARCHAR(50) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_zip VARCHAR(10) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_country VARCHAR(50) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_address TEXT NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_neighborhood VARCHAR(120) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(50) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_zip VARCHAR(10) NULL`);
  query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(50) NULL`);

  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address TEXT NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_order_id VARCHAR(50) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_key VARCHAR(100) NULL`);

  query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name VARCHAR(255) NULL`);
  query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_slug VARCHAR(255) NULL`);

  // PayPal support columns (idempotent)
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) NULL DEFAULT 'mercadopago'`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_capture_id VARCHAR(255) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_payer_email VARCHAR(255) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_status VARCHAR(100) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NULL DEFAULT 'BRL'`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_total_brl DECIMAL(12,2) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS converted_total_usd DECIMAL(12,2) NULL`);
  query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4) NULL`);

  query(`
    CREATE TABLE IF NOT EXISTS paypal_webhook_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(255) NULL,
      event_type VARCHAR(255) NULL,
      resource_id VARCHAR(255) NULL,
      payload_json LONGTEXT NULL,
      verification_status VARCHAR(50) NULL DEFAULT 'unverified',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(50) NULL,
      order_id INT NULL,
      external_id VARCHAR(255) NULL,
      status VARCHAR(100) NULL,
      message TEXT NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
      INDEX idx_matrix_request_email_logs_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Social Login ─────────────────────────────────────────────────────────────
  query(`
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

  createIndexIfNotExists('user_social_accounts', 'idx_social_accounts_user', 'CREATE INDEX idx_social_accounts_user ON user_social_accounts(user_id)');

  // Tornar password nullable (users sociais não têm senha)
  try {
    query(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL`);
  } catch (_) { /* já está nullable ou outro erro irrecuperável */ }

  // Campos adicionais para social login
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) NULL DEFAULT 'local'`);
  query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL`);
}

export default {
  query,
  all,
  get,
  run,
  transaction,
  dispose: disposeConnection,
};

