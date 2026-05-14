import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  Search, 
  Filter, 
  ChevronDown, 
  Calendar, 
  Package, 
  CheckCircle2, 
  Clock, 
  XCircle,
  AlertCircle,
  ArrowUpDown
} from 'lucide-react';

interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  total: number;
  status: string;
  payment_method: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
}

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  'pending': { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  'waiting_payment': { label: 'Aguardando Pagamento', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Calendar },
  'paid': { label: 'Pago', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  'rejected': { label: 'Recusado', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle },
  'cancelled': { label: 'Cancelado', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: XCircle },
  'refunded': { label: 'Reembolsado', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: AlertCircle },
};

export default function AdminOrderList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<{order: Order, items: OrderItem[]} | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      const data = await res.json();
      setSelectedOrder(data);
      setShowModal(true);
    } catch (error) {
      console.error('Failed to fetch order details:', error);
    }
  };

  const updateOrderStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchOrders();
        if (selectedOrder) {
          fetchOrderDetails(id);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const filteredOrders = orders.filter(o => 
    (o.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     o.id.toString().includes(searchTerm) ||
     o.user_email?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (statusFilter === 'all' || o.status === statusFilter)
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Gestão de Pedidos</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            Controle e acompanhamento das vendas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pedidos</p>
          <p className="text-2xl font-black text-slate-800">{orders.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagos</p>
          <p className="text-2xl font-black text-emerald-600">
            {orders.filter(o => o.status === 'paid').length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendentes</p>
          <p className="text-2xl font-black text-amber-600">
            {orders.filter(o => o.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-slate-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita Total</p>
          <p className="text-2xl font-black text-slate-800">
            R$ {orders.filter(o => o.status === 'paid').reduce((acc, o) => acc + o.total, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por cliente, e-mail ou #ID..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select 
              className="bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest px-4 py-3 focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos os Status</option>
              {Object.entries(statusMap).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedido</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8">
                      <div className="h-4 bg-slate-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : filteredOrders.map((order) => {
                const statusInfo = statusMap[order.status] || { label: order.status, color: 'bg-slate-100 text-slate-700', icon: Package };
                return (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-black text-slate-800">#{order.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{order.user_name}</span>
                        <span className="text-[10px] font-bold text-slate-400">{order.user_email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-slate-800">
                      R$ {(order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${statusInfo.color}`}>
                        <statusInfo.icon className="w-3 h-3" />
                        {statusInfo.label}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => fetchOrderDetails(order.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        title="Ver Detalhes"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredOrders.length === 0 && (
            <div className="p-20 text-center">
              <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Nenhum pedido encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Detalhes do Pedido */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Pedido #{selectedOrder.order.id}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {new Date(selectedOrder.order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{selectedOrder.order.user_email}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-3 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-2xl transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {/* Itens do Pedido */}
              <div className="space-y-4 mb-8">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Itens Comprados</h3>
                <div className="divide-y divide-slate-50">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{item.name}</span>
                          <span className="text-[10px] font-bold text-slate-400">Qtd: {item.quantity} x R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <span className="text-xs font-black text-slate-800 tracking-tight">R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Total do Pedido</span>
                  <span className="text-lg font-black text-blue-600">R$ {selectedOrder?.order?.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Status e Pagamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Informações de Pagamento</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Método:</span>
                      <span className="text-[10px] font-black text-slate-800 uppercase">{selectedOrder.order.payment_method || 'Não infirmado'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Transação:</span>
                      <span className="text-[10px] font-black text-slate-800 uppercase truncate max-w-[120px]">{selectedOrder.order.transaction_id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pago em:</span>
                      <span className="text-[10px] font-black text-slate-800 uppercase">
                        {selectedOrder.order.paid_at ? new Date(selectedOrder.order.paid_at).toLocaleDateString('pt-BR') : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Alterar Status</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(statusMap).map(([key, value]) => {
                      const isActive = selectedOrder.order.status === key;
                      const Icon = value.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => updateOrderStatus(selectedOrder.order.id, key)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            isActive 
                              ? 'bg-blue-600 text-white shadow-md' 
                              : 'bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {value.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setShowModal(false)}
                className="w-full py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-900 transition-all shadow-xl shadow-slate-900/10"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
