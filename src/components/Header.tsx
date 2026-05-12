import { Search, ShoppingCart, User, Heart, LogOut, LayoutDashboard, ShoppingBag } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function Header() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const { user, logout } = useAuth();
  const { totalItems, totalPrice } = useCart();
  const { totalFavorites } = useFavorites();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setSearch(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data && data.logo_url) {
          setLogoUrl(data.logo_url);
        }
      } catch (err) {
        console.error('Failed to fetch logo:', err);
      }
    }
    fetchBranding();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/?q=${encodeURIComponent(search.trim())}`);
    } else {
      navigate('/');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="w-full">
      {/* Top Bar */}
      <div className="bg-primary text-white py-1.5 text-center text-[10px] font-bold tracking-widest uppercase">
        Novas Matrizes Semanais • Ganhe 10% de desconto com o cupom: BEMVINDO
      </div>

      {/* Main Header */}
      <div className="bg-white border-b border-blue-50 py-4 px-6 md:px-10 shadow-sm">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-10 w-full lg:w-auto justify-between">
            {/* Logo */}
            <Link to="/" className="flex flex-col group min-w-[200px]">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain" />
              ) : (
                <>
                  <span className="text-2xl font-black text-primary leading-none tracking-tighter uppercase group-hover:text-blue-800 transition-colors">
                    DIGITAL<span className="text-blue-400 font-light">BORDADOS</span>
                  </span>
                  <span className="text-[9px] font-extrabold text-slate-400 tracking-[0.3em] -mt-0.5">EXCELÊNCIA EM MATRIZES</span>
                </>
              )}
            </Link>

            <nav className="hidden xl:flex items-center gap-6 text-sm font-bold text-slate-600">
              <Link to="/" className="hover:text-blue-600 transition-colors">Início</Link>
              <Link to="/loja" className="hover:text-blue-600 transition-colors">Loja</Link>
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

          <div className="flex items-center gap-4 w-full max-w-2xl">
             <form onSubmit={handleSearch} className="relative flex-1 group">
                <input 
                  type="text" 
                  placeholder="Buscar matrizes (ex: Flor, Urso, Logotipo)..." 
                  className="w-full pl-6 pr-14 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="absolute right-2 top-1.5 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-sm">
                  <Search className="w-4 h-4" />
                </button>
             </form>
          </div>

          <div className="hidden lg:flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 relative group cursor-pointer">
                {user ? (
                   <img 
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=007edb&color=fff`} 
                    alt={user.name}
                    className="w-full h-full rounded-full"
                   />
                ) : (
                  <User className="w-5 h-5 text-slate-400" />
                )}
                
                {user && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="px-4 py-2 border-b border-slate-50">
                      <p className="text-xs font-black text-slate-800 truncate">{user.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold truncate">{user.email}</p>
                    </div>
                    {(user as any).type === 'customer' && (
                      <Link to="/minha-conta" className="w-full text-left px-4 py-2 text-[11px] font-black text-slate-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                        <ShoppingBag className="w-3 h-3" /> Meus Pedidos
                      </Link>
                    )}
                    {user.type === 'user' && (
                      <Link to="/admin" className="w-full text-left px-4 py-2 text-[11px] font-black text-blue-600 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                        <LayoutDashboard className="w-3 h-3" /> Painel Admin
                      </Link>
                    )}
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-[11px] font-black text-red-500 uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
                      <LogOut className="w-3 h-3" /> Sair
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Minha Conta</span>
                {user ? (
                  <Link to={user.type === 'user' ? '/admin' : '/minha-conta'} className="text-xs font-bold text-slate-800 hover:text-blue-600 transition-colors">
                    Olá, {user.name.split(' ')[0]}
                  </Link>
                ) : (
                  <Link to="/login" className="text-xs font-bold text-slate-800 hover:text-blue-600 transition-colors">Olá, Entrar</Link>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Link to="/favoritos" className="p-2 text-slate-400 hover:text-red-500 transition-colors relative" title="Favoritos">
                <Heart className="w-6 h-6" />
                {totalFavorites > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold border border-white">
                    {totalFavorites > 99 ? '99+' : totalFavorites}
                  </span>
                )}
              </Link>
              
              <Link to="/carrinho" className="flex items-center gap-3 bg-white border border-slate-200 pl-4 pr-1.5 py-1.5 rounded-full hover:border-blue-300 transition-all font-bold group">
                <span className="text-sm text-slate-700">R$ {totalPrice.toFixed(2)}</span>
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
