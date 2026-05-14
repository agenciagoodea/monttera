import os

target = 'server.ts'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Optimize /api/settings
settings_old = """  app.get('/api/settings', (req, res) => {
    try {
      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "new_badge_days")') as any[];"""

settings_new = """  app.get('/api/settings', (req, res) => {
    try {
      const cached = apiCache.get('public_settings');
      if (cached) return res.json(cached);

      const rows = db.all('SELECT `key`, value FROM settings WHERE `key` IN ("site_name", "site_description", "logo_url", "primary_color", "secondary_color", "phone", "email_contact", "new_badge_days")') as any[];"""

settings_res_old = """      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json(settings);"""

settings_res_new = """      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      apiCache.set('public_settings', settings, 600); // 10 minutes cache
      res.json(settings);"""

if settings_old in content:
    content = content.replace(settings_old, settings_new)
    content = content.replace(settings_res_old, settings_res_new)
    print("Settings cache added.")

# 2. Optimize /api/categories
categories_old = """  app.get('/api/categories', (req, res) => {
    try {
      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");"""

categories_new = """  app.get('/api/categories', (req, res) => {
    try {
      const cached = apiCache.get('public_categories');
      if (cached) return res.json(cached);

      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");"""

categories_res_old = """      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");
      res.json(categories);"""

categories_res_new = """      const categories = db.all("SELECT * FROM product_categories WHERE status = 'active' ORDER BY sort_order ASC, name ASC");
      apiCache.set('public_categories', categories, 600); // 10 minutes cache
      res.json(categories);"""

if categories_old in content:
    content = content.replace(categories_old, categories_new)
    content = content.replace(categories_res_old, categories_res_new)
    print("Categories cache added.")

# 3. Add Cache Invalidation on Admin changes
# When an admin updates a product, category, or setting, we should invalidate the cache.

invalidators = [
    ("app.post('/api/admin/products', authenticate, isAdmin, upload.fields(", "apiCache.delete('public_categories');\n      "),
    ("app.put('/api/admin/products/:id', authenticate, isAdmin, upload.fields(", "apiCache.delete('public_categories');\n      "),
    ("app.post('/api/admin/categories', authenticate, isAdmin, upload.single('image'), (req, res) => {", "app.post('/api/admin/categories', authenticate, isAdmin, upload.single('image'), (req, res) => {\n    apiCache.delete('public_categories');"),
    ("app.put('/api/admin/categories/:id', authenticate, isAdmin, upload.single('image'), (req, res) => {", "app.put('/api/admin/categories/:id', authenticate, isAdmin, upload.single('image'), (req, res) => {\n    apiCache.delete('public_categories');"),
    ("app.put('/api/admin/settings', authenticate, isAdmin, async (req, res) => {", "app.put('/api/admin/settings', authenticate, isAdmin, async (req, res) => {\n    apiCache.delete('public_settings');")
]

for old_route, new_route in invalidators:
    if old_route in content:
        content = content.replace(old_route, new_route)

with open(target, 'w', encoding='utf-8') as f:
    f.write(content)

print("Optimization complete.")
