const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const mysqlCmd = (sql) => {
  return `mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -h 127.0.0.1 -P 3306 -D digitalbordados_novo -t -e "${sql}"`;
};

const consentsToGrant = [
  {
    key: 'privacy_policy',
    purpose: 'Aceite de conformidade da politica de privacidade.'
  },
  {
    key: 'terms_of_use',
    purpose: 'Aceite de conformidade dos termos de uso da plataforma.'
  },
  {
    key: 'cookies_policy',
    purpose: 'Aceite de conformidade da politica de cookies.'
  },
  {
    key: 'checkout_data_processing',
    purpose: 'Processamento de dados para finalizacao de pedidos.'
  },
  {
    key: 'marketing_communications',
    purpose: 'Envio de ofertas e comunicacoes comerciais.'
  }
];

const allRemoteCmds = [];

// Passo 1: Atualizar para granted = 1 todos os registros existentes que estavam inativos (granted = 0)
const keysInStr = consentsToGrant.map(c => `'${c.key}'`).join(',');
const updateSql = `UPDATE lgpd_consents SET granted = 1, revoked_at = NULL WHERE consent_key IN (${keysInStr}) AND granted = 0;`;
allRemoteCmds.push(`echo "Passo 1: Ativando registros existentes de consentimento LGPD inativos..."`);
allRemoteCmds.push(mysqlCmd(updateSql));

// Passo 2: Inserir novos registros de consentimento apenas para usuários sem nenhuma linha correspondente
consentsToGrant.forEach(c => {
  const insertSql = `
    INSERT INTO lgpd_consents (user_id, consent_key, granted, legal_basis, purpose, source, policy_version, ip)
    SELECT u.id, '${c.key}', 1, 'consent', '${c.purpose}', 'admin_migration', '1.0', '127.0.0.1'
    FROM users u
    WHERE u.id NOT IN (
      SELECT user_id FROM lgpd_consents WHERE consent_key = '${c.key}'
    );
  `.replace(/\s+/g, ' ').trim();
  
  allRemoteCmds.push(`echo "Passo 2: Inserindo novos consentimentos para a chave: ${c.key}..."`);
  allRemoteCmds.push(mysqlCmd(insertSql));
});

// Passo 3: Rodar validações para emitir o relatório final
const validationQueries = [
  {
    title: "1. Total de usuários cadastrados (tabela 'users')",
    sql: "SELECT COUNT(*) as 'Total de Usuários' FROM users;"
  },
  {
    title: "2. Resumo de usuários com pelo menos 1 consentimento ativo (granted = 1)",
    sql: "SELECT (SELECT COUNT(*) FROM users) as 'Total de Usuários', (SELECT COUNT(DISTINCT user_id) FROM lgpd_consents WHERE granted = 1) as 'Usuários com Consentimento Ativo', ((SELECT COUNT(*) FROM users) - (SELECT COUNT(DISTINCT user_id) FROM lgpd_consents WHERE granted = 1)) as 'Usuários sem Consentimento Ativo / Sem Registro';"
  },
  {
    title: "3. Detalhes de adesão ativa (granted = 1) por chave de consentimento contra o total de usuários",
    sql: "SELECT c.consent_key as 'Chave de Consentimento', COUNT(DISTINCT c.user_id) as 'Usuários Ativos (Aceitaram)', ((SELECT COUNT(*) FROM users) - COUNT(DISTINCT c.user_id)) as 'Usuários sem Consentimento (Não Aceitaram / Sem Registro)' FROM lgpd_consents c WHERE c.granted = 1 GROUP BY c.consent_key;"
  }
];

validationQueries.forEach(q => {
  allRemoteCmds.push(`echo ""; echo "=========================================================================="; echo "${q.title}"; echo "=========================================================================="; ${mysqlCmd(q.sql)}`);
});

const remoteCmd = allRemoteCmds.join(' && ');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH :: Conectado ao servidor de produção. Executando inserção e atualização em massa...');
  conn.exec(remoteCmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('\nSSH :: Processo concluído.');
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
