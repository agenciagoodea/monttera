// Script verificação de email específico
const path = require('path');
require('dotenv').config({ path: '/home/digitalbordados/digitalbordados/.env' });

const mysql2 = require('/home/digitalbordados/digitalbordados/node_modules/mysql2/promise');

async function run() {
  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS,
    database: process.env.MYSQL_DATABASE,
  });

  // Verificar todos os emails dos últimos pedidos que não tiveram confirmação de pedido PARA O CLIENTE
  // (Comparar order_created para empresa vs para cliente)
  console.log('\n=== VERIFICAÇÃO: Pedidos onde empresa recebeu mas cliente NÃO recebeu ===\n');
  
  // Pedidos onde só a empresa (contato@digitalbordados.com.br) recebeu order_created mas o cliente não
  try {
    const [rows] = await conn.query(`
      SELECT DISTINCT o.id, o.customer_email, o.status, o.created_at,
        (SELECT COUNT(*) FROM email_logs el WHERE el.template_key='order_created' AND el.to_email=o.customer_email AND el.status='sent') as cliente_recebeu,
        (SELECT COUNT(*) FROM email_logs el WHERE el.template_key='order_created' AND el.to_email='contato@digitalbordados.com.br' AND ABS(TIMESTAMPDIFF(MINUTE, el.created_at, o.created_at)) < 5) as empresa_recebeu
      FROM orders o
      WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
      ORDER BY o.created_at DESC
      LIMIT 30
    `);
    
    const problema = rows.filter(r => r.empresa_recebeu > 0 && r.cliente_recebeu === 0);
    if (problema.length === 0) {
      console.log('Nenhum pedido encontrado onde empresa recebeu mas cliente não!');
    } else {
      console.log('PROBLEMA - Empresa recebeu mas cliente NÃO:');
      problema.forEach(r => console.log(`  Pedido #${r.id} | ${r.customer_email} | ${r.status} | ${r.created_at}`));
    }
    
    console.log('\n--- Status geral dos últimos 30 pedidos ---');
    rows.forEach(r => console.log(`#${r.id} | ${r.customer_email.substring(0,30)} | cliente_ok:${r.cliente_recebeu>0?'✅':'❌'} | empresa_ok:${r.empresa_recebeu>0?'✅':'❓'} | ${r.status}`));
    
  } catch(e) { console.log('ERRO:', e.message); }

  // Verificar pedidos com payment_failed que não tiveram order_created
  console.log('\n--- Pedidos com payment_failed (rejeitados) ---');
  try {
    const [rows] = await conn.query(`
      SELECT o.id, o.customer_email, o.status, o.created_at,
        (SELECT COUNT(*) FROM email_logs el WHERE el.template_key='payment_failed' AND el.to_email=o.customer_email) as falha_enviada,
        (SELECT COUNT(*) FROM email_logs el WHERE el.template_key='order_created' AND el.to_email=o.customer_email) as pedido_enviado
      FROM orders o
      WHERE o.status IN ('rejected', 'cancelled')
        AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY o.created_at DESC
      LIMIT 10
    `);
    rows.forEach(r => console.log(`#${r.id} | ${r.customer_email} | order_created:${r.pedido_enviado} | payment_failed:${r.falha_enviada}`));
    if (rows.length === 0) console.log('(nenhum pedido rejeitado/cancelado)');
  } catch(e) { console.log('ERRO:', e.message); }

  await conn.end();
  console.log('\n=== FIM ===');
}

run().catch(err => { console.error('ERRO GERAL:', err.message); process.exit(1); });
