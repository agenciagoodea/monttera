import { ShoppingCart, User, Search, Heart, LogOut, ChevronRight, LayoutDashboard, ShoppingBag, Download, Loader2, Globe } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';

export default function Header() {
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { totalItems, totalPrice } = useCart();
  const { totalFavorites } = useFavorites();
  const { language, t, changeLanguage } = useI18n();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [topBarEnabled, setTopBarEnabled] = useState(true);
  const [topBarMessage, setTopBarMessage] = useState('Faça seu cadastro e baixe suas matrizes no painel ao lado. Aproveite!');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setSearch(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data) {
          if (data.logo_url) setLogoUrl(data.logo_url);
          if (data.top_bar_enabled !== undefined) setTopBarEnabled(data.top_bar_enabled === 'true');
          if (data.top_bar_message !== undefined) setTopBarMessage(data.top_bar_message);
        }
      } catch (err) {
        console.error('Failed to fetch logo:', err);
      }
    }
    fetchBranding();
  }, []);

  // Busca inteligente com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.trim().length >= 2) {
        setIsSearching(true);
        setShowResults(true);
        try {
          const response = await fetch(`/api/products/search?q=${encodeURIComponent(search.trim())}&locale=${language}`);
          const data = await response.json();
          setSearchResults(Array.isArray(data) ? data : (data.products || []));
        } catch (error) {
          console.error('Erro na busca:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, language]);

  // Fechar resultados ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && searchResults[activeIndex]) {
      const p = searchResults[activeIndex];
      const productSlug = language === 'pt' ? p.slug : language === 'en' ? (p.slug_en || p.slug) : (p.slug_es || p.slug);
      const prefix = language === 'pt' ? '' : `/${language}`;
      const routeWord = language === 'en' ? 'product' : language === 'es' ? 'producto' : 'produto';
      navigate(`${prefix}/${routeWord}/${productSlug}`);
      setShowResults(false);
      setSearch('');
    } else if (search.trim()) {
      const prefix = language === 'pt' ? '' : `/${language}`;
      const shopWord = language === 'en' ? 'shop' : language === 'es' ? 'tienda' : 'loja';
      navigate(`${prefix}/${shopWord}?q=${encodeURIComponent(search.trim())}`);
      setShowResults(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    const prefix = language === 'pt' ? '' : `/${language}`;
    navigate(prefix || '/');
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleGlobalClick = () => setMenuOpen(false);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [menuOpen]);

  const avatarSrc = user
    ? (user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=007edb&color=fff`)
    : null;

  // Relação de moedas com base na taxa de câmbio fictícia
  const getFormattedPrice = (price: number) => {
    const symbol = t('common.currency_symbol');
    if (language === 'pt') {
      return `${symbol}${price.toFixed(2)}`;
    }
    const rate = 5.20; // 1 USD = 5.20 BRL
    const converted = price / rate;
    return `${symbol}${converted.toFixed(2)}`;
  };

  const getLocalizedPath = (pathType: 'home' | 'shop' | 'about_us' | 'quote' | 'contact' | 'favorites' | 'cart' | 'login' | 'register' | 'my_account') => {
    const prefix = language === 'pt' ? '' : `/${language}`;
    switch (pathType) {
      case 'home': return prefix || '/';
      case 'shop': return `${prefix}/${language === 'en' ? 'shop' : language === 'es' ? 'tienda' : 'loja'}`;
      case 'about_us': return `${prefix}/${language === 'en' ? 'about-us' : language === 'es' ? 'nuestra-empresa' : 'nossa-empresa'}`;
      case 'quote': return `${prefix}/${language === 'en' ? 'quote' : language === 'es' ? 'presupuesto' : 'orcamento'}`;
      case 'contact': return `${prefix}/${language === 'en' ? 'contact' : language === 'es' ? 'contacto' : 'contato'}`;
      case 'favorites': return `${prefix}/favoritos`; // favoritos se mantém igual
      case 'cart': return `${prefix}/${language === 'en' ? 'cart' : language === 'es' ? 'carrito' : 'carrinho'}`;
      case 'login': return `${prefix}/login`;
      case 'register': return `${prefix}/${language === 'es' ? 'cadastro' : 'register'}`;
      case 'my_account': return `${prefix}/${language === 'en' ? 'my-account' : language === 'es' ? 'mi-cuenta' : 'minha-conta'}`;
    }
  };

  return (
    <header className="w-full">
      {/* Top Bar */}
      {topBarEnabled && topBarMessage && (
        <div className="bg-primary text-white py-2.5 px-4 md:px-10">
          <div className="max-w-[1440px] mx-auto relative flex items-center justify-center">
            <div className="text-[10px] md:text-xs font-black tracking-[0.14em] uppercase text-center animate-pulse bg-white/15 border border-white/20 rounded-full px-4 py-1.5 shadow-lg shadow-black/10">
              {topBarMessage}
            </div>
            <div className="hidden md:flex items-center gap-3 ml-4 absolute right-0 top-1/2 -translate-y-1/2" ref={langRef}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all border border-white/15 cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {language === 'pt' ? '🇧🇷 Português' : language === 'en' ? '🇺🇸 English' : '🇪🇸 Español'}
                </button>
                {langMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl py-1 z-50 text-slate-800 w-36 font-semibold text-[11px]">
                    <button
                      onClick={() => { changeLanguage('pt'); setLangMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${language === 'pt' ? 'text-blue-600 font-bold' : ''}`}
                    >
                      <span>🇧🇷</span> Português
                    </button>
                    <button
                      onClick={() => { changeLanguage('en'); setLangMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${language === 'en' ? 'text-blue-600 font-bold' : ''}`}
                    >
                      <span>🇺🇸</span> English
                    </button>
                    <button
                      onClick={() => { changeLanguage('es'); setLangMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer ${language === 'es' ? 'text-blue-600 font-bold' : ''}`}
                    >
                      <span>🇪🇸</span> Español
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="bg-white border-b border-blue-50 py-3 px-4 md:px-8 shadow-sm">
        <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row items-center xl:items-center justify-between gap-4">
          <div className="flex items-center gap-6 w-full xl:w-auto justify-between">
            {/* Logo */}
            <Link to={getLocalizedPath('home')!} className="flex flex-col group shrink-0 min-w-[140px] xl:min-w-[160px]">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-12 xl:h-16 w-auto object-contain" />
              ) : (
                <>
                  <span className="text-4xl font-black text-primary leading-none tracking-tighter uppercase group-hover:text-blue-800 transition-colors">
                    DIGITAL<span className="text-blue-400 font-light">BORDADOS</span>
                  </span>
                  <span className="text-[12px] font-extrabold text-slate-400 tracking-[0.3em] -mt-1">EXCELÊNCIA EM MATRIZES</span>
                </>
              )}
            </Link>

            <nav className="hidden xl:flex items-center gap-5 text-sm font-bold text-slate-600 whitespace-nowrap">
              <Link to={getLocalizedPath('home')!} className="hover:text-blue-600 transition-colors">{t('common.home')}</Link>
              <Link to={getLocalizedPath('shop')!} className="hover:text-blue-600 transition-colors">{t('common.shop')}</Link>
              <Link to={getLocalizedPath('about_us')!} className="hover:text-blue-600 transition-colors">{t('common.about_us')}</Link>
              <Link to={getLocalizedPath('quote')!} className="hover:text-blue-600 transition-colors">{t('common.quote')}</Link>
              <Link to={getLocalizedPath('contact')!} className="hover:text-blue-600 transition-colors">{t('common.contact')}</Link>
            </nav>

            <div className="flex items-center gap-4 lg:hidden">
              <Link to={getLocalizedPath('login')!}>
                <User className="w-5 h-5 text-slate-500" />
              </Link>
              <ShoppingCart className="w-5 h-5 text-slate-500" />
            </div>
          </div>

          <div className="flex items-center gap-4 w-full xl:w-[480px] 2xl:w-[560px] relative" ref={searchRef}>
             <form onSubmit={handleSearch} className="relative flex-1 group">
                <input 
                  type="text" 
                  placeholder={t('common.search_placeholder')}
                  className="w-full pl-5 sm:pl-6 pr-14 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] sm:text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all font-medium placeholder:text-[9px] min-[420px]:placeholder:text-[10px] sm:placeholder:text-sm placeholder:tracking-tight"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(-1);
                  }}
                  onFocus={() => search.trim().length >= 2 && setShowResults(true)}
                  onKeyDown={handleKeyDown}
                />
                <button type="submit" className="absolute right-2 top-1.5 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 cursor-pointer">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
             </form>

             {/* Resultados da Busca Inteligente */}
             {showResults && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                 {isSearching ? (
                   <div className="p-8 text-center">
                     <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('common.loading')}</p>
                   </div>
                 ) : searchResults.length > 0 ? (
                   <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                     <div className="p-2 border-b border-slate-50 bg-slate-50/50">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3">{t('common.search_results')}</span>
                     </div>
                     {searchResults.map((product, index) => {
                       const pSlug = language === 'pt' ? product.slug : language === 'en' ? (product.slug_en || product.slug) : (product.slug_es || product.slug);
                       const pName = language === 'pt' ? product.name : language === 'en' ? (product.name_en || product.name) : (product.name_es || product.name);
                       const cName = language === 'pt' ? product.category_name : language === 'en' ? (product.category_name_en || product.category_name) : (product.category_name_es || product.category_name);
                       const prefix = language === 'pt' ? '' : `/${language}`;
                       const routeWord = language === 'en' ? 'product' : language === 'es' ? 'producto' : 'produto';

                       return (
                         <Link
                           key={product.id}
                           to={`${prefix}/${routeWord}/${pSlug}`}
                           onClick={() => {
                             setShowResults(false);
                             setSearch('');
                           }}
                           onMouseEnter={() => setActiveIndex(index)}
                           className={`flex items-center gap-4 p-3 transition-all ${
                             index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                           }`}
                         >
                           <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 bg-white">
                             <img src={product.image} alt={pName} className="w-full h-full object-cover" />
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold text-slate-800 truncate">{pName}</p>
                             <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">{cName}</p>
                           </div>
                           <div className="text-right">
                             <p className="text-xs font-black text-slate-900">
                               {getFormattedPrice(Number(product.sale_price || product.price))}
                             </p>
                           </div>
                         </Link>
                       );
                     })}
                     <Link 
                       to={`${getLocalizedPath('shop')}?q=${encodeURIComponent(search.trim())}`}
                       className="block p-3 text-center bg-slate-50 hover:bg-blue-50 text-[11px] font-black text-blue-600 uppercase tracking-widest transition-colors"
                     >
                       {t('common.search_results')} "{search}"
                     </Link>
                   </div>
                 ) : (
                   <div className="p-8 text-center">
                     <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                     <p className="text-sm font-bold text-slate-800">{t('common.no_results')}</p>
                     <p className="text-xs text-slate-400 mt-1">{t('common.no_results_sub')}</p>
                   </div>
                 )}
               </div>
             )}
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {/* Área do usuário com dropdown */}
            <div className="flex items-center gap-3">
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <div 
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-100 shadow-sm flex-shrink-0 bg-slate-50 group-hover:border-blue-200 transition-colors">
                    {user && avatarSrc ? (
                      <img src={avatarSrc} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">{t('common.my_account')}</span>
                    {user ? (
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1 whitespace-nowrap">
                        {t('common.hello')}, {user.name.split(' ')[0]}
                        <ChevronRight className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-90' : ''}`} />
                      </span>
                    ) : (
                      <Link to={getLocalizedPath('login')!} className="text-xs font-bold text-slate-800 hover:text-blue-600 transition-colors whitespace-nowrap">{t('common.login')}</Link>
                    )}
                  </div>
                </div>

                {/* Dropdown menu */}
                {user && (
                  <div className={`absolute top-full right-0 mt-3 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl py-2 transition-all duration-200 z-50 ${
                    menuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2 pointer-events-none'
                  }`}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50 rounded-t-2xl">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                        {avatarSrc && <img src={avatarSrc} alt={user.name} className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{user.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold truncate">{user.email}</p>
                      </div>
                    </div>

                    <div className="p-2 space-y-1">
                      {user.role === 'admin' && (
                        <Link to="/admin" className="w-full text-left px-3 py-2 text-[11px] font-black text-blue-600 uppercase tracking-wider hover:bg-blue-50 rounded-lg flex items-center gap-2 border-b border-slate-100/50">
                          <LayoutDashboard className="w-3.5 h-3.5" /> {t('menu.admin_dashboard')}
                        </Link>
                      )}
                      <Link to={getLocalizedPath('my_account')!} className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <User className="w-3.5 h-3.5" /> {t('menu.dashboard')}
                      </Link>
                      <Link to={`${getLocalizedPath('my_account')}/pedidos`} className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <ShoppingBag className="w-3.5 h-3.5" /> {t('menu.orders')}
                      </Link>
                      <Link to={`${getLocalizedPath('my_account')}/downloads`} className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <Download className="w-3.5 h-3.5" /> {t('menu.downloads')}
                      </Link>
                      <Link to={getLocalizedPath('favorites')!} className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <Heart className="w-3.5 h-3.5" /> {t('common.favorites')}
                      </Link>
                      <div className="pt-1 mt-1 border-t border-slate-100">
                        <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-[11px] font-black text-red-500 uppercase tracking-wider hover:bg-red-50 rounded-lg flex items-center gap-2 cursor-pointer">
                          <LogOut className="w-3.5 h-3.5" /> {t('common.logout')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Link to={getLocalizedPath('cart')!} className="flex items-center gap-3 bg-white border border-slate-200 pl-4 pr-1.5 py-1.5 rounded-full hover:border-blue-300 transition-all font-bold group">
                <span className="text-sm text-slate-700 whitespace-nowrap">{getFormattedPrice(totalPrice)}</span>
                <div className="relative bg-blue-600 p-2 rounded-full text-white shadow-md group-hover:scale-105 transition-transform">
                  <ShoppingCart className="w-4 h-4" />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold border-2 border-white">
                      {totalItems}
                    </span>
                  )}
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
