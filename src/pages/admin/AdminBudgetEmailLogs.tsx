import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, XCircle } from 'lucide-react';
import axios from 'axios';

type BudgetLog = {
  id: number;
  matrix_request_id: number | null;
  recipient_type: 'team' | 'customer';
  to_email: string | null;
  template_key: string | null;
  status: 'pending' | 'sent' | 'erro';
  error: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  created_at: string;
};

export default function AdminBudgetEmailLogs() {
  const [logs, setLogs] = useState<BudgetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'pending' | 'sent' | 'erro'>('all');
  const [q, setQ] = useState('');
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (status !== 'all') params.status = status;
      if (q.trim()) params.q = q.trim();
      const { data } = await axios.get('/api/admin/email/budget-logs', { withCredentials: true, params });
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status]);

  const retry = async (id: number) => {
    setRetryingId(id);
    try {
      await axios.post(`/api/admin/email/budget-logs/${id}/retry`, {}, { withCredentials: true });
      await load();
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Logs de Orçamento</h4>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-2 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-white">
            <option value="all">Todos</option>
            <option value="pending">Pendente</option>
            <option value="sent">Enviado</option>
            <option value="erro">Erro</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600"
          />
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs font-semibold text-slate-400 py-6">Carregando logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-xs font-semibold text-slate-400 py-6">Sem registros de orçamento.</div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-slate-700">
                  #{log.matrix_request_id || '-'} • {log.recipient_type === 'team' ? 'Equipe' : 'Cliente'}
                </div>
                <div className="font-bold text-slate-400">{new Date(log.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div className="mt-1 text-slate-600">{log.to_email || '-'}</div>
              <div className="mt-1 text-slate-500">Template: {log.template_key || '-'}</div>
              <div className="mt-2 flex items-center gap-2">
                {log.status === 'sent' && <span className="inline-flex items-center gap-1 text-emerald-700 font-black"><CheckCircle2 className="w-3.5 h-3.5" /> enviado</span>}
                {log.status === 'pending' && <span className="inline-flex items-center gap-1 text-amber-700 font-black"><Clock3 className="w-3.5 h-3.5" /> pendente</span>}
                {log.status === 'erro' && <span className="inline-flex items-center gap-1 text-rose-700 font-black"><XCircle className="w-3.5 h-3.5" /> erro</span>}
                {log.status !== 'sent' && (
                  <button
                    type="button"
                    onClick={() => retry(log.id)}
                    disabled={retryingId === log.id}
                    className="ml-auto px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    {retryingId === log.id ? 'Reenviando...' : 'Reenviar'}
                  </button>
                )}
              </div>
              {log.error && <div className="mt-1 text-rose-700">{log.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
