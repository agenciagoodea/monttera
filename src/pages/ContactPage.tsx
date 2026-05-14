import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { Clock3, Mail, MapPin, MessageCircle, PhoneCall, Send, Sparkles } from 'lucide-react';

type PublicSettings = {
  email_contact?: string;
  phone?: string;
  address?: string;
  site_name?: string;
  primary_color?: string;
  secondary_color?: string;
  contact_hours?: string;
  contact_whatsapp?: string;
};

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

function onlyDigits(text: string) {
  return String(text || '').replace(/\D/g, '');
}

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

  const contactEmail = settings.email_contact || 'contato@digitalbordados.com.br';
  const contactPhone = settings.phone || '(91) 992426-1982';
  const contactAddress = settings.address || 'Atendimento online em todo o Brasil';
  const contactHours = settings.contact_hours || 'Seg a Sex, 8h as 18h';
  const contactWhatsapp = settings.contact_whatsapp || contactPhone;
  const whatsappLink = onlyDigits(contactWhatsapp);

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
          <Sparkles className="h-3.5 w-3.5" /> Atendimento especializado
        </p>
        <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-[-0.03em] max-w-4xl">
          Contato direto com especialistas em matrizes
        </h1>
        <p className="mt-4 max-w-3xl text-sm md:text-base text-blue-100/95 font-semibold">
          Fale com nosso time para suporte tecnico, duvidas comerciais, orientacao de compra e acompanhamento de pedidos.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Canais oficiais</h2>
            <div className="mt-5 space-y-4 text-sm">
              <p className="flex items-start gap-3 text-slate-700 font-semibold">
                <Mail className="w-4 h-4 mt-0.5" style={{ color: primary }} /> {contactEmail}
              </p>
              <p className="flex items-start gap-3 text-slate-700 font-semibold">
                <PhoneCall className="w-4 h-4 mt-0.5" style={{ color: primary }} /> {contactPhone}
              </p>
              {whatsappLink ? (
                <a
                  href={`https://wa.me/${whatsappLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 text-slate-700 font-semibold hover:opacity-85 transition-opacity"
                >
                  <MessageCircle className="w-4 h-4 mt-0.5" style={{ color: primary }} />
                  {contactWhatsapp}
                </a>
              ) : null}
              <p className="flex items-start gap-3 text-slate-700 font-semibold">
                <MapPin className="w-4 h-4 mt-0.5" style={{ color: primary }} /> {contactAddress}
              </p>
              <p className="flex items-start gap-3 text-slate-700 font-semibold">
                <Clock3 className="w-4 h-4 mt-0.5" style={{ color: primary }} /> {contactHours}
              </p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Atendimento rapido</h3>
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Para orcamento de matriz personalizada, use tambem a pagina de Orcamento para anexar referencia.
            </p>
            <a
              href="/orcamento"
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primary }}
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
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
                style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
                style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
              />
            </div>

            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
            />

            <textarea
              required
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem com o maximo de detalhes para agilizar o atendimento."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: withAlpha(primary, 0.28) }}
            />

            <button
              type="submit"
              disabled={sending}
              style={submitStyle}
              className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-black text-white transition-transform hover:-translate-y-0.5 disabled:opacity-70"
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
