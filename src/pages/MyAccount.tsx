import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronRight,
  Download,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPinHouse,
  Package,
  ShoppingBag,
  UserCircle2,
  UserRound,
  Eye,
  EyeOff,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

type AccountTab = 'dashboard' | 'orders' | 'downloads' | 'address' | 'profile' | 'wishlist';

type AddressForm = {
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type CustomerOrder = {
  id: number;
  created_at: string;
  status: string;
  total: number;
  total_items: number;
};

type CustomerOrderDetailItem = {
  id: number;
  product_id: number | null;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  quantity: number;
  price: number;
};

type CustomerOrderDetail = {
  order: {
    id: number;
    created_at: string;
    updated_at?: string;
    status: string;
    total: number;
    payment_method?: string | null;
    transaction_id?: string | null;
  };
  items: CustomerOrderDetailItem[];
};

type CustomerDownload = {
  download_id: number;
  order_id: number;
  product_id: number | null;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  production_sheet: string | null;
  file_path: string | null;
  file_name: string | null;
};

type FavoriteItem = {
  product_id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  sale_price?: number | null;
};

type AccountUser = {
  id: number;
  name: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  avatar_url?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  billing_country?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

export default function MyAccount() {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<AccountTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAddresses, setSavingAddresses] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [downloads, setDownloads] = useState<CustomerDownload[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrderDetail | null>(null);
  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false);
  const [orderDetailMessage, setOrderDetailMessage] = useState('');

  const [profileMessage, setProfileMessage] = useState<string>('');
  const [passwordMessage, setPasswordMessage] = useState<string>('');
  const [addressMessage, setAddressMessage] = useState<string>('');

  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    display_name: '',
    email: '',
    phone: '',
    cpf: '',
  });

  const [billingAddress, setBillingAddress] = useState<AddressForm>({
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'Brasil',
  });

  const [shippingAddress, setShippingAddress] = useState<AddressForm>({
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'Brasil',
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  });

  const [showPassword, setShowPassword] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  useEffect(() => {
    if (location.pathname.endsWith('/pedidos')) return setActiveTab('orders');
    if (location.pathname.endsWith('/downloads')) return setActiveTab('downloads');
    if (location.pathname.endsWith('/enderecos')) return setActiveTab('address');
    if (location.pathname.endsWith('/perfil')) return setActiveTab('profile');
    if (location.pathname.endsWith('/lista-de-desejos')) return setActiveTab('wishlist');
    setActiveTab('dashboard');
  }, [location.pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login?redirect=/minha-conta');
      return;
    }

    let mounted = true;
    async function loadAccountData() {
      setLoading(true);
      try {
        const [accountRes, ordersRes, downloadsRes, favoritesRes] = await Promise.all([
          fetch('/api/customer/account'),
          fetch('/api/customer/orders'),
          fetch('/api/customer/downloads'),
          fetch('/api/favorites'),
        ]);

        const accountData = await accountRes.json();
        const ordersData = await ordersRes.json();
        const downloadsData = await downloadsRes.json();
        const favoritesData = await favoritesRes.json();

        if (!mounted) return;

        const userData: AccountUser | null = accountData?.user || null;
        setAccountUser(userData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setDownloads(Array.isArray(downloadsData) ? downloadsData : []);
        setFavorites(Array.isArray(favoritesData?.favorites) ? favoritesData.favorites : []);

        if (userData) {
          setProfileForm({
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            display_name: userData.name || '',
            email: userData.email || '',
            phone: userData.phone || '',
            cpf: userData.cpf || '',
          });

          const fallbackAddress: AddressForm = {
            address: userData.address || '',
            city: userData.city || '',
            state: userData.state || '',
            zip: userData.zip || '',
            country: userData.country || 'Brasil',
          };

          setBillingAddress({
            address: userData.billing_address || fallbackAddress.address,
            city: userData.billing_city || fallbackAddress.city,
            state: userData.billing_state || fallbackAddress.state,
            zip: userData.billing_zip || fallbackAddress.zip,
            country: userData.billing_country || fallbackAddress.country,
          });

          setShippingAddress({
            address: userData.shipping_address || fallbackAddress.address,
            city: userData.shipping_city || fallbackAddress.city,
            state: userData.shipping_state || fallbackAddress.state,
            zip: userData.shipping_zip || fallbackAddress.zip,
            country: userData.shipping_country || fallbackAddress.country,
          });
        }
      } catch (error) {
        console.error('Failed to load my account data:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAccountData();
    return () => {
      mounted = false;
    };
  }, [authLoading, user, navigate]);

  const displayName = useMemo(() => {
    if (accountUser?.name) return accountUser.name;
    return user?.name || 'Cliente';
  }, [accountUser?.name, user?.name]);

  const avatarUrl = accountUser?.avatar_url || null;

  const menuItems: Array<{ key: AccountTab | 'logout'; label: string; icon: any }> = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'orders', label: 'Pedidos', icon: ShoppingBag },
    { key: 'downloads', label: 'Matrizes Compradas', icon: Download },
    { key: 'address', label: 'Endereco', icon: MapPinHouse },
    { key: 'profile', label: 'Perfil', icon: UserRound },
    { key: 'wishlist', label: 'Lista de Desejos', icon: Heart },
    { key: 'logout', label: 'Sair', icon: LogOut },
  ];

  const getStatusLabel = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'paid' || normalized === 'pago' || normalized === 'completed') return 'Concluido';
    if (normalized === 'processing' || normalized === 'processando') return 'Processando';
    if (normalized === 'pending') return 'Pendente';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelado';
    return status || 'Indefinido';
  };

  const getStatusClass = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'paid' || normalized === 'pago' || normalized === 'completed') return 'bg-emerald-50 text-emerald-700';
    if (normalized === 'processing' || normalized === 'processando') return 'bg-blue-50 text-blue-700';
    if (normalized === 'pending') return 'bg-amber-50 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const handleMenuClick = async (key: AccountTab | 'logout') => {
    if (key === 'logout') {
      await logout();
      navigate('/login');
      return;
    }
    const pathByTab: Record<AccountTab, string> = {
      dashboard: '/minha-conta',
      orders: '/minha-conta/pedidos',
      downloads: '/minha-conta/downloads',
      address: '/minha-conta/enderecos',
      profile: '/minha-conta/perfil',
      wishlist: '/minha-conta/lista-de-desejos',
    };
    navigate(pathByTab[key]);
  };

  const openOrderDetail = async (orderId: number) => {
    setLoadingOrderDetail(true);
    setOrderDetailMessage('');
    setSelectedOrder(null);
    try {
      const res = await fetch(`/api/customer/orders/${orderId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrderDetailMessage(data?.error || 'Nao foi possivel carregar os detalhes do pedido.');
        return;
      }
      setSelectedOrder(data as CustomerOrderDetail);
    } catch {
      setOrderDetailMessage('Erro ao carregar os detalhes do pedido.');
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch('/api/customer/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMessage(data?.error || 'Erro ao enviar foto.');
        return;
      }

      setAccountUser((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev));
      setProfileMessage('Foto atualizada com sucesso.');
    } catch (error) {
      setProfileMessage('Erro ao enviar foto.');
    } finally {
      setUploadingAvatar(false);
      e.currentTarget.value = '';
    }
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage('');
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMessage(data?.error || 'Nao foi possivel salvar o perfil.');
        return;
      }
      setProfileMessage('Perfil atualizado com sucesso.');
      if (data?.user) {
        setAccountUser((prev) => ({ ...(prev || {}), ...data.user }));
      }
    } catch {
      setProfileMessage('Erro ao salvar perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMessage('');
    try {
      const res = await fetch('/api/customer/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage(data?.error || 'Nao foi possivel alterar a senha.');
        return;
      }
      setPasswordMessage('Senha alterada com sucesso.');
      setPasswordForm({ current_password: '', new_password: '', confirm_new_password: '' });
    } catch {
      setPasswordMessage('Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAddressSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingAddresses(true);
    setAddressMessage('');
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing: billingAddress, shipping: shippingAddress }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddressMessage(data?.error || 'Nao foi possivel salvar os enderecos.');
        return;
      }
      setAddressMessage('Enderecos atualizados com sucesso.');
    } catch {
      setAddressMessage('Erro ao salvar enderecos.');
    } finally {
      setSavingAddresses(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 md:px-10 py-16 flex items-center justify-center">
        <div className="inline-flex items-center gap-3 text-sm font-black text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando sua conta...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="max-w-[1360px] mx-auto px-4 md:px-10 py-8 md:py-10">
      {/* Header da conta */}
      <section className="rounded-[2rem] border border-blue-100/70 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 text-white p-6 md:p-8 shadow-xl shadow-blue-900/20">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-24 h-24 rounded-full object-cover border-4 border-white/90 shadow-lg" />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white/90 bg-white/20 flex items-center justify-center shadow-lg">
                <UserCircle2 className="w-14 h-14 text-white" />
              </div>
            )}
            <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-blue-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-md hover:bg-blue-50 transition-colors inline-flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              {uploadingAvatar ? 'Enviando...' : 'Alterar Foto'}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>

          <h1 className="mt-8 text-3xl md:text-4xl font-black tracking-tight">Minha conta</h1>
          <div className="mt-4 text-sm font-semibold text-blue-50 space-y-1">
            <p>ID: #{accountUser?.id || user.id}</p>
            <p>{displayName}</p>
            <p className="inline-flex items-center gap-2"><Mail className="w-4 h-4" /> {accountUser?.email || user.email}</p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Menu lateral */}
        <aside className="bg-white rounded-[1.5rem] border border-slate-100 p-4 shadow-sm h-fit">
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeTab;
              const isLogout = item.key === 'logout';
              return (
                <button
                  key={String(item.key)}
                  onClick={() => handleMenuClick(item.key)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-3 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : isLogout
                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Área de conteúdo */}
        <section className="space-y-6">
          {activeTab === 'dashboard' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900 mb-3">Ola, {displayName}!</h2>
              <p className="text-slate-600 leading-relaxed font-semibold">
                A partir do painel da sua conta, voce pode visualizar seus pedidos recentes, acessar suas matrizes compradas,
                gerenciar seus enderecos e editar os detalhes da sua conta.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Pedidos</p>
                  <p className="text-2xl font-black text-slate-900 mt-2">{orders.length}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Matrizes compradas</p>
                  <p className="text-2xl font-black text-slate-900 mt-2">{downloads.length}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Favoritos</p>
                  <p className="text-2xl font-black text-slate-900 mt-2">{favorites.length}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 mb-4">Pedidos</h2>

              {orders.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Voce ainda nao possui pedidos.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
                          <th className="py-3">Pedido</th>
                          <th className="py-3">Data</th>
                          <th className="py-3">Status</th>
                          <th className="py-3">Total</th>
                          <th className="py-3">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => (
                          <tr key={order.id} className="border-b border-slate-50">
                            <td className="py-4 font-black text-slate-800">#{order.id}</td>
                            <td className="py-4 font-semibold text-slate-600">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                            <td className="py-4">
                              <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-black ${getStatusClass(order.status)}`}>
                                {getStatusLabel(order.status)}
                              </span>
                            </td>
                            <td className="py-4 font-semibold text-slate-700">
                              {formatCurrency(Number(order.total || 0))} de {Number(order.total_items || 0)} itens
                            </td>
                            <td className="py-4">
                              <button
                                onClick={() => openOrderDetail(order.id)}
                                className="inline-flex items-center gap-1 text-blue-700 font-black text-xs hover:text-blue-900"
                              >
                                Visualizar <ChevronRight className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {orders.map((order) => (
                      <div key={order.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <p className="font-black text-slate-900">Pedido #{order.id}</p>
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black ${getStatusClass(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-semibold mt-2">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm font-bold text-slate-700 mt-2">{formatCurrency(Number(order.total || 0))} de {Number(order.total_items || 0)} itens</p>
                        <button onClick={() => openOrderDetail(order.id)} className="mt-3 text-xs font-black text-blue-700 inline-flex items-center gap-1">Visualizar <ChevronRight className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {(loadingOrderDetail || selectedOrder || orderDetailMessage) && (
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Detalhes do pedido</h3>
                      {selectedOrder?.order?.id ? (
                        <p className="text-xs font-semibold text-slate-500 mt-1">
                          Pedido #{selectedOrder.order.id} em {new Date(selectedOrder.order.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      ) : null}
                    </div>
                    {selectedOrder || orderDetailMessage ? (
                      <button
                        onClick={() => {
                          setSelectedOrder(null);
                          setOrderDetailMessage('');
                        }}
                        className="text-xs font-black text-slate-500 hover:text-slate-700"
                      >
                        Fechar
                      </button>
                    ) : null}
                  </div>

                  {loadingOrderDetail ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando detalhes...
                    </div>
                  ) : null}

                  {orderDetailMessage ? <p className="mt-4 text-sm font-semibold text-rose-600">{orderDetailMessage}</p> : null}

                  {selectedOrder ? (
                    <div className="mt-4 space-y-3">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 flex gap-3">
                          <div className="w-14 h-14 rounded-md overflow-hidden bg-slate-100 shrink-0">
                            {item.product_image ? (
                              <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-slate-900 truncate">{item.product_name}</p>
                            <p className="text-xs font-semibold text-slate-500 mt-1">
                              {formatCurrency(Number(item.price || 0))} x {Number(item.quantity || 0)}
                            </p>
                          </div>
                          {item.product_slug ? (
                            <Link to={`/produto/${item.product_slug}`} className="self-center text-xs font-black text-blue-700 hover:text-blue-900">
                              Ver produto
                            </Link>
                          ) : null}
                        </div>
                      ))}
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Total</span>
                        <span className="text-sm font-black text-slate-900">{formatCurrency(Number(selectedOrder.order.total || 0))}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {activeTab === 'downloads' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 mb-4">Matrizes Compradas</h2>
              {downloads.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Nenhuma matriz comprada encontrada.</p>
              ) : (
                <div className="space-y-3">
                  {downloads.map((item) => (
                    <div key={item.download_id} className="rounded-xl border border-slate-100 p-4 bg-slate-50 flex flex-col md:flex-row md:items-center gap-4">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-slate-200 shrink-0">
                        {item.product_image ? (
                          <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="w-5 h-5" /></div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 truncate">{item.product_name}</p>
                        <p className="text-xs text-slate-500 font-semibold mt-1">Expira em: Nunca</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => item.file_path && window.open(item.file_path, '_blank')}
                          disabled={!item.file_path}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black disabled:opacity-40"
                        >
                          <Download className="w-4 h-4" /> Baixar Matriz
                        </button>
                        <button
                          onClick={() => item.production_sheet && window.open(item.production_sheet, '_blank')}
                          disabled={!item.production_sheet}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-black disabled:opacity-40"
                        >
                          <FileText className="w-4 h-4" /> Baixar PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'address' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 mb-4">Endereco</h2>
              <form onSubmit={handleAddressSubmit} className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-100 p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-900">Endereco de cobranca</h3>
                      <span className="text-[11px] font-black text-blue-700">Editar endereco</span>
                    </div>
                    <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Endereco" value={billingAddress.address} onChange={(e) => setBillingAddress((prev) => ({ ...prev, address: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Cidade" value={billingAddress.city} onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))} />
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Estado" value={billingAddress.state} onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="CEP" value={billingAddress.zip} onChange={(e) => setBillingAddress((prev) => ({ ...prev, zip: e.target.value }))} />
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Pais" value={billingAddress.country} onChange={(e) => setBillingAddress((prev) => ({ ...prev, country: e.target.value }))} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-900">Endereco de entrega</h3>
                      <span className="text-[11px] font-black text-blue-700">Editar endereco</span>
                    </div>
                    <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Endereco" value={shippingAddress.address} onChange={(e) => setShippingAddress((prev) => ({ ...prev, address: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Cidade" value={shippingAddress.city} onChange={(e) => setShippingAddress((prev) => ({ ...prev, city: e.target.value }))} />
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Estado" value={shippingAddress.state} onChange={(e) => setShippingAddress((prev) => ({ ...prev, state: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="CEP" value={shippingAddress.zip} onChange={(e) => setShippingAddress((prev) => ({ ...prev, zip: e.target.value }))} />
                      <input className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm" placeholder="Pais" value={shippingAddress.country} onChange={(e) => setShippingAddress((prev) => ({ ...prev, country: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button type="submit" disabled={savingAddresses} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60">
                    {savingAddresses ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Salvar enderecos
                  </button>
                  {addressMessage && <p className="text-xs font-bold text-slate-600">{addressMessage}</p>}
                </div>
              </form>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm space-y-8">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-4">Perfil</h2>
                <form onSubmit={handleProfileSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nome" value={profileForm.first_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))} />
                    <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Sobrenome" value={profileForm.last_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))} />
                  </div>
                  <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nome de exibicao" value={profileForm.display_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, display_name: e.target.value }))} />
                  <input type="email" className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="E-mail" value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Telefone" value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="CPF" value={profileForm.cpf} onChange={(e) => setProfileForm((prev) => ({ ...prev, cpf: e.target.value }))} />
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button type="submit" disabled={savingProfile} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60">
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Salvar alteracoes
                    </button>
                    {profileMessage && <p className="text-xs font-bold text-slate-600">{profileMessage}</p>}
                  </div>
                </form>
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 mb-3">Alterar senha</h3>
                <form onSubmit={handlePasswordSubmit} className="space-y-3">
                  <PasswordInput
                    label="Senha atual"
                    value={passwordForm.current_password}
                    show={showPassword.current}
                    onToggle={() => setShowPassword((prev) => ({ ...prev, current: !prev.current }))}
                    onChange={(value) => setPasswordForm((prev) => ({ ...prev, current_password: value }))}
                  />
                  <PasswordInput
                    label="Nova senha"
                    value={passwordForm.new_password}
                    show={showPassword.next}
                    onToggle={() => setShowPassword((prev) => ({ ...prev, next: !prev.next }))}
                    onChange={(value) => setPasswordForm((prev) => ({ ...prev, new_password: value }))}
                  />
                  <PasswordInput
                    label="Confirmar nova senha"
                    value={passwordForm.confirm_new_password}
                    show={showPassword.confirm}
                    onToggle={() => setShowPassword((prev) => ({ ...prev, confirm: !prev.confirm }))}
                    onChange={(value) => setPasswordForm((prev) => ({ ...prev, confirm_new_password: value }))}
                  />

                  <div className="flex items-center gap-4 pt-2">
                    <button type="submit" disabled={savingPassword} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60">
                      {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Salvar alteracoes
                    </button>
                    {passwordMessage && <p className="text-xs font-bold text-slate-600">{passwordMessage}</p>}
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'wishlist' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 mb-4">Favoritos</h2>

              {favorites.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
                  <p className="text-slate-600 font-semibold">Sua lista de desejos esta atualmente vazia.</p>
                  <Link to="/loja" className="inline-flex mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-wider">
                    Voltar para Loja
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {favorites.map((fav) => {
                    const price = Number(fav.sale_price ?? fav.price ?? 0);
                    return (
                      <div key={fav.product_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex flex-col">
                        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-white border border-slate-100">
                          {fav.image ? <img src={fav.image} alt={fav.name} className="w-full h-full object-cover" /> : null}
                        </div>
                        <p className="mt-3 font-black text-slate-900 text-sm line-clamp-2">{fav.name}</p>
                        <p className="text-blue-700 font-black mt-1">{formatCurrency(price)}</p>
                        <Link
                          to={`/produto/${fav.slug}`}
                          className="mt-3 inline-flex justify-center items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-wider"
                        >
                          Ver produto
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function PasswordInput({
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <div className="mt-1 relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm pr-10"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </label>
  );
}
