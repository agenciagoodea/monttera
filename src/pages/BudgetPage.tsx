import { FormEvent, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Send, Sparkles, Target, Zap } from 'lucide-react';

export default function BudgetPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [projectType, setProjectType] = useState('logo');
  const [budgetRange, setBudgetRange] = useState('ate-100');
  const [deadline, setDeadline] = useState('normal');
  const [details, setDetails] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);

    try {
      const extra = `Tipo de projeto: ${projectType}\nFaixa de orcamento: ${budgetRange}\nPrazo: ${deadline}\nDetalhes: ${details}`;
      const form = new FormData();
      form.append('name', name.trim());
      form.append('email', email.trim());
      form.append('whatsapp', whatsapp.trim());
      form.append('details', extra.trim());
      if (referenceImage) form.append('reference_image', referenceImage);

      const res = await fetch('/api/matrix-requests', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Nao foi possivel enviar seu pedido agora.');

      setMessage({ type: 'success', text: 'Pedido enviado com sucesso! Nossa equipe ja iniciou a analise.' });
      setName('');
      setEmail('');
      setWhatsapp('');
      setProjectType('logo');
      setBudgetRange('ate-100');
      setDeadline('normal');
      setDetails('');
      setReferenceImage(null);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Erro ao enviar pedido.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <section className="rounded-[2.25rem] border border-slate-100 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 p-8 md:p-10 text-white shadow-2xl shadow-blue-900/20">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" /> Orcamento sob medida
        </p>
        <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-[-0.03em] max-w-4xl">Solicite seu projeto de matriz com proposta profissional</h1>
        <p className="mt-4 max-w-3xl text-sm md:text-base text-blue-100/90 font-semibold">
          Envie os detalhes do que voce precisa. A equipe analisa o material, prazo e complexidade para te retornar com o melhor custo-beneficio.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Como funciona</h2>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-black">1</span>
                <p className="text-xs font-semibold text-slate-600">Voce envia a referencia com os detalhes tecnicos.</p>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-black">2</span>
                <p className="text-xs font-semibold text-slate-600">Nossa equipe valida viabilidade, prazo e complexidade.</p>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-black">3</span>
                <p className="text-xs font-semibold text-slate-600">Voce recebe retorno rapido e segue para producao.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Diferenciais</h3>
            <div className="mt-4 space-y-3 text-xs font-semibold text-slate-600">
              <p className="inline-flex items-center gap-2"><Zap className="w-4 h-4 text-blue-600" /> Atendimento agil</p>
              <p className="inline-flex items-center gap-2"><Target className="w-4 h-4 text-blue-600" /> Proposta objetiva</p>
              <p className="inline-flex items-center gap-2"><Clock3 className="w-4 h-4 text-blue-600" /> Prazo transparente</p>
              <p className="inline-flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> Escopo validado</p>
            </div>
          </div>
        </aside>

        <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">Enviar solicitacao de orcamento</h2>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="E-mail" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required placeholder="WhatsApp com DDD" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200">
                <option value="logo">Logo/Marca</option>
                <option value="frase">Frase/Tipografia</option>
                <option value="desenho">Desenho/Ilustracao</option>
                <option value="composicao">Composicao completa</option>
              </select>
              <select value={budgetRange} onChange={(e) => setBudgetRange(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200">
                <option value="ate-100">Faixa: ate R$ 100</option>
                <option value="100-250">Faixa: R$ 100 a R$ 250</option>
                <option value="250-500">Faixa: R$ 250 a R$ 500</option>
                <option value="acima-500">Faixa: acima de R$ 500</option>
              </select>
              <select value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200">
                <option value="normal">Prazo normal</option>
                <option value="urgente">Urgente (prioridade)</option>
              </select>
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Descreva o projeto, tamanho, aplicacao e qualquer observacao tecnica."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-end">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setReferenceImage(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-700 hover:to-cyan-600 disabled:opacity-70"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>

            {message && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-wider ${
                  message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {message.type === 'success' && <CheckCircle2 className="inline w-4 h-4 mr-2" />}
                {message.text}
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}

