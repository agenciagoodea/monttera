import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Star,
  MessageSquare,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface Review {
  id: number;
  product_id: number;
  user_id: number;
  rating: number;
  comment: string;
  status: 'approved' | 'pending' | 'rejected';
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  product_name: string | null;
  product_slug: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const fetchReviews = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        q: search,
        status: statusFilter
      });
      
      const res = await fetch(`/api/admin/reviews?${params.toString()}`);
      const data = await res.json();
      
      if (data.reviews && Array.isArray(data.reviews)) {
        setReviews(data.reviews);
        setPagination(data.pagination);
      } else {
        setReviews([]);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReviews(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta avaliação permanentemente? Esta ação não pode ser desfeita.')) return;
    
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchReviews(pagination.page);
        setToast({ message: 'Avaliação excluída com sucesso', type: 'success' });
      } else {
        setToast({ message: data.error || 'Erro ao excluir avaliação', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Erro ao conectar ao servidor', type: 'error' });
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: 'approved' | 'pending' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/reviews/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReviews(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        let statusMsg = '';
        if (newStatus === 'approved') statusMsg = 'Avaliação aprovada e visível na loja';
        if (newStatus === 'rejected') statusMsg = 'Avaliação rejeitada e oculta na loja';
        if (newStatus === 'pending') statusMsg = 'Avaliação colocada em moderação';
        
        setToast({
          message: statusMsg,
          type: 'success'
        });
      } else {
        setToast({ message: data.error || 'Erro ao atualizar status', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Erro ao conectar ao servidor', type: 'error' });
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${
              i < rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
            }`}
          />
        ))}
      </div>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Toast de Confirmação Visual elegante */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 border ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`} style={{ backgroundColor: toast.type === 'success' ? '#ecfdf5' : '#fdf2f2', zIndex: 9999 }}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Avaliações</h1>
          <p className="text-slate-500 font-medium">Modere e gerencie todos os depoimentos enviados pelos clientes.</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 flex-1 w-full">
            <div className="relative w-full md:w-96">
              <input
                type="text"
                placeholder="Buscar por comentário, cliente ou produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-slate-700 placeholder-slate-400"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            </div>
            
            <div className="relative w-full md:w-64">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all appearance-none text-slate-700"
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendentes</option>
                <option value="approved">Aprovadas</option>
                <option value="rejected">Rejeitadas</option>
              </select>
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              {pagination.total} Avaliações
            </span>
          </div>
        </div>

        {/* Tabela de Avaliações */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                <th className="px-8 py-6 min-w-[200px]">Cliente</th>
                <th className="px-8 py-6 min-w-[200px]">Produto</th>
                <th className="px-8 py-6 min-w-[150px]">Avaliação</th>
                <th className="px-8 py-6 min-w-[200px]">Comentário</th>
                <th className="px-8 py-6 text-center">Status</th>
                <th className="px-8 py-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(pagination.limit)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-6 h-24 bg-slate-50/20" />
                  </tr>
                ))
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="w-8 h-8 text-slate-300" />
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhuma avaliação encontrada.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50/50 transition-colors group">
                    {/* Cliente */}
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-black text-xs">
                          {getInitials(review.user_name || review.user_email || 'User')}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">
                            {review.user_name || 'Anônimo'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 truncate tracking-wide">
                            {review.user_email || '-'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Produto */}
                    <td className="px-8 py-6">
                      <div className="flex flex-col min-w-0">
                        {review.product_slug ? (
                          <a
                            href={`/produto/${review.product_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-black text-slate-800 uppercase tracking-tight hover:text-blue-600 transition-colors truncate"
                          >
                            {review.product_name || 'Produto sem nome'}
                          </a>
                        ) : (
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">
                            {review.product_name || 'Produto sem nome'}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 tracking-wide">
                          ID: #{review.product_id}
                        </span>
                      </div>
                    </td>

                    {/* Nota */}
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1.5 justify-center">
                        {renderStars(review.rating)}
                        <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded w-fit uppercase tracking-widest">
                          Nota {review.rating}/5
                        </span>
                      </div>
                    </td>

                    {/* Comentário */}
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1 max-w-sm">
                        <p className="text-xs text-slate-650 font-semibold leading-relaxed whitespace-pre-line italic">
                          "{review.comment || 'Sem comentário escrito'}"
                        </p>
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 mt-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-350" />
                          {formatDate(review.created_at)}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-8 py-6">
                      <div className="flex justify-center">
                        {review.status === 'approved' && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovada
                          </span>
                        )}
                        {review.status === 'pending' && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-100">
                            <AlertCircle className="w-3.5 h-3.5 animate-pulse" /> Pendente
                          </span>
                        )}
                        {review.status === 'rejected' && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-rose-100">
                            <XCircle className="w-3.5 h-3.5" /> Rejeitada
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-end gap-2.5">
                        {/* Botões de Moderar Status */}
                        {review.status !== 'approved' && (
                          <button
                            onClick={() => handleUpdateStatus(review.id, 'approved')}
                            className="flex items-center gap-1 px-3 py-2 text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl border border-emerald-150 transition-all active:scale-95"
                            title="Aprovar avaliação"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                          </button>
                        )}

                        {review.status !== 'rejected' && (
                          <button
                            onClick={() => handleUpdateStatus(review.id, 'rejected')}
                            className="flex items-center gap-1 px-3 py-2 text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl border border-rose-150 transition-all active:scale-95"
                            title="Rejeitar avaliação"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Rejeitar
                          </button>
                        )}

                        {/* Botão de Excluir Física */}
                        <button
                          onClick={() => handleDelete(review.id)}
                          className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-95"
                          title="Excluir Permanentemente"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!loading && pagination.pages > 1 && (
          <div className="p-8 border-t border-slate-50 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Página {pagination.page} de {pagination.pages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchReviews(pagination.page - 1)}
                disabled={pagination.page === 1 || loading}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-400 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {[...Array(pagination.pages)].map((_, i) => {
                const pageNum = i + 1;
                if (
                  pageNum === 1 || 
                  pageNum === pagination.pages || 
                  (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchReviews(pageNum)}
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
                  return <span key={pageNum} className="text-slate-300 font-bold px-1">...</span>;
                }
                return null;
              })}

              <button
                onClick={() => fetchReviews(pagination.page + 1)}
                disabled={pagination.page === pagination.pages || loading}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-slate-50 disabled:hover:text-slate-400 transition-all"
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
