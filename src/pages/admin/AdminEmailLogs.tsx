import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';

interface EmailLog {
  id: number;
  to_email: string;
  subject: string;
  template_key: string;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export default function AdminEmailLogs() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed'>('all');
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/email-logs', { withCredentials: true });
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = filterStatus === 'all' ? logs : logs.filter(l => l.status === filterStatus);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPageLogs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilter = (status: 'all' | 'sent' | 'failed') => {
    setFilterStatus(status);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-xs font-black uppercase tracking-widest">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Carregando logs...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2">
          {(['all', 'sent', 'failed'] as const).map(f => (
            <button
              key={f}
              onClick={() => handleFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                filterStatus === f
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'sent' ? 'Enviados' : 'Falhas'}
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] ${filterStatus === f ? 'bg-white/20' : 'bg-slate-200'}`}>
                {f === 'all' ? logs.length : logs.filter(l => l.status === f).length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Data/Hora</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Destinatário</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Template</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {currentPageLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-400">
                    Nenhum log encontrado.
                  </td>
                </tr>
              ) : currentPageLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {log.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> Enviado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-100 text-rose-700">
                        <XCircle className="w-3 h-3" /> Falha
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-800">
                    {log.to_email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-slate-100 px-2 py-1 rounded-lg font-mono text-[10px] text-slate-600">{log.template_key}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-rose-600 max-w-[200px] truncate">
                    {log.error || <span className="text-slate-300">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Página {page} de {totalPages} — {filtered.length} registros
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
