import re

target = 'src/components/Header.tsx'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to replace the contents of the dropdown
pattern = r"(\{\(user as any\)\.type === 'customer' && \([\s\S]*?\)\})[\s\S]*?(\{user\.type === 'user' && \([\s\S]*?\)\})"

replacement = """{user.type === 'user' && (
                      <Link to="/admin" className="w-full text-left px-4 py-2 text-[11px] font-black text-blue-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 mb-1 pb-3">
                        <LayoutDashboard className="w-3 h-3" /> Painel Admin
                      </Link>
                    )}
                    <Link to="/minha-conta" className="w-full text-left px-4 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                      <User className="w-3 h-3" /> Minha Conta
                    </Link>
                    <Link to="/minha-conta?tab=pedidos" className="w-full text-left px-4 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                      <ShoppingBag className="w-3 h-3" /> Pedidos
                    </Link>
                    <Link to="/minha-conta?tab=downloads" className="w-full text-left px-4 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                      <Download className="w-3 h-3" /> Matrizes Compradas
                    </Link>
                    <Link to="/favoritos" className="w-full text-left px-4 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 mb-1 pb-3">
                      <Heart className="w-3 h-3" /> Favoritos
                    </Link>"""

new_content = re.sub(pattern, replacement, content)

with open(target, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replacement successful." if new_content != content else "No changes made.")
