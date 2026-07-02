import React from 'react';
import { Home, Grid, Search, ShoppingCart, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

export default function MobileBottomNav() {
  const location = useLocation();
  const { totalItems } = useCart();
  const { user } = useAuth();
  const { language, t } = useI18n();
  const currentPath = location.pathname;

  const getLocalizedPath = (pathType: string) => {
    const prefix = language === 'pt' ? '' : `/${language}`;
    switch (pathType) {
      case 'home': return prefix || '/';
      case 'categories': return `${prefix}/${language === 'en' ? 'categories' : 'categorias'}`;
      case 'search': return `${prefix}/${language === 'en' ? 'search' : 'busca'}`;
      case 'cart': return `${prefix}/${language === 'en' ? 'cart' : language === 'es' ? 'carrito' : 'carrinho'}`;
      case 'account': return user 
        ? `${prefix}/${language === 'en' ? 'my-account' : language === 'es' ? 'mi-cuenta' : 'minha-conta'}`
        : `${prefix}/login`;
      default: return prefix || '/';
    }
  };

  const navItems = [
    {
      label: t('common.home'),
      icon: Home,
      path: getLocalizedPath('home')
    },
    {
      label: language === 'pt' ? 'Categorias' : language === 'en' ? 'Categories' : 'Categorías',
      icon: Grid,
      path: getLocalizedPath('categories')
    },
    {
      label: language === 'pt' ? 'Buscar' : language === 'en' ? 'Search' : 'Buscar',
      icon: Search,
      path: getLocalizedPath('search')
    },
    {
      label: t('common.cart'),
      icon: ShoppingCart,
      path: getLocalizedPath('cart'),
      badge: totalItems
    },
    {
      label: language === 'pt' ? 'Conta' : language === 'en' ? 'Account' : 'Cuenta',
      icon: User,
      path: getLocalizedPath('account')
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-around px-2 z-[100] shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
      <div className="max-w-md w-full mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path || 
            (item.path !== '/' && currentPath.startsWith(item.path));

          return (
            <Link
              key={item.label}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 active:scale-90 transition-all duration-150 select-none relative group"
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'text-blue-600 bg-blue-50/50 scale-105' 
                  : 'text-slate-400 group-hover:text-slate-600'
              }`}>
                <Icon className="w-5 h-5 stroke-[2.25]" />
              </div>
              
              <span className={`text-[9px] font-black tracking-tight mt-0.5 uppercase transition-colors duration-200 ${
                isActive ? 'text-blue-600 font-extrabold' : 'text-slate-400'
              }`}>
                {item.label}
              </span>

              {/* Badge Dinâmico */}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1 right-[22%] bg-red-500 text-white font-extrabold text-[8px] min-w-[16px] h-4 rounded-full flex items-center justify-center border border-white shadow-sm">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
