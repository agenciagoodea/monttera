const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'digitalbordados_novo',
    password: 'rG8phG4YKqxjBEeFmGfw',
    database: 'digitalbordados_novo'
  });

  try {
    console.log("=== Relatório de Consentimento LGPD ===");
    
    // 1. Total de usuários cadastrados
    const [totalUsersRows] = await connection.query("SELECT COUNT(*) as count FROM users");
    const totalUsers = totalUsersRows[0].count;
    console.log(`Total de usuários na tabela 'users': ${totalUsers}`);
    
    // 2. Total de registros de consentimento
    const [totalConsentsRows] = await connection.query("SELECT COUNT(*) as count FROM lgpd_consents");
    const totalConsents = totalConsentsRows[0].count;
    console.log(`Total de registros na tabela 'lgpd_consents': ${totalConsents}`);

    // 3. Estatísticas por chave de consentimento
    const [consentsStats] = await connection.query(`
      SELECT consent_key, 
             SUM(CASE WHEN granted = 1 THEN 1 ELSE 0 END) as ativos,
             SUM(CASE WHEN granted = 0 THEN 1 ELSE 0 END) as inativos,
             COUNT(*) as total
      FROM lgpd_consents
      GROUP BY consent_key
    `);
    
    console.log("\nEstatísticas por chave de consentimento (lgpd_consents):");
    consentsStats.forEach(stat => {
      console.log(`- Chave '${stat.consent_key}': Ativos: ${stat.ativos} | Inativos: ${stat.inativos} | Total: ${stat.total}`);
    });

    // 4. Usuários com consentimento ATIVO (pelo menos 1 consentimento granted = 1)
    const [activeUsersRows] = await connection.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM lgpd_consents 
      WHERE granted = 1
    `);
    const usersWithAnyActiveConsent = activeUsersRows[0].count;
    const usersWithoutAnyActiveConsent = totalUsers - usersWithAnyActiveConsent;
    
    console.log(`\nResumo geral de consentimento por usuário:`);
    console.log(`- Usuários com pelo menos 1 consentimento ATIVO: ${usersWithAnyActiveConsent}`);
    console.log(`- Usuários SEM nenhum consentimento ativo (ou sem registros): ${usersWithoutAnyActiveConsent}`);

    // 5. Vamos ver a situação da chave de consentimento de cadastro 'register_consent' ou 'privacy_policy'
    const [distinctKeys] = await connection.query("SELECT DISTINCT consent_key FROM lgpd_consents");
    const keysList = distinctKeys.map(k => k.consent_key);
    console.log("\nChaves de consentimento distintas cadastradas:", keysList);

    // Para cada chave específica, quantos usuários cadastrados possuem essa chave ativa ou inativa
    for (const key of keysList) {
      const [keyRows] = await connection.query(`
        SELECT 
          (SELECT COUNT(DISTINCT id) FROM users) as total_users,
          (SELECT COUNT(DISTINCT user_id) FROM lgpd_consents WHERE consent_key = ? AND granted = 1) as aceitaram,
          (SELECT COUNT(DISTINCT id) FROM users WHERE id NOT IN (
            SELECT user_id FROM lgpd_consents WHERE consent_key = ? AND granted = 1
          )) as nao_aceitaram
      `, [key, key]);
      
      const stats = keyRows[0];
      console.log(`\nPara a chave '${key}':`);
      console.log(`  - Usuários que ACEITARAM (Ativo): ${stats.aceitaram}`);
      console.log(`  - Usuários que NÃO aceitaram / Sem registro: ${stats.nao_aceitaram}`);
    }

  } catch (error) {
    console.error("Erro ao rodar query de consentimentos:", error);
  } finally {
    await connection.end();
  }
}

run();
