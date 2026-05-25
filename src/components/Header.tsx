import { ShoppingCart, User, Search, Heart, LogOut, ChevronRight, LayoutDashboard, ShoppingBag, Download, Loader2 } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function Header() {
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { totalItems, totalPrice } = useCart();
  const { totalFavorites } = useFavorites();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [topBarEnabled, setTopBarEnabled] = useState(true);
  const [topBarMessage, setTopBarMessage] = useState('Faça seu cadastro e baixe suas matrizes no painel ao lado. Aproveite!');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
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
          const response = await fetch(`/api/products/search?q=${encodeURIComponent(search.trim())}`);
          const data = await response.json();
          // Lida com array direto ou objeto com propriedade products
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
  }, [search]);

  // Fechar resultados ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && searchResults[activeIndex]) {
      navigate(`/produto/${searchResults[activeIndex].slug}`);
      setShowResults(false);
      setSearch('');
    } else if (search.trim()) {
      navigate(`/loja?q=${encodeURIComponent(search.trim())}`);
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
    navigate('/');
  };

  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleGlobalClick = () => setMenuOpen(false);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [menuOpen]);

  // URL do avatar: usa a foto real se disponível, senão gera via ui-avatars
  const avatarSrc = user
    ? (user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=007edb&color=fff`)
    : null;

  return (
    <header className="w-full">
      {/* Top Bar */}
      {topBarEnabled && topBarMessage && (
        <div className="bg-primary text-white py-2.5 px-4 md:px-10">
          <div className="max-w-[1440px] mx-auto relative flex items-center justify-center">
            <div className="text-[10px] md:text-xs font-black tracking-[0.14em] uppercase text-center animate-pulse bg-white/15 border border-white/20 rounded-full px-4 py-1.5 shadow-lg shadow-black/10">
              {topBarMessage}
            </div>
            <div className="hidden md:flex items-center gap-3 ml-4 absolute right-0 top-1/2 -translate-y-1/2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 50" width="28" height="19" className="rounded-sm shadow-sm opacity-90 hover:opacity-100 transition-opacity cursor-default" title="Brasil">
                <rect width="72" height="50" fill="#009B3A"/>
                <polygon points="36,4 68,25 36,46 4,25" fill="#FEDF00"/>
                <circle cx="36" cy="25" r="14" fill="#002776"/>
                <path d="M 23 28 Q 36 15 49 28 L 49 29 Q 36 16 23 29 Z" fill="#fff"/>
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="28" height="19" className="rounded-sm shadow-sm opacity-90 hover:opacity-100 transition-opacity cursor-default" title="Portugal">
                <rect width="240" height="400" fill="#006600"/>
                <rect x="240" width="360" height="400" fill="#ff0000"/>
                <circle cx="240" cy="200" r="85" fill="#ffcc00"/>
                <path d="M 190 150 L 290 150 L 290 220 Q 290 280 240 280 Q 190 280 190 220 Z" fill="#ffffff" stroke="#000000" strokeWidth="2"/>
                <circle cx="240" cy="200" r="10" fill="#0000ff"/>
                <circle cx="215" cy="200" r="10" fill="#0000ff"/>
                <circle cx="265" cy="200" r="10" fill="#0000ff"/>
                <circle cx="240" cy="175" r="10" fill="#0000ff"/>
                <circle cx="240" cy="225" r="10" fill="#0000ff"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="bg-white border-b border-blue-50 py-3 px-4 md:px-8 shadow-sm">
        <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row items-center xl:items-center justify-between gap-4">
          <div className="flex items-center gap-6 w-full xl:w-auto justify-between">
            {/* Logo */}
            <Link to="/" className="flex flex-col group shrink-0 min-w-[120px] xl:min-w-[130px]">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-10 xl:h-11 w-auto object-contain" />
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
              <Link to="/" className="hover:text-blue-600 transition-colors">Início</Link>
              <Link to="/loja" className="hover:text-blue-600 transition-colors">Loja</Link>
              <Link to="/nossa-empresa" className="hover:text-blue-600 transition-colors">Nossa Empresa</Link>
              <Link to="/orcamento" className="hover:text-blue-600 transition-colors">Orçamento</Link>
              <Link to="/contato" className="hover:text-blue-600 transition-colors">Contato</Link>
            </nav>

            <div className="flex items-center gap-4 lg:hidden">
              <Link to="/login">
                <User className="w-5 h-5 text-slate-500" />
              </Link>
              <ShoppingCart className="w-5 h-5 text-slate-500" />
            </div>
          </div>

          <div className="flex items-center gap-4 w-full xl:w-[480px] 2xl:w-[560px] relative" ref={searchRef}>
             <form onSubmit={handleSearch} className="relative flex-1 group">
                <input 
                  type="text" 
                  placeholder="Pesquise por uma palavra curta (ex.: policia, veterinária, enfermagem, carro, coleção) ..."
                  className="w-full pl-5 sm:pl-6 pr-14 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] sm:text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all font-medium placeholder:text-[9px] min-[420px]:placeholder:text-[10px] sm:placeholder:text-sm placeholder:tracking-tight"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(-1);
                  }}
                  onFocus={() => search.trim().length >= 2 && setShowResults(true)}
                  onKeyDown={handleKeyDown}
                />
                <button type="submit" className="absolute right-2 top-1.5 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
             </form>

             {/* Resultados da Busca Inteligente */}
             {showResults && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                 {isSearching ? (
                   <div className="p-8 text-center">
                     <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando as melhores matrizes...</p>
                   </div>
                 ) : searchResults.length > 0 ? (
                   <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                     <div className="p-2 border-b border-slate-50 bg-slate-50/50">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3">Sugestões Encontradas</span>
                     </div>
                     {searchResults.map((product, index) => (
                       <Link
                         key={product.id}
                         to={`/produto/${product.slug}`}
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
                           <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-sm font-bold text-slate-800 truncate">{product.name}</p>
                           <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">{product.category_name}</p>
                         </div>
                         <div className="text-right">
                           <p className="text-xs font-black text-slate-900">
                             R$ {Number(product.sale_price || product.price).toFixed(2)}
                           </p>
                         </div>
                       </Link>
                     ))}
                     <Link 
                       to={`/loja?q=${encodeURIComponent(search.trim())}`}
                       className="block p-3 text-center bg-slate-50 hover:bg-blue-50 text-[11px] font-black text-blue-600 uppercase tracking-widest transition-colors"
                     >
                       Ver todos os resultados para "{search}"
                     </Link>
                   </div>
                 ) : (
                   <div className="p-8 text-center">
                     <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                     <p className="text-sm font-bold text-slate-800">Nenhum produto encontrado</p>
                     <p className="text-xs text-slate-400 mt-1">Tente buscar por termos diferentes ou mais genéricos.</p>
                   </div>
                 )}
               </div>
             )}
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {/* Área do usuário com dropdown */}
            <div className="flex items-center gap-3">
              {/* Avatar + Dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                {/* Trigger: avatar + texto */}
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
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">Minha Conta</span>
                    {user ? (
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1 whitespace-nowrap">
                        Olá, {user.name.split(' ')[0]}
                        <ChevronRight className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-90' : ''}`} />
                      </span>
                    ) : (
                      <Link to="/login" className="text-xs font-bold text-slate-800 hover:text-blue-600 transition-colors whitespace-nowrap">Olá, Entrar</Link>
                    )}
                  </div>
                </div>

                {/* Dropdown menu */}
                {user && (
                  <div className={`absolute top-full right-0 mt-3 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl py-2 transition-all duration-200 z-50 ${
                    menuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2 pointer-events-none'
                  }`}>
                    {/* Cabeçalho do dropdown com foto */}
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50 rounded-t-2xl">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                        <img src={avatarSrc!} alt={user.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{user.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold truncate">{user.email}</p>
                      </div>
                    </div>

                    <div className="p-2 space-y-1">
                      {user.type === 'user' && (
                        <Link to="/admin" className="w-full text-left px-3 py-2 text-[11px] font-black text-blue-600 uppercase tracking-wider hover:bg-blue-50 rounded-lg flex items-center gap-2 border-b border-slate-100/50">
                          <LayoutDashboard className="w-3.5 h-3.5" /> Painel Admin
                        </Link>
                      )}
                      <Link to="/minha-conta" className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <User className="w-3.5 h-3.5" /> Minha Conta
                      </Link>
                      <Link to="/minha-conta/pedidos" className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <ShoppingBag className="w-3.5 h-3.5" /> Pedidos
                      </Link>
                      <Link to="/minha-conta/downloads" className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <Download className="w-3.5 h-3.5" /> Matrizes Compradas
                      </Link>
                      <Link to="/favoritos" className="w-full text-left px-3 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 rounded-lg flex items-center gap-2">
                        <Heart className="w-3.5 h-3.5" /> Favoritos
                      </Link>
                      <div className="pt-1 mt-1 border-t border-slate-100">
                        <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-[11px] font-black text-red-500 uppercase tracking-wider hover:bg-red-50 rounded-lg flex items-center gap-2">
                          <LogOut className="w-3.5 h-3.5" /> Sair
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Link to="/carrinho" className="flex items-center gap-3 bg-white border border-slate-200 pl-4 pr-1.5 py-1.5 rounded-full hover:border-blue-300 transition-all font-bold group">
                <span className="text-sm text-slate-700 whitespace-nowrap">R$ {totalPrice.toFixed(2)}</span>
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


