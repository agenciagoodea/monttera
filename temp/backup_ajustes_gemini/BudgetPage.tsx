import { CSSProperties, FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, MessageCircle, Send, Sparkles, Target, Zap } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

function normalizeHex(hex?: string, fallback = '#2563eb') {
  const value = String(hex || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;
}

function hexToRgb(hex: string) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => `${c}${c}`).join('') : raw;
  const int = Number.parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount = 0.2) {
  const { r, g, b } = hexToRgb(hex);
  const f = (channel: number) => Math.max(0, Math.round(channel * (1 - amount)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

export default function BudgetPage() {
  const { settings } = useAppData();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [projectType, setProjectType] = useState('');
  const [projectTypeOther, setProjectTypeOther] = useState('');
  const [matrixSize, setMatrixSize] = useState('');
  const [matrixSizeOther, setMatrixSizeOther] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [fabricTypeOther, setFabricTypeOther] = useState('');
  const [details, setDetails] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const primary = normalizeHex(settings.primary_color, '#2563eb');
  const secondary = normalizeHex(settings.secondary_color, '#1e293b');

  const bannerStyle = useMemo(() => {
    const deepPrimary = darken(primary, 0.22);
    return {
      backgroundImage: `
        radial-gradient(1200px 280px at 10% 100%, ${withAlpha(primary, 0.28)} 0%, transparent 60%),
        radial-gradient(700px 220px at 100% 0%, ${withAlpha(secondary, 0.28)} 0%, transparent 65%),
        linear-gradient(135deg, ${deepPrimary} 0%, ${primary} 62%, ${withAlpha(primary, 0.88)} 100%)
      `,
    } as CSSProperties;
  }, [primary, secondary]);

  const submitStyle = useMemo(() => {
    return {
      backgroundImage: `linear-gradient(90deg, ${primary} 0%, ${secondary} 100%)`,
      boxShadow: `0 14px 26px ${withAlpha(primary, 0.28)}`,
    } as CSSProperties;
  }, [primary, secondary]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);

    try {
      const resolvedProjectType = projectType === 'outro' ? `Outro: ${projectTypeOther}` : projectType;
      const resolvedMatrixSize = matrixSize === 'outro' ? `Outro: ${matrixSizeOther}` : matrixSize;
      const resolvedFabricType = fabricType === 'outro' ? `Outro: ${fabricTypeOther}` : fabricType;
      const extra = `Tipo de projeto: ${resolvedProjectType}\nTamanho da matriz: ${resolvedMatrixSize}\nBordar em: ${resolvedFabricType}\nDetalhes: ${details}`;
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
      setProjectType('');
      setProjectTypeOther('');
      setMatrixSize('');
      setMatrixSizeOther('');
      setFabricType('');
      setFabricTypeOther('');
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
      <section
        style={bannerStyle}
        className="relative overflow-hidden rounded-[2.25rem] border border-white/20 px-8 py-10 md:px-12 md:py-12 text-white shadow-2xl"
      >
        <div className="absolute right-8 top-8 hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25">
          <MessageCircle className="w-8 h-8 text-white" />
        </div>

        <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" /> Orcamento sob medida
        </p>
        <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-[-0.03em] max-w-4xl">
          Desenvolvimento profissional de matrizes de bordado
        </h1>
        <p className="mt-4 max-w-3xl text-sm md:text-base text-blue-100/95 font-semibold">
          <span className="block">Transforme sua arte em uma matriz otimizada e pronta para producao.</span>
          <span className="block">Analise detalhada de cada projeto para garantir acabamento superior e eficiencia na maquina.</span>
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Como funciona</h2>
            <div className="mt-5 space-y-4">
              {[
                'Voce envia a referencia com os detalhes tecnicos.',
                'Nossa equipe valida viabilidade, prazo e complexidade.',
                'Voce recebe retorno rapido e segue para producao.',
              ].map((step, idx) => (
                <div className="flex gap-3" key={step}>
                  <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl font-black text-white" style={{ backgroundColor: primary }}>
                    {idx + 1}
                  </span>
                  <p className="text-xs font-semibold text-slate-600">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Diferenciais</h3>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs font-semibold text-slate-600">
              <p className="inline-flex items-center gap-2 min-w-0"><Zap className="w-4 h-4 shrink-0" style={{ color: primary }} /> <span className="truncate">Atendimento agil</span></p>
              <p className="inline-flex items-center gap-2 min-w-0"><Target className="w-4 h-4 shrink-0" style={{ color: primary }} /> <span className="truncate">Proposta objetiva</span></p>
              <p className="inline-flex items-center gap-2 min-w-0"><Clock3 className="w-4 h-4 shrink-0" style={{ color: primary }} /> <span className="truncate">Prazo transparente</span></p>
              <p className="inline-flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 shrink-0" style={{ color: primary }} /> <span className="truncate">Escopo validado</span></p>
            </div>
          </div>
        </aside>

        <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">Enviar solicitacao de orcamento</h2>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="E-mail" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }} />
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required placeholder="WhatsApp com DDD" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select value={projectType} required onChange={(e) => setProjectType(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}>
                <option value="" disabled>Tipo de projeto</option>
                <option value="logo-marca">Logo/Marca</option>
                <option value="escrita">Escrita</option>
                <option value="frase">Frase</option>
                <option value="simbolo">Simbolo</option>
                <option value="brasao">Brasao</option>
                <option value="desenho">Desenho</option>
                <option value="outro">Outro</option>
              </select>
              <select value={matrixSize} required onChange={(e) => setMatrixSize(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}>
                <option value="" disabled>Tamanho da matriz</option>
                <option value="10cm">10cm</option>
                <option value="12cm">12cm</option>
                <option value="14cm">14cm</option>
                <option value="16cm">16cm</option>
                <option value="18cm">18cm</option>
                <option value="20cm">20cm</option>
                <option value="25cm">25cm</option>
                <option value="30cm">30cm</option>
                <option value="outro">Outro</option>
              </select>
              <select value={fabricType} required onChange={(e) => setFabricType(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2" style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}>
                <option value="" disabled>Bordar em</option>
                <option value="brim">Brim</option>
                <option value="malha-pv">Malha PV</option>
                <option value="malha-piquet">Malha Piquet</option>
                <option value="tecido-social">Tecido Social</option>
                <option value="couro">Couro</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            {(projectType === 'outro' || matrixSize === 'outro' || fabricType === 'outro') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  {projectType === 'outro' && (
                    <input
                      value={projectTypeOther}
                      onChange={(e) => setProjectTypeOther(e.target.value)}
                      placeholder="Descreva o tipo de projeto"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
                    />
                  )}
                </div>
                <div>
                  {matrixSize === 'outro' && (
                    <input
                      value={matrixSizeOther}
                      onChange={(e) => setMatrixSizeOther(e.target.value)}
                      placeholder="Informe o tamanho desejado"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
                    />
                  )}
                </div>
                <div>
                  {fabricType === 'outro' && (
                    <input
                      value={fabricTypeOther}
                      onChange={(e) => setFabricTypeOther(e.target.value)}
                      placeholder="Informe o tecido"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
                    />
                  )}
                </div>
              </div>
            )}

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Informe outras informacoes importantes para a producao."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
            />

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-end">
              <label className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 cursor-pointer flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-black text-white"
                  style={{ backgroundColor: primary }}
                >
                  Anexar referencia
                </span>
                <span className="min-w-0 truncate font-semibold text-slate-600">
                  {referenceImage?.name || 'Nenhum arquivo selecionado'}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf,.zip,.rar,.7z,application/zip,application/x-rar-compressed,application/x-7z-compressed"
                  onChange={(e) => setReferenceImage(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                style={submitStyle}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white transition-transform hover:-translate-y-0.5 disabled:opacity-70"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>

            {message && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-wider ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
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
