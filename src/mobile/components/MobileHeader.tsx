import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Search, Heart, User, Sparkles, Globe } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

export default function MobileHeader() {
  const { totalItems, totalPrice } = useCart();
  const { user } = useAuth();
  const { language, t, changeLanguage } = useI18n();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handleCloseLang = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleCloseLang);
    return () => document.removeEventListener('mousedown', handleCloseLang);
  }, []);

  const getLocalizedPath = (pathType: 'home' | 'favorites' | 'cart') => {
    const prefix = language === 'pt' ? '' : `/${language}`;
    switch (pathType) {
      case 'home': return prefix || '/';
      case 'favorites': return `${prefix}/favoritos`;
      case 'cart': return `${prefix}/${language === 'en' ? 'cart' : language === 'es' ? 'carrito' : 'carrinho'}`;
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-4 z-[100] transition-all duration-200">
      <div className="max-w-md w-full mx-auto flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to={getLocalizedPath('home')} className="flex items-center gap-2 group">
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

        {/* Ações da Direita */}
        <div className="flex items-center gap-2">
          {/* Seletor de Idioma Mobile */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="p-2 text-slate-500 hover:text-blue-600 active:scale-95 transition-all rounded-full hover:bg-slate-50 flex items-center justify-center cursor-pointer"
              aria-label="Selecionar Idioma"
            >
              <Globe className="w-6 h-6" />
            </button>
            {langMenuOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl py-1 z-50 text-slate-800 w-32 font-bold text-[10px]">
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

          {/* Link para Favoritos */}
          <Link 
            to={getLocalizedPath('favorites')} 
            className="p-2 text-slate-500 hover:text-red-500 active:scale-95 transition-all rounded-full hover:bg-slate-50 flex items-center justify-center"
            aria-label="Favoritos"
          >
            <Heart className="w-6 h-6" />
          </Link>

          {/* Carrinho de Compras */}
          <Link 
            to={getLocalizedPath('cart')} 
            className="relative p-2 text-slate-700 active:scale-95 transition-all rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center hover:border-blue-200"
            aria-label="Carrinho"
          >
            <ShoppingCart className="w-6 h-6 text-slate-700" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white font-extrabold text-[9px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce-short">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
