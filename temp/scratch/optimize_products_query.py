import os

target = 'server.ts'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

old_select = "SELECT p.*, c.name as category_name"
new_select = "SELECT p.id, p.name, p.slug, p.price, p.sale_price, p.image, p.status, p.created_at, p.category_id, c.name as category_name"

if old_select in content:
    print("Updating product list SELECT...")
    new_content = content.replace(old_select, new_select)
    with open(target, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Done!")
else:
    print("SELECT p.* not found or already optimized.")
