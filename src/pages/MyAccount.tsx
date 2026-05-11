import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingBag, Download, Package, ChevronRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../lib/utils';

export default function MyAccount() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'downloads'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [ordersRes, downloadsRes] = await Promise.all([
          fetch('/api/customer/orders'),
          fetch('/api/customer/downloads')
        ]);
        const ordersData = await ordersRes.json();
        const downloadsData = await downloadsRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setDownloads(Array.isArray(downloadsData) ? downloadsData : []);
      } catch (error) {
        console.error('Failed to fetch account data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Pago';
      case 'pending': return 'Pendente';
      case 'waiting_payment': return 'Aguardando';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-10 py-10 w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg w-fit mb-2 block">Painel do Cliente</span>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Minha Conta</h1>
          <p className="text-slate-500 font-medium">Bem vindo de volta, <span className="text-slate-900 font-bold">{user?.name}</span></p>
        </div>

        <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
           <button 
             onClick={() => setActiveTab('orders')}
             className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
               activeTab === 'orders' 
               ? 'bg-white text-blue-600 shadow-sm border border-slate-100' 
               : 'text-slate-400 hover:text-slate-600'
             }`}
           >
             Meus Pedidos
           </button>
           <button 
             onClick={() => setActiveTab('downloads')}
             className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
               activeTab === 'downloads' 
               ? 'bg-white text-blue-600 shadow-sm border border-slate-100' 
               : 'text-slate-400 hover:text-slate-600'
             }`}
           >
             Meus Downloads
           </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : activeTab === 'orders' ? (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-20 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6">
                 <ShoppingBag className="w-8 h-8" />
               </div>
               <h3 className="text-lg font-black text-slate-800 uppercase mb-2">Nenhum pedido encontrado</h3>
               <p className="text-slate-400 text-sm font-medium">Você ainda não realizou nenhuma compra em nossa loja.</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pedido #{order.id}</p>
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-8">
                     <div className="flex flex-col">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                       <div className="flex items-center gap-1.5">
                         {getStatusIcon(order.status)}
                         <span className="text-xs font-black text-slate-700 uppercase">{getStatusLabel(order.status)}</span>
                       </div>
                     </div>
                     <div className="flex flex-col">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                       <span className="text-sm font-black text-blue-600">{formatCurrency(order.total)}</span>
                     </div>
                     
                     {order.status === 'pending' && (
                       <button 
                         onClick={async () => {
                           await fetch(`/api/dev/approve-order/${order.id}`, { method: 'POST' });
                           window.location.reload();
                         }}
                         className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-sm"
                       >
                         Pagar (Dev)
                       </button>
                     )}

                     <button className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                       <ChevronRight className="w-5 h-5" />
                     </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {downloads.length === 0 ? (
            <div className="col-span-full bg-white rounded-[2.5rem] border border-slate-100 p-20 flex flex-col items-center justify-center text-center">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6">
                 <Download className="w-8 h-8" />
               </div>
               <h3 className="text-lg font-black text-slate-800 uppercase mb-2">Sem downloads ativos</h3>
               <p className="text-slate-400 text-sm font-medium">Após o pagamento aprovado, suas matrizes aparecerão aqui.</p>
            </div>
          ) : (
            downloads.map(file => (
              <div key={file.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all">
                 <div className="aspect-square bg-slate-50 relative overflow-hidden">
                    <img src={file.image} alt={file.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <button 
                         onClick={() => window.open(file.file_path, '_blank')}
                         className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2"
                       >
                         <Download className="w-4 h-4" /> Baixar Agora
                       </button>
                    </div>
                 </div>
                 <div className="p-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Liberado em #{file.order_id}</p>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{file.name}</h4>
                 </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
