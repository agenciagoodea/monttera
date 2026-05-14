import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { Trash2, ShoppingBag, ChevronLeft, Copy, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';

type CheckoutMethod = 'pix' | 'credit_card' | 'debit_card' | 'paypal';

type CheckoutResponse = {
  success: boolean;
  order_id: number;
  payment_id: string | null;
  payment_method: CheckoutMethod;
  status: string;
  qr_code?: string | null;
  qr_code_base64?: string | null;
};

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidCPF(cpfValue: string) {
  const cpf = cpfValue.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function CartPage() {
  const { items, removeFromCart, totalPrice, totalItems, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [checkoutMethod, setCheckoutMethod] = useState<CheckoutMethod>('pix');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null);
  const [paypalConfig, setPaypalConfig] = useState<{ enabled: boolean; brl_usd_rate: number } | null>(null);

  const [publicKey, setPublicKey] = useState('');
  const [payer, setPayer] = useState({
    email: '',
    first_name: '',
    last_name: '',
    cpf: '',
    zip_code: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
  });

  const [pixExpiresAt, setPixExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  const [statusMessage, setStatusMessage] = useState('');
  const [payerErrors, setPayerErrors] = useState<string[]>([]);
  const [payerTouched, setPayerTouched] = useState<Record<string, boolean>>({
    first_name: false,
    last_name: false,
    email: false,
    cpf: false,
    zip_code: false,
    street: false,
    number: false,
    neighborhood: false,
    city: false,
    state: false,
  });

  const cardFormRef = useRef<any>(null);

  const canSubmitPayer = useMemo(() => {
    return payerErrors.length === 0;
  }, [payerErrors]);

  useEffect(() => {
    const errors: string[] = [];
    if (payer.first_name.trim().length < 2) errors.push('Nome inválido');
    if (payer.last_name.trim().length < 2) errors.push('Sobrenome inválido');
    if (!isValidEmail(payer.email)) errors.push('E-mail inválido');
    if (!isValidCPF(payer.cpf)) errors.push('CPF inválido');
    setPayerErrors(errors);
  }, [payer]);

  const fieldError = {
    first_name: payer.first_name.trim().length < 2 ? 'Nome inválido' : '',
    last_name: payer.last_name.trim().length < 2 ? 'Sobrenome inválido' : '',
    email: !isValidEmail(payer.email) ? 'E-mail inválido' : '',
    cpf: !isValidCPF(payer.cpf) ? 'CPF inválido' : '',
  };

  const inputClassName = (field: keyof typeof payer) => {
    if (!payerTouched[field as string]) return 'px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold';
    if ((fieldError as any)[field]) return 'px-4 py-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-700';
    return 'px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-700';
  };

  useEffect(() => {
    if (user) {
      fetch('/api/customer/account')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && !data.error) {
            const [firstName, ...rest] = (data.name || '').split(' ');
            setPayer(prev => ({
              ...prev,
              email: data.email || user.email || prev.email,
              first_name: data.first_name || firstName || prev.first_name,
              last_name: data.last_name || rest.join(' ') || prev.last_name,
              cpf: data.cpf || prev.cpf,
              zip_code: data.billing_zip || data.zip || prev.zip_code,
              street: data.billing_address || data.address || prev.street,
              city: data.billing_city || data.city || prev.city,
              state: data.billing_state || data.state || prev.state,
            }));
          } else {
            setPayer((prev) => ({ ...prev, email: prev.email || user.email || '' }));
          }
        })
        .catch(() => {
          setPayer((prev) => ({ ...prev, email: prev.email || user.email || '' }));
        });
    }
  }, [user]);

  const handleCepBlur = async () => {
    setPayerTouched(prev => ({ ...prev, zip_code: true }));
    const cep = payer.zip_code.replace(/\D/g, '');
    if (cep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setPayer(prev => ({
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

  useEffect(() => {
    async function loadCheckoutConfig() {
      try {
        const res = await fetch('/api/checkout/config');
        const data = await res.json();
        setPublicKey(data?.public_key || '');
      } catch (error) {
        setPublicKey('');
      }
    }
    loadCheckoutConfig();
  }, []);

  useEffect(() => {
    async function loadPayPalConfig() {
      try {
        const res = await fetch('/api/checkout/paypal/config');
        const data = await res.json();
        setPaypalConfig({ enabled: data?.enabled === true, brl_usd_rate: parseFloat(data?.brl_usd_rate || '5.20') });
      } catch {
        setPaypalConfig({ enabled: false, brl_usd_rate: 5.20 });
      }
    }
    loadPayPalConfig();
  }, []);

  useEffect(() => {
    if (checkoutMethod === 'pix' || !publicKey) return;
    if (!(window as any).MercadoPago) return;

    const mp = new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
    const amount = String(totalPrice.toFixed(2));

    cardFormRef.current = mp.cardForm({
      amount,
      autoMount: true,
      form: {
        id: 'form-checkout',
        cardNumber: { id: 'form-checkout__cardNumber', placeholder: 'Número do cartão' },
        expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/AA' },
        securityCode: { id: 'form-checkout__securityCode', placeholder: 'CVV' },
        cardholderName: { id: 'form-checkout__cardholderName', placeholder: 'Nome no cartão' },
        issuer: { id: 'form-checkout__issuer' },
        installments: { id: 'form-checkout__installments' },
        identificationType: { id: 'form-checkout__identificationType' },
        identificationNumber: { id: 'form-checkout__identificationNumber', placeholder: 'CPF' },
        cardholderEmail: { id: 'form-checkout__email', placeholder: 'E-mail' },
      },
      callbacks: {
        onFormMounted: (error: any) => {
          if (error) console.warn('Form mounted handling error:', error);
        },
        onSubmit: async (event: Event) => {
          event.preventDefault();
          if (!cardFormRef.current) return;
          setLoadingCheckout(true);
          setStatusMessage('');
          try {
            const cardData = cardFormRef.current.getCardFormData();
            const cardPayerEmail = cardData?.cardholderEmail || payer.email;
            const cardPayerCpf = cardData?.identificationNumber || payer.cpf;
            if (!isValidEmail(cardPayerEmail) || !isValidCPF(cardPayerCpf)) {
              setStatusMessage('E-mail ou CPF inválido para pagamento com cartão.');
              return;
            }
            const cardHolderName = cardData?.cardholderName || `${payer.first_name} ${payer.last_name}`;
            const [firstName, ...restName] = String(cardHolderName).trim().split(' ');
            const lastName = restName.join(' ') || payer.last_name;

            const res = await fetch('/api/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items,
                payment_method: checkoutMethod,
                payer: {
                  email: cardPayerEmail,
                  first_name: firstName || payer.first_name,
                  last_name: lastName || payer.last_name,
                  cpf: cardPayerCpf,
                },
                card_token: cardData?.token,
                installments: checkoutMethod === 'debit_card' ? 1 : Number(cardData?.installments || 1),
                issuer_id: cardData?.issuerId || null,
                payment_method_id: cardData?.paymentMethodId || undefined,
              }),
            });

            const data = await res.json();
            if (!res.ok) {
              setStatusMessage(data?.error || 'Falha ao processar pagamento');
              return;
            }

            setCheckoutResult(data);
            if (data.status === 'approved') {
              clearCart();
              setStatusMessage('Pagamento aprovado com sucesso.');
            } else {
              setStatusMessage(`Pagamento em status: ${data.status}`);
            }
          } catch (error) {
            setStatusMessage('Erro ao processar pagamento com cartão');
          } finally {
            setLoadingCheckout(false);
          }
        },
      },
    });
  }, [checkoutMethod, publicKey, totalPrice, payer, items, clearCart]);

  useEffect(() => {
    if (!checkoutResult?.payment_id || checkoutResult.payment_method !== 'pix') return;
    if (checkoutResult.status === 'approved') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${checkoutResult.payment_id}/status`);
        const data = await res.json();
        if (data?.status) {
          setCheckoutResult((prev) => (prev ? { ...prev, status: data.status } : prev));
          if (data.status === 'approved') {
            clearCart();
            setStatusMessage('Pagamento PIX aprovado.');
          }
        }
      } catch (error) {
        // silêncio no polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [checkoutResult?.payment_id, checkoutResult?.payment_method, checkoutResult?.status, clearCart]);

  useEffect(() => {
    if (!pixExpiresAt) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((pixExpiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [pixExpiresAt]);

  const handlePixCheckout = async () => {
    if (!user) {
      navigate('/login?redirect=/carrinho');
      return;
    }
    if (!canSubmitPayer) {
      setStatusMessage('Preencha nome, sobrenome, e-mail e CPF para gerar o PIX.');
      return;
    }

    setLoadingCheckout(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          payment_method: 'pix',
          payer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data?.error || 'Erro ao iniciar pagamento PIX');
        return;
      }
      setCheckoutResult(data);
      setPixExpiresAt(Date.now() + 30 * 60 * 1000);
      setSecondsLeft(30 * 60);
    } catch (error) {
      setStatusMessage('Erro ao iniciar pagamento PIX');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handlePayPalCheckout = async () => {
    if (!user) {
      navigate('/login?redirect=/carrinho');
      return;
    }
    setLoadingCheckout(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok || !data.approval_url) {
        setStatusMessage(data?.error || 'Erro ao criar pedido PayPal');
        setLoadingCheckout(false);
        return;
      }
      // Redirect to PayPal
      window.location.href = data.approval_url;
    } catch {
      setStatusMessage('Erro ao conectar com PayPal');
      setLoadingCheckout(false);
    }
  };

  const handleCopyPix = async () => {
    if (!checkoutResult?.qr_code) return;
    await navigator.clipboard.writeText(checkoutResult.qr_code);
    setStatusMessage('Código PIX copiado.');
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Seu carrinho está vazio</h2>
        <p className="text-slate-500 font-medium mb-10 text-center max-w-sm">
          Parece que você ainda não adicionou nenhuma matriz ao seu carrinho.
        </p>
        <Link to="/" className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all">
          Explorar Matrizes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-10 py-10 w-full">
      <div className="flex items-center gap-4 mb-10">
        <Link to="/" className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Meu Carrinho</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-50">
              {items.map((item) => (
                <motion.div layout key={item.product_id} className="p-6 md:p-8 flex flex-col xl:flex-row xl:items-center gap-6 group">
                  <div className="w-24 h-24 bg-slate-100 rounded-3xl overflow-hidden flex-shrink-0 border border-slate-100 mx-auto xl:mx-0">
                    <img src={item.product_image || ''} alt={item.product_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 min-w-0 text-center xl:text-left">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{item.product_name}</h3>
                    <span className="text-xs font-black text-blue-600 block mt-1">R$ {item.price.toFixed(2)}</span>
                  </div>
                  <button onClick={() => removeFromCart(item.product_id)} className="w-10 h-10 mx-auto xl:mx-0 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
            <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
              <button onClick={clearCart} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors">
                Limpar Carrinho
              </button>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {totalItems} {totalItems === 1 ? 'Matriz' : 'Matrizes'}
              </span>
            </div>
          </div>

          <div className="flex">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Adicionar mais produtos
            </Link>
          </div>

          <div className="bg-[#eaf4fc] border border-blue-100 rounded-[2rem] p-6 text-[13px] text-blue-900 leading-relaxed shadow-sm">
            <p className="font-bold mb-2 text-blue-950">Neste pacote contém arquivos: PES - JEF - DST - EXP - XXX</p>
            <p>
              Após a finalização da sua compra, caso você não seja redirecionado automaticamente para download, acesse o Painel do Cliente no menu superior do site clicando na opção <strong>"Matrizes Compradas"</strong> para visualizar e baixar seus arquivos. Certifique-se de utilizar o usuário e a senha cadastrados no momento da compra. Caso não se lembre dos seus dados de acesso, utilize a opção "Esqueci minha senha" para redefini-los.
            </p>
          </div>
          

        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 md:p-8 space-y-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Seus Dados</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome</label>
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={payer.first_name}
                  onChange={(e) => setPayer((prev) => ({ ...prev, first_name: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, first_name: true }))}
                  className={`${inputClassName('first_name')} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sobrenome</label>
                <input
                  type="text"
                  placeholder="Seu sobrenome"
                  value={payer.last_name}
                  onChange={(e) => setPayer((prev) => ({ ...prev, last_name: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, last_name: true }))}
                  className={`${inputClassName('last_name')} w-full`}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">E-mail</label>
                <input
                  type="email"
                  placeholder="exemplo@email.com"
                  value={payer.email}
                  onChange={(e) => setPayer((prev) => ({ ...prev, email: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, email: true }))}
                  className={`${inputClassName('email')} w-full`}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CPF</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={payer.cpf}
                  onChange={(e) => setPayer((prev) => ({ ...prev, cpf: maskCPF(e.target.value) }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, cpf: true }))}
                  className={`${inputClassName('cpf')} w-full`}
                />
              </div>
            </div>

            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight pt-4 border-t border-slate-50">Endereço de Faturamento</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CEP</label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={payer.zip_code}
                  onChange={(e) => setPayer((prev) => ({ ...prev, zip_code: maskCPF(e.target.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')) }))}
                  onBlur={handleCepBlur}
                  className={`${inputClassName('zip_code')} w-full`}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Rua/Avenida</label>
                <input
                  type="text"
                  placeholder="Nome da rua"
                  value={payer.street}
                  onChange={(e) => setPayer((prev) => ({ ...prev, street: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, street: true }))}
                  className={`${inputClassName('street')} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número</label>
                <input
                  type="text"
                  placeholder="123"
                  value={payer.number}
                  onChange={(e) => setPayer((prev) => ({ ...prev, number: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, number: true }))}
                  className={`${inputClassName('number')} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bairro</label>
                <input
                  type="text"
                  placeholder="Nome do bairro"
                  value={payer.neighborhood}
                  onChange={(e) => setPayer((prev) => ({ ...prev, neighborhood: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, neighborhood: true }))}
                  className={`${inputClassName('neighborhood')} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cidade</label>
                <input
                  type="text"
                  placeholder="Sua cidade"
                  value={payer.city}
                  onChange={(e) => setPayer((prev) => ({ ...prev, city: e.target.value }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, city: true }))}
                  className={`${inputClassName('city')} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Estado (UF)</label>
                <input
                  type="text"
                  placeholder="UF"
                  value={payer.state}
                  onChange={(e) => setPayer((prev) => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
                  onBlur={() => setPayerTouched((prev) => ({ ...prev, state: true }))}
                  className={`${inputClassName('state')} w-full`}
                />
              </div>
            </div>

            {payerErrors.length > 0 && (
              <ul className="text-[11px] text-rose-600 font-semibold space-y-0.5 pt-2">
                {payerErrors.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#eef8f6] border border-emerald-100 rounded-[2rem] p-6 text-[13px] text-emerald-900 leading-relaxed shadow-sm">
            <p className="font-bold mb-2 flex items-center gap-2 text-emerald-950"><span className="text-lg">🔒</span> Uso exclusivo para quem adquiriu</p>
            <p className="mb-2">
              Essa matriz foi desenvolvida com muito carinho e dedicação. Por isso, pedimos que <strong>não compartilhe, doe ou revenda</strong> este arquivo em nenhuma plataforma, rede social ou mídia digital.
            </p>
            <p className="mb-3 flex items-start gap-2">
              <span className="text-lg leading-none">📜</span> <span>A redistribuição sem autorização é proibida pela <strong>Lei de Direitos Autorais (Lei 9.610/98)</strong>.</span>
            </p>
            <p className="font-bold text-emerald-950">Contamos com seu apoio para valorizar o trabalho de quem cria!💛</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 md:p-8 sticky top-28 space-y-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Pagamento</h2>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCheckoutMethod('pix')} className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${checkoutMethod === 'pix' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                PIX
              </button>
              <button type="button" onClick={() => setCheckoutMethod('credit_card')} className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${checkoutMethod === 'credit_card' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Crédito
              </button>
              <button type="button" onClick={() => setCheckoutMethod('debit_card')} className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${checkoutMethod === 'debit_card' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Débito
              </button>
              {paypalConfig?.enabled && (
                <button type="button" onClick={() => setCheckoutMethod('paypal')} className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${checkoutMethod === 'paypal' ? 'bg-[#0070ba] text-white' : 'bg-slate-100 text-slate-600'}`}>
                  PayPal 🌐
                </button>
              )}
            </div>

            {checkoutMethod === 'pix' ? (
              <button
                onClick={handlePixCheckout}
                disabled={loadingCheckout || !canSubmitPayer}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {loadingCheckout ? 'Gerando PIX...' : 'Gerar PIX'}
              </button>
            ) : checkoutMethod === 'paypal' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 text-sm text-blue-800 font-medium">
                  🌐 <strong>Pagamento internacional em dólar (USD).</strong><br />
                  O valor será convertido pela cotação configurada pela loja.
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between">
                    <span>Total em BRL:</span>
                    <span className="text-slate-800 font-black">R$ {totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cotação:</span>
                    <span>1 USD = R$ {(paypalConfig?.brl_usd_rate ?? 5.20).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                    <span>Estimado em USD:</span>
                    <span className="text-blue-700 font-black">$ {(totalPrice / (paypalConfig?.brl_usd_rate ?? 5.20)).toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={handlePayPalCheckout}
                  disabled={loadingCheckout}
                  className="w-full bg-[#0070ba] hover:bg-[#005ea6] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-colors"
                >
                  {loadingCheckout ? 'Redirecionando...' : '🅿 Pagar com PayPal →'}
                </button>
              </div>
            ) : (
              <form id="form-checkout" className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número do Cartão</label>
                    <input id="form-checkout__cardNumber" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Vencimento</label>
                    <input id="form-checkout__expirationDate" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CVV</label>
                    <input id="form-checkout__securityCode" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome no Cartão</label>
                    <input id="form-checkout__cardholderName" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Banco Emissor</label>
                    <select id="form-checkout__issuer" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  {checkoutMethod === 'credit_card' && (
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Parcelamento</label>
                      <select id="form-checkout__installments" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo Doc.</label>
                    <select id="form-checkout__identificationType" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número Doc.</label>
                    <input id="form-checkout__identificationNumber" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">E-mail de Cobrança</label>
                    <input id="form-checkout__email" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold" />
                  </div>
                </div>
                <button type="submit" disabled={loadingCheckout || !canSubmitPayer} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {loadingCheckout ? 'Processando...' : checkoutMethod === 'debit_card' ? 'Pagar com débito' : 'Pagar com cartão'}
                </button>
              </form>
            )}

            {checkoutResult?.payment_method === 'pix' && checkoutResult.payment_id && (
              <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">Pagamento PIX</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">{checkoutResult.status}</span>
                </div>
                {checkoutResult.qr_code_base64 && (
                  <img
                    src={`data:image/png;base64,${checkoutResult.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-44 h-44 object-contain mx-auto bg-white rounded-xl p-2 border border-blue-100"
                  />
                )}
                {!!checkoutResult.qr_code && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Pix Copia e Cola</p>
                    <textarea value={checkoutResult.qr_code || ''} readOnly className="w-full h-24 p-3 rounded-xl border border-blue-200 bg-white text-[11px] font-semibold text-slate-700" />
                    <button type="button" onClick={handleCopyPix} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2">
                      <Copy className="w-3.5 h-3.5" />
                      Copiar código PIX
                    </button>
                  </div>
                )}
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 text-center">
                  Expira em {formatSeconds(secondsLeft)}
                </p>
              </div>
            )}

            {statusMessage && (
              <p className="text-xs font-bold text-slate-600">{statusMessage}</p>
            )}

            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm font-medium text-slate-500">
                <span>Total</span>
                <span className="text-2xl font-black text-blue-600">R$ {totalPrice.toFixed(2)}</span>
              </div>
              <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Checkout transparente via Mercado Pago (PIX, crédito e débito) e PayPal Internacional.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
