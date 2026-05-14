import os

target_file = 'server.ts'
with open(target_file, 'rb') as f:
    content = f.read()

old_block = b'''  app.get('/api/admin/dashboard/stats', authenticate, isAdmin, (req, res) => {
    try {
      const totalSales = db.get(\"SELECT SUM(total) as total FROM orders WHERE status IN ('paid', 'completed', 'success', 'pago')\") as any;
      const paidOrders = db.get(\"SELECT COUNT(*) as count FROM orders WHERE status IN ('paid', 'completed', 'success', 'pago')\") as any;
      const activeProducts = db.get(\"SELECT COUNT(*) as count FROM products WHERE status = 'active'\") as any;
      const totalCustomers = db.get(\"SELECT COUNT(*) as count FROM users WHERE role = 'customer'\") as any;

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
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // Atividade recente combinando logs
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
  });'''

new_block = b'''  app.get('/api/admin/dashboard/stats', authenticate, isAdmin, (req, res) => {
    try {
      // Per\xc3\xadodo Atual (30 dias)
      const currentStats = db.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // Per\xc3\xadodo Anterior (30-60 dias atr\xc3\xa1s) para c\xc3\xa1lculo de tend\xc3\xaancia
      const previousStats = db.get(`
        SELECT 
          SUM(total) as totalSales,
          COUNT(*) as paidOrders
        FROM orders 
        WHERE status IN ('paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing')
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      const activeProducts = db.get(\"SELECT COUNT(*) as count FROM products WHERE status = 'active'\") as any;
      const totalCustomers = db.get(\"SELECT COUNT(*) as count FROM users WHERE role = 'customer'\") as any;
      
      const prevCustomers = db.get(`
        SELECT COUNT(*) as count FROM users 
        WHERE role = 'customer' 
        AND created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      `) as any;

      // Fun\xc3\xa7\xc3\xb5es de c\xc3\xa1lculo de tend\xc3\xaancia
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

      res.json({
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
      });
    } catch (error) {
      console.error('Admin Dashboard Stats Error:', error);
      res.status(500).json({ error: 'Erro ao buscar dados reais do dashboard' });
    }
  });'''

# Clean up whitespace issues
def clean_block(b):
    return b.strip().replace(b'\\r\\n', b'\\n')

# Try matching with normalized line endings
if clean_block(old_block) in content.replace(b'\\r\\n', b'\\n'):
    print("Found exact block (LF normalized)")
    new_content = content.replace(b'\\r\\n', b'\\n').replace(clean_block(old_block), clean_block(new_block))
    with open(target_file, 'wb') as f:
        f.write(new_content)
    print("Successfully replaced block")
else:
    # Try line by line or partial match
    start_line = b"app.get('/api/admin/dashboard/stats'"
    start_pos = content.find(start_line)
    if start_pos != -1:
        # Find next route to demarcate end
        end_marker = b"app.get('/api/admin/reports'"
        end_pos = content.find(end_marker, start_pos)
        if end_pos != -1:
            new_content = content[:start_pos] + clean_block(new_block) + b'\\n\\n' + content[end_pos:]
            with open(target_file, 'wb') as f:
                f.write(new_content)
            print("Successfully replaced block using markers")
        else:
            print("End marker not found")
    else:
        print("Start marker not found")
