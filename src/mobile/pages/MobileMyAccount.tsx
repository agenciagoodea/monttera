import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { User, ShieldCheck, Download, ShoppingBag, MapPin, Lock, LogOut, Loader2, Check, AlertCircle, FileText, ChevronDown, Heart, ExternalLink } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

type TabType = 'downloads' | 'orders' | 'address' | 'profile' | 'favorites';

export default function MobileMyAccount() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType | null>('downloads');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');

  // Estados dos dados do usuário
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    avatarUrl: '',
  });

  const [favorites, setFavorites] = useState<any[]>([]);

  const [passwordState, setPasswordState] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [address, setAddress] = useState({
    zip_code: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
  });

  const [downloads, setDownloads] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  // Carregar todos os dados de faturamento, pedidos e downloads
  useEffect(() => {
    async function loadAccountData() {
      setLoading(true);
      try {
        const [accRes, ordersRes, downloadsRes, favsRes] = await Promise.all([
          fetch('/api/customer/account'),
          fetch('/api/customer/orders'),
          fetch('/api/customer/downloads'),
          fetch('/api/favorites'),
        ]);

        const accData = accRes.ok ? await accRes.json() : null;
        const ordersData = ordersRes.ok ? await ordersRes.json() : [];
        const downloadsData = downloadsRes.ok ? await downloadsRes.json() : [];
        const favsData = favsRes.ok ? await favsRes.json() : { favorites: [] };

        setOrders(ordersData);
        setDownloads(downloadsData);
        setFavorites(favsData.favorites || []);

        const uData = accData?.user ?? accData;
        if (uData && !uData.error) {
          const [firstName, ...rest] = String(uData.name || '').split(' ');
          setProfile({
            firstName: uData.first_name || firstName || '',
            lastName: uData.last_name || rest.join(' ') || '',
            email: uData.email || user?.email || '',
            avatarUrl: uData.avatar_url || '',
          });

          setAddress({
            zip_code: uData.billing_zip || '',
            street: uData.billing_address || '',
            number: uData.billing_number || '',
            neighborhood: uData.billing_neighborhood || '',
            city: uData.billing_city || '',
            state: uData.billing_state || '',
          });
        }
      } catch (error) {
        console.error('Failed to load customer account data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user) loadAccountData();
  }, [user]);

  const handleCepBlur = async () => {
    const cep = address.zip_code.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setAddress(prev => ({
            ...prev,
            street: data.logradouro || prev.street,
            neighborhood: data.bairro || prev.neighborhood,
            city: data.localidade || prev.city,
            state: data.uf || prev.state,
          }));
        }
      } catch (e) {}
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    setStatusType('');
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: profile.firstName,
          last_name: profile.lastName,
          display_name: `${profile.firstName} ${profile.lastName}`.trim(),
          email: profile.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'Erro ao atualizar perfil.');
        setStatusType('error');
        return;
      }
      setStatusMessage('Perfil atualizado com sucesso!');
      setStatusType('success');
    } catch {
      setStatusMessage('Erro ao atualizar perfil.');
      setStatusType('error');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    setStatusType('');
    if (passwordState.newPassword !== passwordState.confirmPassword) {
      setStatusMessage('As senhas não coincidem.');
      setStatusType('error');
      return;
    }
    try {
      const res = await fetch('/api/customer/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: passwordState.currentPassword,
          new_password: passwordState.newPassword,
          confirm_new_password: passwordState.confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'Erro ao alterar senha.');
        setStatusType('error');
        return;
      }
      setStatusMessage('Senha alterada com sucesso!');
      setStatusType('success');
      setPasswordState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      setStatusMessage('Erro ao alterar senha.');
      setStatusType('error');
    }
  };

  const handleUpdateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    setStatusType('');
    try {
      const billingPayload = {
        address: address.street,
        number: address.number,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zip: address.zip_code.replace(/\D/g, ''),
        country: 'BR',
      };
      const res = await fetch('/api/customer/addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing: billingPayload,
          shipping: billingPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'Erro ao salvar endereço.');
        setStatusType('error');
        return;
      }
      setStatusMessage('Endereço salvo com sucesso!');
      setStatusType('success');
    } catch {
      setStatusMessage('Erro ao salvar endereço.');
      setStatusType('error');
    }
  };

  const handleLogoutClick = async () => {
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    const first = profile.firstName ? profile.firstName[0] : '';
    const last = profile.lastName ? profile.lastName[0] : '';
    return (first + last).toUpperCase() || 'U';
  };

  const toggleSection = (tab: TabType) => {
    if (activeTab === tab) {
      setActiveTab(null);
    } else {
      setActiveTab(tab);
    }
    setStatusMessage('');
    setStatusType('');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Carregando Painel...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Visual Header do Perfil Incrível */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white rounded-[2.5rem] p-6 shadow-xl shadow-blue-500/10 relative overflow-hidden flex items-center gap-4">
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        
        {/* Avatar Redondo - Exibe imagem real se disponível */}
        <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-xl font-black text-white shadow-md overflow-hidden flex-shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{getUserInitials()}</span>
          )}
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full w-max text-[8px] font-black uppercase tracking-widest">
            Cliente VIP
          </div>
          <h2 className="text-base font-black truncate leading-tight uppercase">
            {profile.firstName} {profile.lastName || user?.name}
          </h2>
          <p className="text-[10px] text-blue-100 truncate font-semibold">
            {profile.email || user?.email}
          </p>
        </div>
      </section>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold ${
          statusType === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-rose-50 border border-rose-100 text-rose-600'
        }`}>
          {statusType === 'success' ? <Check className="w-4.5 h-4.5" /> : <AlertCircle className="w-4.5 h-4.5" />}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Accordion List System (Estilo Sanfona Premium) */}
      <div className="flex flex-col gap-3.5">
        
        {/* 1. SEÇÃO: DOWNLOADS */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.01)] overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('downloads')}
            className="w-full px-5 py-4.5 flex items-center justify-between text-left active:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Meus Downloads</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Matrizes liberadas</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {downloads.length} Matrizes
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${activeTab === 'downloads' ? 'rotate-180 text-blue-600' : ''}`} />
            </div>
          </button>

          {activeTab === 'downloads' && (
            <div className="p-5 border-t border-slate-50 bg-slate-50/20 flex flex-col gap-4 animate-fade-in duration-200">
              {downloads.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {downloads.map((item) => (
                    <div key={item.id} className="bg-white rounded-2xl border border-slate-50 p-4 shadow-sm flex items-start gap-3">
                      <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden flex-shrink-0">
                        <img src={item.product_image || ''} alt={item.product_name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">
                          {item.product_name}
                        </h4>
                        <span className="text-[8px] font-extrabold text-slate-400 block mt-0.5 uppercase">
                          Pedido: #{item.order_id} • Formatos inclusos
                        </span>
                        <div className="mt-2.5 flex flex-col gap-2">
                          <a
                            href={`/api/customer/download-file?path=${encodeURIComponent(item.file_path || '')}`}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-md shadow-emerald-50 active:scale-95 transition-all text-center"
                          >
                            <Download className="w-3.5 h-3.5" /> Baixar ZIP
                          </a>
                          {item.production_sheet && (
                            <a
                              href={item.production_sheet}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-md shadow-rose-50 active:scale-95 transition-all text-center"
                            >
                              <FileText className="w-3.5 h-3.5" /> Folha de Produção
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center">
                  <Download className="w-10 h-10 text-slate-200 mb-2" />
                  <p className="text-slate-500 font-black uppercase tracking-wider text-[9px] mb-1">
                    Nenhum download liberado.
                  </p>
                  <p className="text-slate-400 font-medium text-[8px]">
                    Seu download será liberado assim que o pagamento for confirmado!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. SEÇÃO: PEDIDOS */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.01)] overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('orders')}
            className="w-full px-5 py-4.5 flex items-center justify-between text-left active:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Histórico de Pedidos</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Histórico de compras</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {orders.length} Pedidos
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${activeTab === 'orders' ? 'rotate-180 text-blue-600' : ''}`} />
            </div>
          </button>

          {activeTab === 'orders' && (
            <div className="p-5 border-t border-slate-50 bg-slate-50/20 flex flex-col gap-4 animate-fade-in duration-200">
              {orders.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {orders.map((order) => {
                    const isApproved = order.status === 'approved' || order.status === 'completed';
                    const isPending = order.status === 'pending';
                    return (
                      <div key={order.id} className="bg-white rounded-2xl border border-slate-50 p-4 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">Pedido #{order.id}</span>
                          <span className={`text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            isApproved ? 'bg-emerald-50 text-emerald-600' : isPending ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {isApproved ? 'Aprovado' : isPending ? 'Pendente' : order.status}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-2 border-t border-slate-50">
                          <span>Total: <strong className="text-slate-800 font-black">{formatCurrency(Number(order.total_price))}</strong></span>
                          <span>Método: {String(order.payment_method).toUpperCase()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center">
                  <ShoppingBag className="w-10 h-10 text-slate-200 mb-2" />
                  <p className="text-slate-500 font-black uppercase tracking-wider text-[9px] mb-1">
                    Nenhum pedido efetuado.
                  </p>
                  <p className="text-slate-400 font-medium text-[8px]">
                    Você ainda não realizou compras na nossa loja.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. SEÇÃO: FAVORITOS */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.01)] overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('favorites')}
            className="w-full px-5 py-4.5 flex items-center justify-between text-left active:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center">
                <Heart className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Meus Favoritos</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Matrizes salvas</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-black bg-rose-50 text-rose-500 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {favorites.length} Itens
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${activeTab === 'favorites' ? 'rotate-180 text-rose-500' : ''}`} />
            </div>
          </button>

          {activeTab === 'favorites' && (
            <div className="p-5 border-t border-slate-50 bg-slate-50/20 flex flex-col gap-4 animate-fade-in duration-200">
              {favorites.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {favorites.map((item) => (
                    <Link
                      key={item.product_id}
                      to={`/produto/${item.product_slug || item.product_id}?mobile=true`}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden active:scale-[0.97] transition-transform"
                    >
                      <div className="w-full aspect-square bg-slate-50 overflow-hidden">
                        <img src={item.product_image || ''} alt={item.product_name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2.5">
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight line-clamp-2 leading-tight block">
                          {item.product_name}
                        </span>
                        <span className="text-[8px] font-black text-blue-600 mt-1 block">
                          {formatCurrency(Number(item.product_price || 0))}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center">
                  <Heart className="w-10 h-10 text-slate-200 mb-2" />
                  <p className="text-slate-500 font-black uppercase tracking-wider text-[9px] mb-1">
                    Nenhum favorito salvo.
                  </p>
                  <p className="text-slate-400 font-medium text-[8px]">
                    Toque no coração em qualquer produto para salvar aqui!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. SEÇÃO: ENDEREÇO */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.01)] overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('address')}
            className="w-full px-5 py-4.5 flex items-center justify-between text-left active:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Endereço de Faturamento</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Dados para envio e NF</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${address.zip_code ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                {address.zip_code ? 'Cadastrado' : 'Pendente'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${activeTab === 'address' ? 'rotate-180 text-blue-600' : ''}`} />
            </div>
          </button>

          {activeTab === 'address' && (
            <div className="p-5 border-t border-slate-50 bg-slate-50/20 flex flex-col gap-4 animate-fade-in duration-200">
              <form onSubmit={handleUpdateAddress} className="flex flex-col gap-4">
                <div className="flex flex-col gap-3.5">
                  {/* CEP */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                    <input
                      type="text"
                      placeholder="00000-000"
                      value={address.zip_code}
                      onChange={(e) => setAddress(prev => ({ ...prev, zip_code: e.target.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2') }))}
                      onBlur={handleCepBlur}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                    />
                  </div>

                  {/* Rua */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Rua/Avenida</label>
                    <input
                      type="text"
                      placeholder="Nome da rua"
                      value={address.street}
                      onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                    />
                  </div>

                  {/* Numero e Bairro */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Número</label>
                      <input
                        type="text"
                        placeholder="Ex: 123"
                        value={address.number}
                        onChange={(e) => setAddress(prev => ({ ...prev, number: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                      <input
                        type="text"
                        placeholder="Nome do bairro"
                        value={address.neighborhood}
                        onChange={(e) => setAddress(prev => ({ ...prev, neighborhood: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      />
                    </div>
                  </div>

                  {/* Cidade e Estado */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
                      <input
                        type="text"
                        placeholder="Sua cidade"
                        value={address.city}
                        onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                      <input
                        type="text"
                        placeholder="UF"
                        value={address.state}
                        onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-center"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all mt-2"
                  >
                    Salvar Endereço
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* 4. SEÇÃO: PERFIL & SEGURANÇA */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.01)] overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('profile')}
            className="w-full px-5 py-4.5 flex items-center justify-between text-left active:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Meus Dados & Segurança</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Alterar perfil e senha de acesso</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Editar
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${activeTab === 'profile' ? 'rotate-180 text-blue-600' : ''}`} />
            </div>
          </button>

          {activeTab === 'profile' && (
            <div className="p-5 border-t border-slate-50 bg-slate-50/20 flex flex-col gap-6 animate-fade-in duration-200">
              {/* Dados Pessoais */}
              <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1">
                  <User className="w-4 h-4 text-blue-600" /> Alterar Dados Pessoais
                </h4>

                <div className="flex flex-col gap-3.5">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                      <input
                        type="text"
                        required
                        value={profile.firstName}
                        onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Sobrenome</label>
                      <input
                        type="text"
                        required
                        value={profile.lastName}
                        onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                    <input
                      type="email"
                      required
                      value={profile.email}
                      onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all mt-2"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>

              {/* Segurança/Senha */}
              <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4 pt-4 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1">
                  <Lock className="w-4 h-4 text-blue-600" /> Alterar Senha
                </h4>

                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Atual</label>
                    <input
                      type="password"
                      required
                      value={passwordState.currentPassword}
                      onChange={(e) => setPasswordState(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                    <input
                      type="password"
                      required
                      value={passwordState.newPassword}
                      onChange={(e) => setPasswordState(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Nova Senha</label>
                    <input
                      type="password"
                      required
                      value={passwordState.confirmPassword}
                      onChange={(e) => setPasswordState(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder="Confirmar senha"
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all mt-2"
                  >
                    Atualizar Senha
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

      </div>

      {/* Botão de Logout de Alta Fidelidade */}
      <button
        onClick={handleLogoutClick}
        className="w-full bg-rose-50 text-rose-600 border border-rose-100 py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:bg-rose-100 transition-colors shadow-sm"
      >
        <LogOut className="w-4.5 h-4.5" /> Sair da minha conta
      </button>
    </div>
  );
}
