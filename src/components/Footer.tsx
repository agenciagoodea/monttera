import { Facebook, Instagram, Youtube, ShieldCheck, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { useI18n } from '../contexts/I18nContext';

export default function Footer() {
  const { settings } = useAppData();
  const { t, language } = useI18n();

  const normalizeExternalUrl = (url?: string) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value.replace(/^\/+/, '')}`;
  };

  const facebookUrl = normalizeExternalUrl(settings.facebook_url);
  const instagramUrl = normalizeExternalUrl(settings.instagram_url);
  const youtubeUrl = normalizeExternalUrl(settings.youtube_url);

  const getLocalizedPath = (pathType: string) => {
    const prefix = language === 'pt' ? '' : `/${language}`;
    switch (pathType) {
      case 'home': return prefix || '/';
      case 'shop': return `${prefix}/${language === 'en' ? 'shop' : language === 'es' ? 'tienda' : 'loja'}`;
      case 'about_us': return `${prefix}/${language === 'en' ? 'about-us' : language === 'es' ? 'nuestra-empresa' : 'nossa-empresa'}`;
      case 'quote': return `${prefix}/${language === 'en' ? 'quote' : language === 'es' ? 'presupuesto' : 'orcamento'}`;
      case 'contact': return `${prefix}/${language === 'en' ? 'contact' : language === 'es' ? 'contacto' : 'contato'}`;
      case 'favorites': return `${prefix}/favoritos`;
      case 'cart': return `${prefix}/${language === 'en' ? 'cart' : language === 'es' ? 'carrito' : 'carrinho'}`;
      case 'privacy': return `${prefix}/${language === 'en' ? 'policy' : 'politica'}`;
      case 'help': return `${prefix}/${language === 'en' ? 'help' : language === 'es' ? 'ayuda' : 'ajuda'}`;
      case 'my_account': return `${prefix}/${language === 'en' ? 'my-account' : language === 'es' ? 'mi-cuenta' : 'minha-conta'}`;
      default: return prefix || '/';
    }
  };

  return (
    <footer className="bg-primary text-white pt-24 pb-12 px-6 md:px-10 mt-32 relative overflow-hidden">
      {/* Subtle Background Decoration */}
      <div className="absolute top-0 left-0 w-full h-1 bg-white/10"></div>
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-black/5 rounded-full blur-3xl"></div>

      <div className="max-w-[1440px] mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-16 mb-20">
          
          {/* Brand & Intro */}
          <div className="lg:col-span-5 space-y-10">
            <Link to={getLocalizedPath('home')} className="flex flex-col group">
              {settings.logo_url ? (
                <div className="bg-white/95 p-6 rounded-3xl w-fit shadow-xl shadow-black/10">
                  <img src={settings.logo_url} alt={settings.site_name} className="h-36 w-auto object-contain" />
                </div>
              ) : (
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-white leading-none tracking-tighter uppercase">
                    DIGITAL<span className="text-white/60 font-light">BORDADOS</span>
                  </span>
                  <span className="text-[10px] font-black text-white/40 tracking-[0.4em] -mt-0.5">EXCELÊNCIA EM MATRIZES</span>
                </div>
              )}
            </Link>
            
            <p className="text-white/70 text-base leading-relaxed font-medium max-w-md">
              {t('footer.intro_text')}
            </p>

            <div className="flex items-center gap-4">
              {facebookUrl && (
                <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center hover:bg-white hover:text-primary transition-all duration-300 shadow-lg border border-white/5">
                  <Facebook className="w-6 h-6" />
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center hover:bg-white hover:text-primary transition-all duration-300 shadow-lg border border-white/5">
                  <Instagram className="w-6 h-6" />
                </a>
              )}
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center hover:bg-white hover:text-primary transition-all duration-300 shadow-lg border border-white/5">
                  <Youtube className="w-6 h-6" />
                </a>
              )}
            </div>
          </div>

          {/* Links Column 1 */}
          <div className="lg:col-span-3">
            <h4 className="text-white font-black mb-10 uppercase text-xs tracking-[0.3em] opacity-50">{t('common.my_account')}</h4>
            <ul className="space-y-5 text-sm font-bold">
              <li><Link to={getLocalizedPath('my_account')} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('menu.dashboard')}</Link></li>
              <li><Link to={`${getLocalizedPath('my_account')}/pedidos`} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('menu.orders')}</Link></li>
              <li><Link to={`${getLocalizedPath('my_account')}/downloads`} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('menu.downloads')}</Link></li>
              <li><Link to={`${getLocalizedPath('my_account')}/enderecos`} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('menu.addresses')}</Link></li>
              <li><Link to={`${getLocalizedPath('my_account')}/perfil`} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('menu.profile')}</Link></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="lg:col-span-2">
            <h4 className="text-white font-black mb-10 uppercase text-xs tracking-[0.3em] opacity-50">Menu</h4>
            <ul className="space-y-5 text-sm font-bold">
              <li><Link to={getLocalizedPath('home')} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('common.home')}</Link></li>
              <li><Link to={getLocalizedPath('shop')} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('common.shop')}</Link></li>
              <li><Link to={getLocalizedPath('quote')} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('common.quote')}</Link></li>
              <li><Link to={getLocalizedPath('contact')} className="flex items-center gap-3 text-white/80 hover:text-white hover:translate-x-2 transition-all"><Package className="w-4 h-4 text-white/30" /> {t('common.contact')}</Link></li>
            </ul>
          </div>

          {/* Payment Methods */}
          <div className="lg:col-span-2">
            <h4 className="text-white font-black mb-10 uppercase text-xs tracking-[0.3em] opacity-50">{t('checkout_page.payment_method')}</h4>
            <div className="flex items-center justify-start">
              <div className="bg-white/95 p-5 rounded-[2.2rem] w-fit shadow-xl shadow-black/10 flex items-center justify-center hover:scale-105 transition-transform duration-300">
                <img 
                  src="/uploads/pagamentos.webp" 
                  alt="Payment options" 
                  className="h-16 w-auto object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-12 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center lg:text-left">
            <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">
              {new Date().getFullYear()} © {settings.site_name || 'Digital Bordados'} E-commerce
            </p>
            <p className="text-[9px] font-medium text-white/30 uppercase tracking-[0.2em]">
              Av. Fortaleza, 90 - Bairro Novo CEP 66010-000 - Belém/PA. {t('common.all_rights_reserved')}
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center items-center gap-10">
             <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <span className="text-[10px] font-black text-white/80 uppercase tracking-widest leading-tight">
                   {t('common.secure_environment')}<br/>
                   <span className="text-[8px] text-white/40 font-bold uppercase tracking-widest">{t('common.ssl_protection')}</span>
                </span>
             </div>
             <div className="flex gap-8 text-[11px] font-black text-white/60 uppercase tracking-widest">
                <Link to={getLocalizedPath('privacy')} className="hover:text-white transition-colors">{t('common.privacy')}</Link>
                <Link to={getLocalizedPath('help')} className="hover:text-white transition-colors">{t('common.help')}</Link>
             </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
