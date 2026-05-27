import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, 
  Search, 
  MoreHorizontal, 
  Trash2, 
  Edit3, 
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { normalizePublicMediaUrl } from '../../lib/utils';

interface Product {
  id: number;
  name: string | null;
  slug: string | null;
  price: number | string | null;
  sale_price: number | string | null;
  image: string | null;
  category_name: string | null;
  status: string | null;
  is_featured: number;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function AdminProductList() {
  const { categories } = useAppData();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchProducts = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        q: search,
        category: categoryFilter
      });
      
      const res = await fetch(`/api/admin/products?${params.toString()}`);
      const data = await res.json();
      
      if (data.products && Array.isArray(data.products)) {
        setProducts(data.products);
        setPagination(data.pagination);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, categoryFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts(pagination.page);
      }
    } catch (error) {
      alert('Erro ao excluir produto');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/products/${id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok || !payload?.id) {
        alert(payload?.error || 'Erro ao duplicar produto');
        return;
      }
      window.location.href = `/admin/produtos/editar/${payload.id}`;
    } catch (error) {
      alert('Erro ao duplicar produto');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string | null) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/admin/products/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
        setToast({
          message: newStatus === 'active' ? 'Produto ativado com sucesso' : 'Produto desativado com sucesso',
          type: 'success'
        });
      } else {
        setToast({ message: data.error || 'Erro ao atualizar status', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Erro ao conectar ao servidor', type: 'error' });
    }
  };

  const toCurrencyNumber = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Toast de Confirmação Visual elegante */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 border ${
          toast.type === 'success' ? 'bg-emerald-550 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`} style={{ backgroundColor: toast.type === 'success' ? '#ecfdf5' : '#fdf2f2', zIndex: 9999 }}>
          {toast.message}
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Produtos</h1>
          <p className="text-slate-500 font-medium">Gerencie o catálogo de matrizes da sua loja.</p>
        </div>
        <Link 
          to="/admin/produtos/novo"
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
        >
          <Plus className="w-5 h-5" />
          Novo Produto
        </Link>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 flex-1">
            <div className="relative w-full md:w-96">
              <input
                type="text"
                placeholder="Buscar por nome ou slug..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            </div>
            
            <div className="relative w-full md:w-64">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all appearance-none"
              >
                <option value="all">Todas as Categorias</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              {pagination.total} Produtos
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                <th className="px-8 py-6">Produto</th>
                <th className="px-8 py-6">Categoria</th>
                <th className="px-8 py-6">Preço</th>
                <th className="px-8 py-6 text-center">Status</th>
                <th className="px-8 py-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                 [...Array(pagination.limit)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6 h-20 bg-slate-50/20" />
                  </tr>
                ))
              ) : products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
                        {product.image ? (
                          <img src={normalizePublicMediaUrl(product.image)} alt={product.name || ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Eye className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <Link
                          to={`/admin/produtos/editar/${product.id}`}
                          className="text-xs font-black text-slate-800 truncate uppercase tracking-tight hover:text-blue-600 transition-colors"
                        >
                          {product.name || 'Sem nome'}
                        </Link>
                        <span className="text-[10px] font-bold text-slate-400 truncate tracking-wide">#{product.slug || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-lg">
                      {product.category_name || 'Sem Categoria'}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-800">R$ {toCurrencyNumber(product.price).toFixed(2)}</span>
                      {product.sale_price !== null && product.sale_price !== undefined && Number(product.sale_price) > 0 && (
                        <span className="text-[10px] font-bold text-emerald-500">Promocional: R$ {toCurrencyNumber(product.sale_price).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex justify-center">
                      <button
                        onClick={() => handleToggleStatus(product.id, product.status)}
                        className="group/btn relative transition-transform active:scale-95"
                        title={product.status === 'active' ? 'Clique para desativar produto' : 'Clique para ativar produto'}
                      >
                        {product.status === 'active' ? (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 hover:text-emerald-700 transition-all border border-emerald-100 group-hover/btn:scale-105">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 hover:text-slate-700 transition-all border border-slate-200 group-hover/btn:scale-105">
                            <XCircle className="w-3 h-3" /> Inativo
                          </span>
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/produtos/editar/${product.id}`}
                        className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit3 className="w-5 h-5" />
                      </Link>
                      <button
                        onClick={() => handleDuplicate(product.id)}
                        className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Duplicar"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {!loading && products.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhum produto encontrado.</p>
          </div>
        )}

        {/* Paginação */}
        {pagination.pages > 1 && (
          <div className="p-8 border-t border-slate-50 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Página {pagination.page} de {pagination.pages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchProducts(pagination.page - 1)}
                disabled={pagination.page === 1 || loading}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {[...Array(pagination.pages)].map((_, i) => {
                const pageNum = i + 1;
                // Mostrar apenas algumas páginas se houver muitas
                if (
                  pageNum === 1 || 
                  pageNum === pagination.pages || 
                  (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchProducts(pageNum)}
                      className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${
                        pagination.page === pageNum
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (
                   pageNum === pagination.page - 2 || 
                   pageNum === pagination.page + 2
                ) {
                  return <span key={pageNum} className="text-slate-300">...</span>;
                }
                return null;
              })}

              <button
                onClick={() => fetchProducts(pagination.page + 1)}
                disabled={pagination.page === pagination.pages || loading}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
