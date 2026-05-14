target = 'src/server/db.ts'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

old = "  createIndexIfNotExists('orders', 'idx_orders_user', 'CREATE INDEX idx_orders_user ON orders(user_id)');"
new = old + """
  createIndexIfNotExists('orders', 'idx_orders_status_date', 'CREATE INDEX idx_orders_status_date ON orders(status, created_at)');
  createIndexIfNotExists('users', 'idx_users_role_date', 'CREATE INDEX idx_users_role_date ON users(role, created_at)');
  createIndexIfNotExists('order_items', 'idx_order_items_order', 'CREATE INDEX idx_order_items_order ON order_items(order_id)');"""

if old in content:
    print("Found! Replacing...")
    new_content = content.replace(old, new)
    with open(target, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Done!")
else:
    print("Not found.")
