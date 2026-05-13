import { FormEvent, useEffect, useState } from 'react';
import { Clock3, Mail, MapPin, MessageCircle, PhoneCall, Send } from 'lucide-react';

type PublicSettings = {
  email_contact?: string;
  phone?: string;
  address?: string;
  site_name?: string;
};

export default function ContactPage() {
  const [settings, setSettings] = useState<PublicSettings>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        setSettings(data || {});
      } catch (error) {
        console.error('Failed to load contact settings:', error);
      }
    }
    loadSettings();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setStatus(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      setStatus({ type: 'success', text: 'Mensagem recebida! Nosso time retornara em breve.' });
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      setStatus({ type: 'error', text: 'Nao foi possivel enviar sua mensagem no momento.' });
    } finally {
      setSending(false);
    }
  };

  const contactEmail = settings.email_contact || 'contato@digitalbordados.com.br';
  const contactPhone = settings.phone || '(91) 992426-1982';
  const contactAddress = settings.address || 'Atendimento online em todo o Brasil';

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <section className="rounded-[2.25rem] border border-slate-100 bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 px-8 py-10 md:px-12 md:py-12 text-white shadow-2xl shadow-blue-900/20">
        <h1 className="text-3xl md:text-5xl font-black tracking-[-0.03em] max-w-4xl">Contato direto com especialistas em matrizes</h1>
        <p className="mt-4 max-w-3xl text-sm md:text-base text-blue-100/90 font-semibold">
          Fale com nosso time para suporte tecnico, duvidas comerciais, orientacao de compra e acompanhamento de pedidos.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Canais oficiais</h2>
            <div className="mt-5 space-y-4 text-sm">
              <p className="flex items-start gap-3 text-slate-700 font-semibold"><Mail className="w-4 h-4 mt-0.5 text-blue-600" /> {contactEmail}</p>
              <p className="flex items-start gap-3 text-slate-700 font-semibold"><PhoneCall className="w-4 h-4 mt-0.5 text-blue-600" /> {contactPhone}</p>
              <p className="flex items-start gap-3 text-slate-700 font-semibold"><MapPin className="w-4 h-4 mt-0.5 text-blue-600" /> {contactAddress}</p>
              <p className="flex items-start gap-3 text-slate-700 font-semibold"><Clock3 className="w-4 h-4 mt-0.5 text-blue-600" /> Seg a Sex, 8h as 18h</p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Atendimento rapido</h3>
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Para orcamento de matriz personalizada, use tambem a pagina de Orcamento para anexar referencia.
            </p>
            <a
              href="/orcamento"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white hover:bg-blue-700 transition"
            >
              <MessageCircle className="w-4 h-4" /> Ir para Orcamento
            </a>
          </div>
        </aside>

        <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">Envie sua mensagem</h2>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome"
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />

            <textarea
              required
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem com o maximo de detalhes para agilizar o atendimento."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />

            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-700 hover:to-cyan-600 disabled:opacity-70"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Enviando...' : 'Enviar mensagem'}
            </button>

            {status && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-wider ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
              >
                {status.text}
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}

