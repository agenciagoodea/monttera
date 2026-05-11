import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ShoppingCart, 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  RefreshCcw,
  ArrowUpRight,
  Mail,
  UserPlus,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import axios from 'axios';

interface DashboardData {
  stats: {
    totalSales: number;
    paidOrders: number;
    activeProducts: number;
    totalCustomers: number;
  };
  recentOrders: any[];
  salesChart: any[];
  activities: any[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/dashboard/stats');
      setData(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError(err?.response?.data?.error || 'Falha ao carregar dados do dashboard. Verifique a conexão com o banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin" />
          <div className="absolute inset-0 bg-blue-500/20 blur-xl animate-pulse rounded-full"></div>
        </div>
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest animate-pulse">Sincronizando métricas...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl shadow-red-500/10">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">Ops! Algo deu errado.</h2>
        <p className="text-slate-500 max-w-md mb-8 font-medium">{error}</p>
        <button 
          onClick={fetchData}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-3"
        >
          <RefreshCcw className="w-4 h-4" />
          Tentar Novamente
        </button>
      </div>
    );
  }

  const statsCards = [
    { 
      label: 'Volume de Vendas', 
      value: `R$ ${(data?.stats?.totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
      icon: TrendingUp, 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-500/10',
      trend: '+12.5%',
      description: 'Vendas aprovadas'
    },
    { 
      label: 'Pedidos Pagos', 
      value: (data?.stats?.paidOrders || 0).toString(), 
      icon: CheckCircle2, 
      color: 'text-blue-500', 
      bg: 'bg-blue-500/10',
      trend: '+5.2%',
      description: 'Total acumulado'
    },
    { 
      label: 'Matrizes Ativas', 
      value: (data?.stats?.activeProducts || 0).toLocaleString('pt-BR'), 
      icon: Package, 
      color: 'text-amber-500', 
      bg: 'bg-amber-500/10',
      trend: 'Estável',
      description: 'Catálogo atual'
    },
    { 
      label: 'Base de Clientes', 
      value: (data?.stats?.totalCustomers || 0).toLocaleString('pt-BR'), 
      icon: Users, 
      color: 'text-indigo-500', 
      bg: 'bg-indigo-500/10',
      trend: '+18',
      description: 'Usuários ativos'
    },
  ];

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '...';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (minutes < 1) return 'agora mesmo';
      if (minutes < 60) return `há ${minutes} min`;
      if (hours < 24) return `há ${hours}h`;
      return `há ${days} dias`;
    } catch {
      return '...';
    }
  };

  const getStatusColor = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pago' || s === 'paid' || s === 'completed' || s === 'success') return 'bg-emerald-100 text-emerald-700';
    if (s === 'pending' || s === 'pendente') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Dashboard
            <span className="text-xs font-black bg-blue-600 text-white px-3 py-1 rounded-full uppercase tracking-widest">Live</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">Acompanhe a performance da Digital Bordados em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <div className="hidden lg:flex items-center gap-2 px-5 py-2.5 bg-slate-900 rounded-2xl text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-slate-900/20">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>Hoje, {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, i) => (
          <div 
            key={i} 
            className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-blue-200/40 transition-all duration-500 cursor-default"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${stat.color} ${stat.bg} border border-transparent group-hover:border-current transition-all`}>
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <h2 className="text-2xl font-black text-slate-900 mb-1">{stat.value}</h2>
              <p className="text-[11px] font-bold text-slate-400">{stat.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Sales Chart Section */}
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden relative">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Tendência de Vendas</h3>
                <p className="text-xs font-bold text-slate-400">Faturamento bruto nos últimos 7 dias</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase">
                <ArrowUpRight className="w-3 h-3" />
                Crescimento Positivo
              </div>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.salesChart || []}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                    tickFormatter={(val) => {
                        try {
                            return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                        } catch {
                            return val;
                        }
                    }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}}
                    tickFormatter={(val) => `R$ ${val}`}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold'}}
                    formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR')}`, 'Vendas']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#3b82f6" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Orders Table */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Pedidos Recentes</h3>
                <p className="text-xs font-bold text-slate-400">Acompanhe as últimas transações do sistema</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors">
                Ver Todos <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                    <th className="px-8 py-5">Identificador</th>
                    <th className="px-8 py-5">Cliente</th>
                    <th className="px-8 py-5">Valor Total</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data?.recentOrders?.map((order, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <span className="text-xs font-black text-slate-800">#{order.id}</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-900">{order.display_name}</span>
                          <span className="text-[10px] font-bold text-slate-400">{order.customer_email}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-black text-slate-900">
                          R$ {Number(order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase">
                          {formatTime(order.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!data?.recentOrders || data.recentOrders.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold italic">Nenhum pedido encontrado ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Section */}
        <div className="space-y-8">
          {/* Promo Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/40 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-2 uppercase leading-none">Novas<br/>Possibilidades</h3>
              <p className="text-blue-100 text-sm font-medium mb-8 leading-relaxed">Seu sistema está pronto para escalar. Que tal criar uma nova coleção?</p>
              <button className="bg-white text-blue-600 px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-900/20">
                Criar Produto
              </button>
            </div>
            <Package className="absolute -bottom-10 -right-10 w-48 h-48 text-white/10 group-hover:rotate-12 transition-transform duration-1000" />
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/40">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Atividade Recente</h3>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
            </div>
            
            <div className="relative space-y-8 before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-50">
              {data?.activities?.map((activity, i) => (
                <div key={i} className="relative flex gap-4 group">
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center z-10 shadow-sm border border-white ${
                    activity.type === 'order' ? 'bg-blue-50 text-blue-600' : 
                    activity.type === 'email' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {activity.type === 'order' ? <ShoppingCart className="w-5 h-5" /> : 
                     activity.type === 'email' ? <Mail className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  </div>
                  <div className="flex flex-col pt-1">
                    <p className="text-xs font-black text-slate-800 leading-snug group-hover:text-blue-600 transition-colors">
                      {activity.message}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {formatTime(activity.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {(!data?.activities || data.activities.length === 0) && (
                <p className="text-center text-slate-400 text-xs font-bold py-10 italic">Nenhuma atividade recente.</p>
              )}
            </div>
            
            <button className="w-full mt-10 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 hover:text-slate-700 transition-all">
              Ver Log Completo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


