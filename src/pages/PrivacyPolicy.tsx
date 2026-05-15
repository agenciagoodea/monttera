import { useEffect, useMemo, useState } from 'react';
import { Shield, Lock, Cookie, FileText } from 'lucide-react';

type PolicyType = 'privacy' | 'terms' | 'cookies';
type PolicyRecord = {
  id: number;
  policy_type: PolicyType;
  version: string;
  title: string;
  content: string;
  is_active: number;
  published_at?: string | null;
};

const labelByType: Record<PolicyType, string> = {
  privacy: 'Política de Privacidade',
  terms: 'Termos de Uso',
  cookies: 'Política de Cookies',
};

const iconByType: Record<PolicyType, any> = {
  privacy: Shield,
  terms: FileText,
  cookies: Cookie,
};

export default function PrivacyPolicy() {
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<PolicyType>('privacy');
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadPolicies() {
      setLoading(true);
      try {
        const res = await fetch('/api/lgpd/policies/active');
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        const rows = Array.isArray(data?.policies) ? data.policies : [];
        setPolicies(rows);
      } catch {
        if (!mounted) return;
        setPolicies([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadPolicies();
    return () => {
      mounted = false;
    };
  }, []);

  const activePolicy = useMemo(() => {
    return policies.find((p) => p.policy_type === activeType);
  }, [policies, activeType]);

  const ActiveIcon = iconByType[activeType] || Lock;

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="text-center mb-10">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <ActiveIcon className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-3">Privacidade e Termos</h1>
        <p className="text-slate-500 font-medium">Conformidade LGPD com histórico de versão e publicação.</p>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-200/40">
        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(labelByType) as PolicyType[]).map((type) => {
            const Icon = iconByType[type];
            const selected = activeType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                  selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {labelByType[type]}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-sm font-semibold text-slate-500">Carregando políticas...</p>
        ) : !activePolicy ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            Nenhuma política ativa encontrada para esta categoria.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">{labelByType[activePolicy.policy_type]}</p>
              <h2 className="text-xl font-black text-slate-900 mt-1">{activePolicy.title}</h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Versão {activePolicy.version} • Publicada em {activePolicy.published_at ? new Date(activePolicy.published_at).toLocaleDateString('pt-BR') : 'não informado'}
              </p>
            </div>

            <article
              className="prose prose-slate max-w-none prose-headings:font-black prose-p:font-medium prose-li:font-medium"
              dangerouslySetInnerHTML={{ __html: activePolicy.content || '<p>Sem conteúdo disponível.</p>' }}
            />
          </>
        )}
      </div>
    </main>
  );
}

