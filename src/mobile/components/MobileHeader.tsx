import React, { useState, useEffect } from 'react';
import { ShoppingCart, Search, Heart, User, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';

export default function MobileHeader() {
  const { totalItems, totalPrice } = useCart();
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data && data.logo_url) {
          setLogoUrl(data.logo_url);
        }
      } catch (err) {
        console.error('Failed to fetch branding for mobile header:', err);
      }
    }
    fetchBranding();
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-4 z-[100] transition-all duration-200">
      <div className="max-w-md w-full mx-auto flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
          ) : (
            <div className="flex flex-col">
              <span className="text-xl font-black text-blue-600 tracking-tighter uppercase leading-none">
                DIGITAL<span className="text-blue-400 font-light">BORDADOS</span>
              </span>
              <span className="text-[7px] font-black text-slate-400 tracking-[0.2em]">EXCELÊNCIA EM MATRIZES</span>
            </div>
          )}
        </Link>

        {/* Ações da Direita (Favoritos & Carrinho) */}
        <div className="flex items-center gap-4">
          {/* Link para Favoritos */}
          <Link 
            to="/favoritos" 
            className="p-2 text-slate-500 hover:text-red-500 active:scale-95 transition-all rounded-full hover:bg-slate-50 flex items-center justify-center"
            aria-label="Favoritos"
          >
            <Heart className="w-7 h-7" />
          </Link>

          {/* Carrinho de Compras com badge dinâmico */}
          <Link 
            to="/carrinho" 
            className="relative p-2 text-slate-700 active:scale-95 transition-all rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center hover:border-blue-200"
            aria-label="Carrinho"
          >
            <ShoppingCart className="w-7 h-7 text-slate-700" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white font-extrabold text-[10px] w-5.5 h-5.5 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce-short">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
