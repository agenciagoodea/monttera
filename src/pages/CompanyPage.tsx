import { CSSProperties, useMemo } from 'react';
import { Award, Building, Shield, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
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

export default function CompanyPage() {
  const { settings } = useAppData();
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

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <section
        style={bannerStyle}
        className="relative overflow-hidden rounded-[2.25rem] border border-white/20 px-8 py-10 md:px-12 md:py-12 text-white shadow-2xl"
      >
        <div className="absolute right-8 top-8 hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25">
          <Building className="w-8 h-8 text-white" />
        </div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" /> Institucional
        </p>
        <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-[-0.03em] max-w-4xl">
          {settings.home_company_title || 'Nossa Empresa'}
        </h1>
        <p className="mt-4 max-w-3xl text-sm md:text-base text-blue-100/95 font-semibold">
          {settings.home_company_subtitle || 'Qualidade e confianca em matrizes de bordado digital'}
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
        <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Quem somos</h2>
          <p className="mt-4 text-slate-700 text-base leading-relaxed font-medium">
            {settings.home_company_text || ''}
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Missao</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{settings.home_company_mission || ''}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Visao</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{settings.home_company_vision || ''}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valores</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{settings.home_company_values || ''}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {[Shield, Sparkles, Award, Target].map((Icon, idx) => (
              <span key={idx} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-600">
                <Icon className="w-5 h-5" />
              </span>
            ))}
          </div>

          <Link
            to={settings.home_company_cta_link || '/loja'}
            className="inline-flex mt-8 items-center gap-2 rounded-xl bg-primary text-white px-6 py-3 text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            {settings.home_company_cta_text || 'Conheca nossa colecao'}
          </Link>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] overflow-hidden border border-slate-100 bg-white shadow-sm">
            {settings.home_company_image_main ? (
              <img src={settings.home_company_image_main} alt="Nossa Empresa" className="w-full h-[300px] object-cover" loading="lazy" />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm font-bold text-slate-400">Imagem principal</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm">
              {settings.home_company_image_secondary ? (
                <img src={settings.home_company_image_secondary} alt="Nossa Empresa" className="w-full h-[140px] object-cover" loading="lazy" />
              ) : (
                <div className="h-[140px] flex items-center justify-center text-xs font-bold text-slate-400">Imagem secundaria</div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compromisso</p>
              <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
                Experiencia premium, arquivos protegidos e suporte proximo em cada etapa.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
