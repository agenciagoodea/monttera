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
import { useAppData } from '../contexts/AppDataContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { formatCurrency } from '../lib/utils';

type AccountTab = 'dashboard' | 'orders' | 'downloads' | 'address' | 'profile' | 'wishlist';

type AddressForm = {
  address: string;
  number: string;
  complement: string;
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
  const { user, loading: authLoading, logout, refreshUser } = useAuth();
  const { settings } = useAppData();
  const { toggleFavorite } = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<AccountTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAddresses, setSavingAddresses] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Estados para o Modal de Ajuste de Foto
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
  const [accountMessage, setAccountMessage] = useState<string>('');

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
    number: '',
    complement: '',
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
      setAccountMessage('');
      try {
        const parseResponse = async (res: Response) => {
          const text = await res.text();
          if (!text) return {};
          try {
            return JSON.parse(text);
          } catch {
            throw new Error('Resposta inválida da API. Reinicie o servidor backend (npm run dev).');
          }
        };

        const [accountRes, ordersRes, downloadsRes, favoritesRes] = await Promise.all([
          fetch('/api/customer/account'),
          fetch('/api/customer/orders'),
          fetch('/api/customer/downloads'),
          fetch('/api/favorites'),
        ]);

        if ([accountRes, ordersRes, downloadsRes, favoritesRes].some((r) => r.status === 401)) {
          navigate('/login?redirect=/minha-conta');
          return;
        }

        const [accountData, ordersData, downloadsData, favoritesData] = await Promise.all([
          parseResponse(accountRes),
          parseResponse(ordersRes),
          parseResponse(downloadsRes),
          parseResponse(favoritesRes),
        ]);

        if (!accountRes.ok || !ordersRes.ok || !favoritesRes.ok) {
          throw new Error(
            (accountData as any)?.error ||
            (ordersData as any)?.error ||
            (favoritesData as any)?.error ||
            'N??o foi poss??vel carregar os dados da conta.'
          );
        }

        if (!mounted) return;

        const userData: AccountUser | null = accountData?.user || null;
        setAccountUser(userData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        if (downloadsRes.ok) {
          setDownloads(Array.isArray(downloadsData) ? downloadsData : []);
        } else {
          setDownloads([]);
          const downloadError =
            (downloadsData as any)?.error ||
            'N??o foi poss??vel carregar os downloads agora.';
          setAccountMessage(downloadError);
        }
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
            number: '',
            complement: '',
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
        setAccountMessage(error instanceof Error ? error.message : 'Erro ao carregar dados da conta.');
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
    { key: 'wishlist', label: 'Favoritos', icon: Heart },
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
    // Troca instantânea de estado sem aguardar a rota
    setActiveTab(key);
    // Sincroniza a URL silenciosamente sem disparar re-renders extras pesados
    window.history.pushState({}, '', pathByTab[key]);
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmAvatarUpload = async () => {
    if (!selectedImage) return;
    setUploadingAvatar(true);

    try {
      // Criar um canvas para fazer o crop da imagem baseado no zoom/offset
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = selectedImage;
      });

      const size = 400; // Tamanho final da foto de perfil
      canvas.width = size;
      canvas.height = size;

      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, size, size);

        // Lógica de desenho com zoom e offset
        const imgAspect = img.width / img.height;
        let drawW, drawH;

        if (imgAspect > 1) {
          drawH = size * zoom;
          drawW = drawH * imgAspect;
        } else {
          drawW = size * zoom;
          drawH = drawW / imgAspect;
        }

        const x = (size - drawW) / 2 + offset.x;
        const y = (size - drawH) / 2 + offset.y;

        ctx.drawImage(img, x, y, drawW, drawH);
      }

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('avatar', file);

        const res = await fetch('/api/customer/avatar', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setProfileMessage(data?.error || 'Erro ao enviar foto.');
        } else {
          setAccountUser((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : prev));
          setProfileMessage('Foto atualizada com sucesso.');
          await refreshUser(); // Atualiza o avatar no Header
          setShowCropModal(false);
        }
        setUploadingAvatar(false);
      }, 'image/jpeg', 0.9);

    } catch (error) {
      console.error('Avatar upload failed:', error);
      setProfileMessage('Erro ao processar imagem.');
      setUploadingAvatar(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

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
    const billingToSave = {
      ...billingAddress,
      address: `${billingAddress.address}${billingAddress.number ? ', ' + billingAddress.number : ''}${billingAddress.complement ? ' - ' + billingAddress.complement : ''}`
    };

    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing: billingToSave, shipping: shippingAddress }),
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
      {/* Header da conta - Fino, Foto esticada, Suporte à direita */}
      <section 
        className="rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group"
        style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
      >
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>
        
        <div className="flex flex-col md:flex-row relative z-10 min-h-[180px]">
          {/* Foto de perfil - ocupa toda a altura, sem padding */}
          <div className="md:w-48 md:self-stretch shrink-0 relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover md:min-h-[180px] max-h-[220px] md:max-h-none" />
            ) : (
              <div className="w-full h-full md:min-h-[180px] bg-white/20 flex items-center justify-center">
                <UserCircle2 className="w-24 h-24 text-white/60" />
              </div>
            )}
            {/* Botão alterar foto */}
            <label className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-blue-700 p-2 rounded-full cursor-pointer shadow-lg hover:bg-white transition-all hover:scale-110 active:scale-95">
              <Camera className="w-4 h-4" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>

          {/* Informações centrais */}
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-1">Olá {displayName.split(' ')[0]}, Tudo bem?</h1>
            <p className="text-sm font-bold text-white/80 flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0" /> {accountUser?.email || user.email}
            </p>
          </div>

          {/* Suporte - lado direito */}
          <div className="shrink-0 p-6 md:p-8 flex flex-col justify-center items-start md:items-end border-t md:border-t-0 md:border-l border-white/20">
            <p className="text-[11px] font-black uppercase tracking-widest text-white/70 mb-3">Precisa de Ajuda?</p>
            <div className="flex flex-row gap-2 flex-wrap md:flex-nowrap">
              <a 
                href={`https://wa.me/${(settings.support_whatsapp || settings.whatsapp || '').replace(/\D/g, '')}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-lg whitespace-nowrap" 
                style={{ color: 'var(--brand-primary, #2563eb)' }}
              >
                Suporte WhatsApp
              </a>
              <a 
                href={`mailto:${settings.support_email || settings.email_contact || settings.email || ''}`} 
                className="flex items-center gap-2 bg-white/10 text-white border border-white/20 px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/20 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
              >
                E-mail Suporte
              </a>
            </div>
          </div>
        </div>
        
        {/* Animated Icon Background */}
        <UserCircle2 className="absolute -bottom-10 -right-10 w-48 h-48 text-white/10 group-hover:rotate-12 group-hover:scale-110 transition-all duration-1000 pointer-events-none" />
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
          {accountMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {accountMessage}
            </div>
          ) : null}

          {activeTab === 'dashboard' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900 mb-3">Ola, {displayName}!</h2>
              <p className="text-slate-600 leading-relaxed font-semibold">
                A partir do painel da sua conta, voce pode visualizar seus pedidos recentes, acessar suas matrizes compradas,
                gerenciar seus enderecos e editar os detalhes da sua conta.
              </p>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="group relative overflow-hidden rounded-3xl bg-blue-50 border border-blue-100 p-6 transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-blue-600/70">Pedidos</p>
                      <p className="text-3xl font-black text-slate-900 mt-1">{orders.length}</p>
                    </div>
                  </div>
                  <button onClick={() => handleMenuClick('orders')} className="mt-4 w-full py-2 bg-white/50 border border-blue-100 rounded-xl text-[10px] font-black text-blue-700 uppercase tracking-widest hover:bg-white transition-colors">
                    Ver Histórico
                  </button>
                </div>

                <div className="group relative overflow-hidden rounded-3xl bg-emerald-50 border border-emerald-100 p-6 transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-600/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-200">
                      <Download className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600/70">Arquivos</p>
                      <p className="text-3xl font-black text-slate-900 mt-1">{downloads.length}</p>
                    </div>
                  </div>
                  <button onClick={() => handleMenuClick('downloads')} className="mt-4 w-full py-2 bg-white/50 border border-emerald-100 rounded-xl text-[10px] font-black text-emerald-700 uppercase tracking-widest hover:bg-white transition-colors">
                    Baixar Matrizes
                  </button>
                </div>

                <div className="group relative overflow-hidden rounded-3xl bg-rose-50 border border-rose-100 p-6 transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-600/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-lg shadow-rose-200">
                      <Heart className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-rose-600/70">Favoritos</p>
                      <p className="text-3xl font-black text-slate-900 mt-1">{favorites.length}</p>
                    </div>
                  </div>
                  <button onClick={() => handleMenuClick('wishlist')} className="mt-4 w-full py-2 bg-white/50 border border-rose-100 rounded-xl text-[10px] font-black text-rose-700 uppercase tracking-widest hover:bg-white transition-colors">
                    Ver Lista
                  </button>
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
                        {orders.map((order) => {
                          if (!order) return null;
                          return (
                            <tr key={order.id} className="border-b border-slate-50">
                              <td className="py-4 font-black text-slate-800">#{order.id}</td>
                              <td className="py-4 font-semibold text-slate-600">{order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}</td>
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {orders.map((order) => {
                      if (!order) return null;
                      return (
                        <div key={order.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                          <div className="flex items-center justify-between">
                            <p className="font-black text-slate-900">Pedido #{order.id}</p>
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black ${getStatusClass(order.status)}`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-semibold mt-2">{order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '-'}</p>
                          <p className="text-sm font-bold text-slate-700 mt-2">{formatCurrency(Number(order.total || 0))} de {Number(order.total_items || 0)} itens</p>
                          <button onClick={() => openOrderDetail(order.id)} className="mt-3 text-xs font-black text-blue-700 inline-flex items-center gap-1">Visualizar <ChevronRight className="w-4 h-4" /></button>
                        </div>
                      );
                    })}
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
                          Pedido #{selectedOrder.order.id} em {selectedOrder.order.created_at ? new Date(selectedOrder.order.created_at).toLocaleDateString('pt-BR') : ''}
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
                        <span className="text-sm font-black text-slate-900">{formatCurrency(Number(selectedOrder?.order?.total || 0))}</span>
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
                        <p className="text-xs text-slate-500 font-semibold mt-1">Compra permanente</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`/api/customer/download-file?path=${encodeURIComponent(item.file_path || '')}`}
                          download
                          onClick={(e) => { if (!item.file_path) e.preventDefault(); }}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-black transition-all hover:scale-105 active:scale-95 ${
                            item.file_path ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <Download className="w-4 h-4" /> Baixar Matriz (ZIP)
                        </a>
                        {item.production_sheet && (
                          <a
                            href={item.production_sheet}
                            download
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all hover:scale-105 active:scale-95"
                          >
                            <FileText className="w-4 h-4" /> Baixar PDF
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'address' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 mb-6">Meu Endereço</h2>
              <form onSubmit={handleAddressSubmit} className="max-w-2xl space-y-6">
                <div className="rounded-2xl border border-slate-100 p-6 bg-slate-50/50 space-y-6">
                  <AddressFormBlock
                    prefix="billing"
                    address={billingAddress}
                    setAddress={setBillingAddress}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <button type="submit" disabled={savingAddresses} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                    {savingAddresses ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Salvar Alterações
                  </button>
                  {addressMessage && <p className="text-xs font-bold text-slate-600">{addressMessage}</p>}
                </div>
              </form>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="bg-white rounded-[1.5rem] border border-slate-100 p-6 shadow-sm space-y-8">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-6">Perfil</h2>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Nome</label>
                      <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Seu nome" value={profileForm.first_name || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Sobrenome</label>
                      <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Seu sobrenome" value={profileForm.last_name || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Nome de Exibição</label>
                    <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="Como quer ser chamado" value={profileForm.display_name || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, display_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">E-mail</label>
                    <input type="email" className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="seu@email.com" value={profileForm.email || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Telefone / WhatsApp</label>
                      <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="(11) 99999-9999" value={profileForm.phone || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">CPF</label>
                      <input className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm" placeholder="000.000.000-00" value={profileForm.cpf || ''} onChange={(e) => setProfileForm((prev) => ({ ...prev, cpf: e.target.value }))} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button type="submit" disabled={savingProfile} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60">
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Salvar Alterações
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
                    value={passwordForm.current_password || ''}
                    show={showPassword.current}
                    onToggle={() => setShowPassword((prev) => ({ ...prev, current: !prev.current }))}
                    onChange={(value) => setPasswordForm((prev) => ({ ...prev, current_password: value }))}
                  />
                  <PasswordInput
                    label="Nova senha"
                    value={passwordForm.new_password || ''}
                    show={showPassword.next}
                    onToggle={() => setShowPassword((prev) => ({ ...prev, next: !prev.next }))}
                    onChange={(value) => setPasswordForm((prev) => ({ ...prev, new_password: value }))}
                  />
                  <PasswordInput
                    label="Confirmar nova senha"
                    value={passwordForm.confirm_new_password || ''}
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
                      <div key={fav.product_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex flex-col relative group">
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            await toggleFavorite(fav.product_id, fav.name);
                            setFavorites(prev => prev.filter(f => f.product_id !== fav.product_id));
                          }}
                          className="absolute top-5 right-5 z-20 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-red-500 hover:scale-110 hover:bg-white transition-all shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          title="Remover dos favoritos"
                        >
                          <Heart className="w-4 h-4 fill-current" />
                        </button>
                        <div className="aspect-[4/3] rounded-lg overflow-hidden bg-white border border-slate-100 relative">
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

      {/* Modal de Crop/Zoom da Foto */}
      {showCropModal && selectedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Ajustar Foto de Perfil</h3>
              <button onClick={() => setShowCropModal(false)} className="text-slate-400 hover:text-slate-600">
                <LogOut className="w-5 h-5 rotate-180" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Área de Visualização */}
              <div 
                className="relative aspect-square w-full bg-slate-100 rounded-2xl overflow-hidden cursor-move touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div 
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-75"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  }}
                >
                  <img src={selectedImage} alt="Preview" className="max-w-none w-full h-auto" draggable={false} />
                </div>
                {/* Overlay de Círculo Guia */}
                <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                   <div className="w-full h-full border-2 border-white/50 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]"></div>
                </div>
              </div>

              {/* Slider de Zoom */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <span>Zoom</span>
                  <span>{Math.round(zoom * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.1" 
                  value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCropModal(false)}
                  className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmAvatarUpload}
                  disabled={uploadingAvatar}
                  className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Salvar Foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}



function AddressFormBlock({
  prefix,
  address,
  setAddress,
}: {
  prefix: string;
  address: AddressForm;
  setAddress: React.Dispatch<React.SetStateAction<AddressForm>>;
}) {
  const [loadingCep, setLoadingCep] = React.useState(false);

  const handleCepBlur = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data && !data.erro) {
        setAddress(prev => ({
          ...prev,
          address: data.logradouro || prev.address,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          country: 'Brasil',
        }));
        // Foca no campo número após preencher o CEP
        const numInput = document.getElementById(`${prefix}-number`);
        if (numInput) numInput.focus();
      }
    } catch { /* silencioso */ }
    finally { setLoadingCep(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">CEP</label>
          <div className="flex gap-2">
            <input
              id={`${prefix}-zip`}
              className="flex-1 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
              placeholder="00000-000"
              value={address.zip || ''}
              onChange={(e) => setAddress(prev => ({ ...prev, zip: e.target.value }))}
              onBlur={(e) => handleCepBlur(e.target.value)}
              maxLength={9}
            />
            {loadingCep && (
              <div className="flex items-center px-2 text-blue-500">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Logradouro / Rua</label>
          <input className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="Ex: Av. Brasil" value={address.address || ''} onChange={(e) => setAddress(prev => ({ ...prev, address: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Número</label>
          <input id={`${prefix}-number`} className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="123" value={address.number || ''} onChange={(e) => setAddress(prev => ({ ...prev, number: e.target.value }))} />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Complemento</label>
          <input className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="Apto, Bloco, etc." value={address.complement || ''} onChange={(e) => setAddress(prev => ({ ...prev, complement: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Cidade</label>
          <input className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="Cidade" value={address.city || ''} onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))} />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Estado (UF)</label>
          <input className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="UF" value={address.state || ''} onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))} maxLength={2} />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">País</label>
          <input className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all" placeholder="País" value={address.country || ''} onChange={(e) => setAddress(prev => ({ ...prev, country: e.target.value }))} />
        </div>
      </div>
    </div>
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
