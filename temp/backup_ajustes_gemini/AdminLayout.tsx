import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Tag, 
  Users, 
  ShoppingCart, 
  BarChart3, 
  Settings, 
  LogOut,
  ChevronRight,
  Mail,
  Activity,
  ShieldCheck
} from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, login, loading, logout } = useAuth();
  const { settings } = useAppData();
  const location = useLocation();

  if (loading) return <div>Carregando...</div>;

  if (!user || user.type !== 'user') {
    return <Navigate to="/login" replace />;
  }

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
    { icon: Package, label: 'Produtos', path: '/admin/produtos' },
    { icon: Tag, label: 'Categorias', path: '/admin/categorias' },
    { icon: Tag, label: 'Tags', path: '/admin/tags' },
    { icon: ShoppingCart, label: 'Pedidos', path: '/admin/pedidos' },
    { icon: Users, label: 'Clientes', path: '/admin/clientes' },
    { icon: BarChart3, label: 'Relatórios', path: '/admin/relatorios' },
    { icon: Settings, label: 'Configurações', path: '/admin/configuracoes' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Admin */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 shadow-sm">
        <div className="p-8 pb-10">
          <Link to="/" className="flex flex-col items-center group">
            {settings.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt={settings.site_name || 'Logo'} 
                className="max-h-12 w-auto object-contain transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl shadow-lg">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-black text-white tracking-tighter uppercase">
                  Digital<span className="text-blue-500">Admin</span>
                </span>
              </div>
            )}
            <span className="text-[8px] font-black text-slate-400 tracking-[0.4em] mt-3 uppercase text-center w-full opacity-60">
              Gestão Profissional
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all group ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-6 px-2">
            <img 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=f1f5f9&color=334155`} 
              alt={user.name}
              className="w-10 h-10 rounded-full border border-slate-200"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-black text-slate-800 truncate uppercase tracking-tight">{user.name}</span>
              <span className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-wider">{user.role}</span>
            </div>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Main Content Admin */}
      <main className="flex-1 ml-72 p-10">
        {children}
      </main>
    </div>
  );
}
