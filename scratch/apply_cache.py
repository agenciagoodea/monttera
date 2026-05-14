import os

target_file = 'server.ts'
with open(target_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Add CacheProvider at the top
cache_class = """
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
"""

# Find place to insert cache class (after imports)
for i, line in enumerate(lines):
    if "import { MercadoPagoConfig, Payment } from 'mercadopago';" in line:
        lines.insert(i + 1, cache_class)
        break

# 2. Add cache check in dashboard stats route
new_content = "".join(lines)

old_route_start = "app.get('/api/admin/dashboard/stats', authenticate, isAdmin, (req, res) => {"
new_route_start = old_route_start + """
    const cached = apiCache.get('admin_dashboard_stats');
    if (cached) return res.json(cached);
"""

if old_route_start in new_content:
    new_content = new_content.replace(old_route_start, new_route_start)

# 3. Add cache set before sending response
old_res_json = """      res.json({
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
      });"""

new_res_json = """      const responseData = {
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
      res.json(responseData);"""

if old_res_json in new_content:
    new_content = new_content.replace(old_res_json, new_res_json)

with open(target_file, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Updated server.ts with caching!")
