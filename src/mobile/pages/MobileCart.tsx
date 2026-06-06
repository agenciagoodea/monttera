import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../../contexts/CartContext';
import { Trash2, ShoppingBag, ChevronLeft, Copy, CreditCard, ShieldCheck, Check, Info, AlertCircle, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';
import { formatCurrency } from '../../lib/utils';

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
  for (let idx = 0; idx < 9; idx += 1) sum += Number(cpf[idx]) * (10 - idx);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let idx = 0; idx < 10; idx += 1) sum += Number(cpf[idx]) * (11 - idx);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const parseLegacyAddress = (rawValue: string | null | undefined) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return { address: '', number: '', complement: '' };

  let base = raw;
  let complement = '';
  const complementMatch = raw.match(/^(.*?)(?:\s+-\s+)(.+)$/);
  if (complementMatch) {
    base = complementMatch[1].trim();
    complement = complementMatch[2].trim();
  }

  let address = base;
  let number = '';
  const numberMatch = base.match(/^(.*?)(?:,\s*)([0-9A-Za-z\-\/]+)$/);
  if (numberMatch) {
    address = numberMatch[1].trim();
    number = numberMatch[2].trim();
    const escapedNumber = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicatedSuffix = new RegExp(`^(.*?)(?:,\\s*${escapedNumber})$`);
    while (duplicatedSuffix.test(address)) {
      address = address.replace(duplicatedSuffix, '$1').trim();
    }
  }

  return { address, number, complement };
};

const composeAddress = (form: { street: string; number?: string; complement?: string }) => {
  const street = String(form.street || '').trim();
  const number = String(form.number || '').trim();
  const complement = String(form.complement || '').trim();
  if (!street) return '';

  let value = street;
  const escapedNumber = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (number && !new RegExp(`,\\s*${escapedNumber}$`).test(value)) {
    value += `, ${number}`;
  }
  const escapedComplement = complement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (complement && !new RegExp(`-\\s*${escapedComplement}$`).test(value)) {
    value += ` - ${complement}`;
  }

  return value;
};

export default function MobileCart() {
  const { items, removeFromCart, totalPrice, totalItems, clearCart } = useCart();
  const { user } = useAuth();
  const { settings } = useAppData();
  const navigate = useNavigate();

  const [checkoutMethod, setCheckoutMethod] = useState<CheckoutMethod>('pix');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null);
  const [paypalConfig, setPaypalConfig] = useState<{
    enabled: boolean;
    currency: 'BRL' | 'USD' | 'EUR';
    brl_usd_rate: number;
  } | null>(null);

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
  const [checkoutConsent, setCheckoutConsent] = useState(false);
  const [securityImageSrc, setSecurityImageSrc] = useState('/uploads/seguranca');
  const [payerErrors, setPayerErrors] = useState<string[]>([]);
  const [payerTouched, setPayerTouched] = useState<Record<string, boolean>>({
    first_name: false,
    last_name: false,
    email: false,
    cpf: false,
  });

  const cardFormRef = useRef<any>(null);
  const mpInstanceRef = useRef<any>(null);
  const sdkMountedRef = useRef(false);

  const payerRef = useRef(payer);
  const itemsRef = useRef(items);
  const checkoutConsentRef = useRef(checkoutConsent);
  const checkoutMethodRef = useRef<CheckoutMethod>(checkoutMethod);
  const clearCartRef = useRef(clearCart);
  const navigateRef = useRef(navigate);

  const canSubmitPayer = useMemo(() => {
    return payerErrors.length === 0;
  }, [payerErrors]);

  const requireCheckoutConsent =
    String(settings.lgpd_enabled || 'true') === 'true' &&
    String(settings.lgpd_require_checkout_consent || 'true') === 'true';

  useEffect(() => {
    const errors: string[] = [];
    if (payer.first_name.trim().length < 2) errors.push('Nome inválido');
    if (payer.last_name.trim().length < 2) errors.push('Sobrenome inválido');
    if (!isValidEmail(payer.email)) errors.push('E-mail inválido');
    if (!isValidCPF(payer.cpf)) errors.push('CPF inválido');
    setPayerErrors(errors);
  }, [payer]);

  payerRef.current = payer;
  itemsRef.current = items;
  checkoutConsentRef.current = checkoutConsent;
  checkoutMethodRef.current = checkoutMethod;
  clearCartRef.current = clearCart;
  navigateRef.current = navigate;

  const inputClassName = (field: string, errorState: boolean) => {
    if (!payerTouched[field]) return 'w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all';
    if (errorState) return 'w-full px-4 py-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs font-semibold text-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-500/5 focus:border-rose-400 transition-all';
    return 'w-full px-4 py-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-semibold text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-400 transition-all';
  };

  useEffect(() => {
    if (user) {
      fetch('/api/customer/account')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          const profile = data?.user ?? data;
          if (profile && !profile.error) {
            const [firstName, ...rest] = String(profile.name || '').split(' ');
            const rawStreet = String(profile.billing_address || profile.address || '');
            const parsed = parseLegacyAddress(rawStreet);

            setPayer(prev => ({
              ...prev,
              email: String(profile.email || user.email || prev.email),
              first_name: String(profile.first_name || firstName || prev.first_name),
              last_name: String(profile.last_name || rest.join(' ') || prev.last_name),
              cpf: String(profile.cpf || prev.cpf),
              zip_code: String(profile.billing_zip || prev.zip_code),
              street: parsed.address || prev.street,
              number: parsed.number || prev.number,
              neighborhood: String(profile.billing_neighborhood || prev.neighborhood),
              city: String(profile.billing_city || prev.city),
              state: String(profile.billing_state || prev.state),
            }));
          } else {
            setPayer(prev => ({ ...prev, email: prev.email || user.email || '' }));
          }
        })
        .catch(() => {
          setPayer(prev => ({ ...prev, email: prev.email || user.email || '' }));
        });
    }
  }, [user]);

  const handleCepBlur = async () => {
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
    fetch('/api/checkout/config')
      .then(res => res.ok ? res.json() : null)
      .then(data => setPublicKey(data?.public_key || ''))
      .catch(() => setPublicKey(''));

    fetch('/api/checkout/paypal/config')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setPaypalConfig({
          enabled: data?.enabled === true,
          currency: data?.currency || 'USD',
          brl_usd_rate: parseFloat(data?.brl_usd_rate || '5.20')
        });
      })
      .catch(() => setPaypalConfig({ enabled: false, currency: 'USD', brl_usd_rate: 5.2 }));
  }, []);

  // Inicializa o Mercado Pago SDK
  useEffect(() => {
    if (!publicKey || !(window as any).MercadoPago) return;

    if (checkoutMethod === 'pix' || checkoutMethod === 'paypal') {
      if (cardFormRef.current?.unmount) {
        try {
          cardFormRef.current.unmount();
        } catch (e) {}
      }
      cardFormRef.current = null;
      sdkMountedRef.current = false;
      return;
    }

    if (sdkMountedRef.current) return;
    sdkMountedRef.current = true;

    const timer = setTimeout(() => {
      try {
        const mp = new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
        mpInstanceRef.current = mp;

        cardFormRef.current = mp.cardForm({
          amount: String(totalPrice.toFixed(2)),
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
              if (error) console.warn('CardForm montado com aviso:', error);
            },
            onSubmit: async (event: Event) => {
              event.preventDefault();
              if (!cardFormRef.current) return;
              const currentPayer = payerRef.current;
              const currentItems = itemsRef.current;
              const currentMethod = checkoutMethodRef.current;
              const currentConsent = checkoutConsentRef.current;
              
              setLoadingCheckout(true);
              setStatusMessage('');
              
              try {
                const cardData = cardFormRef.current.getCardFormData();
                const cardPayerEmail = cardData?.cardholderEmail || currentPayer.email;
                const cardPayerCpf = cardData?.identificationNumber || currentPayer.cpf;
                
                if (!isValidEmail(cardPayerEmail) || !isValidCPF(cardPayerCpf)) {
                  setStatusMessage('E-mail ou CPF inválido para pagamento.');
                  setLoadingCheckout(false);
                  return;
                }

                const cardHolderName = cardData?.cardholderName || `${currentPayer.first_name} ${currentPayer.last_name}`;
                const [firstName, ...restName] = String(cardHolderName).trim().split(' ');
                const lastName = restName.join(' ') || currentPayer.last_name;

                const res = await fetch('/api/checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    items: currentItems,
                    payment_method: currentMethod,
                    checkout_data_processing_accepted: currentConsent,
                    payer: {
                      email: cardPayerEmail,
                      first_name: firstName || currentPayer.first_name,
                      last_name: lastName || currentPayer.last_name,
                      cpf: cardPayerCpf,
                      address: currentPayer.street,
                      number: currentPayer.number,
                      neighborhood: currentPayer.neighborhood,
                      city: currentPayer.city,
                      state: currentPayer.state,
                      postal_code: currentPayer.zip_code,
                    },
                    card_token: cardData?.token,
                    installments: currentMethod === 'debit_card' ? 1 : Number(cardData?.installments || 1),
                    issuer_id: cardData?.issuerId || null,
                    payment_method_id: cardData?.paymentMethodId || undefined,
                  }),
                });

                const data = await res.json();
                if (!res.ok) {
                  setStatusMessage(data?.error || 'Falha ao processar pagamento com cartão');
                  setLoadingCheckout(false);
                  return;
                }

                setCheckoutResult(data);
                if (data.status === 'approved') {
                  clearCartRef.current();
                  navigateRef.current(`/obrigado-compra?order_id=${encodeURIComponent(String(data.order_id || ''))}&payment_method=${encodeURIComponent(currentMethod)}`);
                } else {
                  setStatusMessage(`Pagamento pendente ou em análise: status ${data.status}`);
                }
              } catch (err) {
                setStatusMessage('Erro ao processar pagamento.');
              } finally {
                setLoadingCheckout(false);
              }
            }
          }
        });
      } catch (e) {
        console.error('Erro ao iniciar CardForm:', e);
        sdkMountedRef.current = false;
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [checkoutMethod, publicKey, totalPrice]);

  useEffect(() => {
    return () => {
      try {
        if (cardFormRef.current?.unmount) cardFormRef.current.unmount();
      } catch (e) {}
      cardFormRef.current = null;
      mpInstanceRef.current = null;
      sdkMountedRef.current = false;
    };
  }, []);

  // Polling do status do PIX
  useEffect(() => {
    if (!checkoutResult?.payment_id || checkoutResult.payment_method !== 'pix') return;
    if (checkoutResult.status === 'approved') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${checkoutResult.payment_id}/status`);
        const data = await res.json();
        if (data?.status) {
          setCheckoutResult(prev => (prev ? { ...prev, status: data.status } : prev));
          if (data.status === 'approved') {
            clearCart();
            const approvedOrderId = Number(data?.order_id || checkoutResult?.order_id || 0);
            navigate(`/obrigado-compra?order_id=${encodeURIComponent(String(approvedOrderId))}&payment_method=pix`);
          }
        }
      } catch (error) {}
    }, 5000);

    return () => clearInterval(interval);
  }, [checkoutResult, clearCart, navigate]);

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
      navigate('/cadastro?redirect=/carrinho');
      return;
    }
    if (!canSubmitPayer) {
      setStatusMessage('Por favor, preencha corretamente os seus dados pessoais.');
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
          checkout_data_processing_accepted: checkoutConsent,
          payer: {
            ...payer,
            address: payer.street,
            postal_code: payer.zip_code,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data?.error || 'Erro ao iniciar pagamento PIX');
        return;
      }
      setCheckoutResult(data);
      if (data.status === 'approved') {
        clearCart();
        navigate(`/obrigado-compra?order_id=${encodeURIComponent(String(data.order_id || ''))}&payment_method=pix`);
        return;
      }
      setPixExpiresAt(Date.now() + 30 * 60 * 1000);
      setSecondsLeft(30 * 60);
    } catch (error) {
      setStatusMessage('Erro ao conectar com servidor.');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handlePayPalCheckout = async () => {
    if (!user) {
      navigate('/cadastro?redirect=/carrinho');
      return;
    }
    setLoadingCheckout(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          checkout_data_processing_accepted: checkoutConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.approval_url) {
        setStatusMessage(data?.error || 'Erro ao iniciar PayPal');
        setLoadingCheckout(false);
        return;
      }
      window.location.href = data.approval_url;
    } catch {
      setStatusMessage('Erro ao conectar com PayPal.');
      setLoadingCheckout(false);
    }
  };

  const handleCopyPix = async () => {
    if (!checkoutResult?.qr_code) return;
    await navigator.clipboard.writeText(checkoutResult.qr_code);
    setStatusMessage('Código PIX copiado com sucesso!');
  };

  // Se o carrinho estiver vazio
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-md">
          <ShoppingBag className="w-9 h-9" />
        </div>
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Seu Carrinho está Vazio</h2>
        <p className="text-slate-500 font-medium text-[11px] max-w-[250px] mb-8 leading-relaxed">
          Parece que você ainda não adicionou nenhuma matriz de bordado.
        </p>
        <Link to={window.location.search.includes('mobile=true') ? '/?mobile=true' : '/'} className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all text-center">
          Explorar Coleções
        </Link>
      </div>
    );
  }

  // Se o PIX foi gerado e está aguardando pagamento
  if (checkoutResult?.payment_method === 'pix' && checkoutResult.status !== 'approved') {
    return (
      <div className="flex flex-col gap-6 py-2">
        <div className="text-center flex flex-col items-center gap-1.5 bg-amber-50 border border-amber-100 p-4 rounded-3xl">
          <Clock className="w-8 h-8 text-amber-500 animate-pulse" />
          <h2 className="text-sm font-black text-amber-950 uppercase tracking-wider mt-1">Aguardando Pagamento</h2>
          <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">
            Seu código PIX expira em: {formatSeconds(secondsLeft)}
          </p>
        </div>

        {statusMessage && (
          <div className="p-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl text-[10px] font-black text-center uppercase tracking-wider flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            {statusMessage}
          </div>
        )}

        {/* QR Code Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 flex flex-col items-center gap-5 shadow-sm text-center">
          {checkoutResult.qr_code_base64 && (
            <div className="w-48 h-48 bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-center justify-center">
              <img
                src={`data:image/jpeg;base64,${checkoutResult.qr_code_base64}`}
                alt="QR Code Pix"
                className="max-w-full max-h-full"
              />
            </div>
          )}
          
          <div className="flex flex-col gap-1 w-full">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do Pedido:</span>
            <span className="text-2xl font-black text-slate-900">{formatCurrency(totalPrice)}</span>
          </div>

          <button
            onClick={handleCopyPix}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-blue-500/10 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" /> Copiar Código PIX
          </button>

          <p className="text-[9px] text-slate-400 leading-relaxed max-w-[90%] font-medium">
            Abra o app do seu banco, escolha a opção "PIX Copia e Cola" ou aponte a câmera para o QR Code acima. A liberação do download é automática em poucos segundos!
          </p>
        </div>

        <button
          onClick={() => setCheckoutResult(null)}
          className="w-full py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest active:bg-slate-50 transition-colors"
        >
          Alterar Método de Pagamento
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Header do Carrinho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="p-2.5 bg-white border border-slate-100 rounded-xl active:scale-90 transition-transform">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Meu Carrinho</h2>
        </div>
        <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
          {totalItems} Matrizes
        </span>
      </div>

      {/* Banner Checkout Promocional (Mobile) */}
      <div className="w-full rounded-2xl overflow-hidden bg-white border border-slate-100 flex items-center justify-center shadow-sm">
        <picture className="w-full h-auto block">
          <source srcSet="/uploads/banner_checkout.webp" type="image/webp" />
          <img
            src="/uploads/banner_checkout.png"
            alt="Banner Checkout"
            loading="lazy"
            width={1080}
            height={500}
            className="w-full h-auto aspect-[1080/500] object-contain rounded-2xl"
          />
        </picture>
      </div>

      {/* Selo de Segurança do Pagamento (Mobile) */}
      <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-center shadow-sm">
        <img
          src={securityImageSrc}
          alt="Ambiente Seguro de Pagamento"
          loading="lazy"
          onError={() => {
            if (securityImageSrc.endsWith('/seguranca')) setSecurityImageSrc('/uploads/seguranca.jpeg');
          }}
          className="w-full h-auto object-contain rounded-2xl"
        />
      </div>

      {statusMessage && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-shake">
          <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Lista de Itens do Carrinho Mobile */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-4 shadow-sm flex flex-col gap-4">
        <div className="divide-y divide-slate-50">
          {items.map((item) => (
            <div key={item.product_id} className="py-4 first:pt-0 last:pb-0 flex items-center gap-3.5 group">
              <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden flex-shrink-0">
                <img src={item.product_image || ''} alt={item.product_name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate">
                  {item.product_name}
                </h4>
                <span className="text-xs font-extrabold text-blue-600 block mt-0.5">
                  {formatCurrency(item.price)}
                </span>
              </div>
              <button
                onClick={() => removeFromCart(item.product_id)}
                className="p-2.5 bg-rose-50 text-rose-500 rounded-xl active:scale-90 hover:bg-rose-500 hover:text-white transition-all flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>


      {/* Formulário Completo de Dados do Comprador e Endereço */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-5 shadow-sm flex flex-col gap-4">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          Seus Dados de Faturamento
        </h3>

        <div className="flex flex-col gap-3.5">
          {/* Nome & Sobrenome */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
              <input
                type="text"
                placeholder="Seu nome"
                value={payer.first_name}
                onChange={(e) => setPayer(prev => ({ ...prev, first_name: e.target.value }))}
                onBlur={() => setPayerTouched(prev => ({ ...prev, first_name: true }))}
                className={inputClassName('first_name', payer.first_name.trim().length < 2)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Sobrenome</label>
              <input
                type="text"
                placeholder="Seu sobrenome"
                value={payer.last_name}
                onChange={(e) => setPayer(prev => ({ ...prev, last_name: e.target.value }))}
                onBlur={() => setPayerTouched(prev => ({ ...prev, last_name: true }))}
                className={inputClassName('last_name', payer.last_name.trim().length < 2)}
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
            <input
              type="email"
              placeholder="exemplo@email.com"
              value={payer.email}
              onChange={(e) => setPayer(prev => ({ ...prev, email: e.target.value }))}
              onBlur={() => setPayerTouched(prev => ({ ...prev, email: true }))}
              className={inputClassName('email', !isValidEmail(payer.email))}
            />
          </div>

          {/* CPF */}
          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF</label>
            <input
              type="text"
              placeholder="000.000.000-00"
              value={payer.cpf}
              onChange={(e) => setPayer(prev => ({ ...prev, cpf: maskCPF(e.target.value) }))}
              onBlur={() => setPayerTouched(prev => ({ ...prev, cpf: true }))}
              className={inputClassName('cpf', !isValidCPF(payer.cpf))}
            />
          </div>

          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider pt-2 border-t border-slate-50">Endereço</h4>

          {/* CEP e Rua */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 col-span-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CEP</label>
              <input
                type="text"
                placeholder="00000-000"
                value={payer.zip_code}
                onChange={(e) => setPayer(prev => ({ ...prev, zip_code: e.target.value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2') }))}
                onBlur={handleCepBlur}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-center"
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Rua/Avenida</label>
              <input
                type="text"
                placeholder="Nome da rua"
                value={payer.street}
                onChange={(e) => setPayer(prev => ({ ...prev, street: e.target.value }))}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Número e Bairro */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 col-span-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Número</label>
              <input
                type="text"
                placeholder="123"
                value={payer.number}
                onChange={(e) => setPayer(prev => ({ ...prev, number: e.target.value }))}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
              <input
                type="text"
                placeholder="Nome do bairro"
                value={payer.neighborhood}
                onChange={(e) => setPayer(prev => ({ ...prev, neighborhood: e.target.value }))}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Cidade e Estado */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
              <input
                type="text"
                placeholder="Sua cidade"
                value={payer.city}
                onChange={(e) => setPayer(prev => ({ ...prev, city: e.target.value }))}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              />
            </div>
            <div className="flex flex-col gap-1 col-span-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
              <input
                type="text"
                placeholder="UF"
                value={payer.state}
                onChange={(e) => setPayer(prev => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
                className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-center"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Formas de Pagamento Mobile Quádrupla */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-5 shadow-sm flex flex-col gap-4">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-50 pb-2">
          Método de Pagamento
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCheckoutMethod('pix')}
            className={`px-2 py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border transition-all ${
              checkoutMethod === 'pix'
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10 scale-[1.02]'
                : 'bg-slate-50 border-slate-100 text-slate-500'
            }`}
          >
            PIX
          </button>
          <button
            type="button"
            onClick={() => setCheckoutMethod('credit_card')}
            className={`px-2 py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border transition-all ${
              checkoutMethod === 'credit_card'
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10 scale-[1.02]'
                : 'bg-slate-50 border-slate-100 text-slate-500'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" /> Crédito
          </button>
          <button
            type="button"
            onClick={() => setCheckoutMethod('debit_card')}
            className={`px-2 py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border transition-all ${
              checkoutMethod === 'debit_card'
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10 scale-[1.02]'
                : 'bg-slate-50 border-slate-100 text-slate-500'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" /> Débito
          </button>
          {paypalConfig?.enabled && (
            <button
              type="button"
              onClick={() => setCheckoutMethod('paypal')}
              className={`px-2 py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border transition-all ${
                checkoutMethod === 'paypal'
                  ? 'bg-[#0070ba] border-[#0070ba] text-white shadow-md shadow-blue-500/10 scale-[1.02]'
                  : 'bg-slate-50 border-slate-100 text-slate-500'
              }`}
            >
              PayPal
            </button>
          )}
        </div>

        {/* Formulário do Cartão - Integrado do Mercado Pago (Crédito & Débito) */}
        <div className={(checkoutMethod === 'credit_card' || checkoutMethod === 'debit_card') ? 'block' : 'hidden'}>
          <form id="form-checkout" className="flex flex-col gap-3.5 pt-2">
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Número do Cartão</label>
              <input type="text" id="form-checkout__cardNumber" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none min-h-[46px]" />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Validade</label>
                <input type="text" id="form-checkout__expirationDate" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none min-h-[46px]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CVV</label>
                <input type="text" id="form-checkout__securityCode" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none min-h-[46px]" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
              <input type="text" id="form-checkout__cardholderName" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcelas</label>
                <select id="form-checkout__installments" className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none min-h-[46px]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Emissor</label>
                <select id="form-checkout__issuer" className="w-full px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none min-h-[46px]" />
              </div>
            </div>

            {/* Campos Ocultos Obrigatórios para o SDK */}
            <select id="form-checkout__identificationType" className="hidden" />
            <input type="text" id="form-checkout__identificationNumber" className="hidden" value={payer.cpf} readOnly />
            <input type="email" id="form-checkout__email" className="hidden" value={payer.email} readOnly />

            {/* Consentimento LGPD Obrigatório */}
            {requireCheckoutConsent && (
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[10px] font-semibold text-slate-600 mt-2">
                <input
                  type="checkbox"
                  checked={checkoutConsent}
                  onChange={(e) => setCheckoutConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Autorizo o processamento dos meus dados para concluir esta compra.</span>
              </label>
            )}

            <button
              type="submit"
              disabled={loadingCheckout || !canSubmitPayer || (requireCheckoutConsent && !checkoutConsent)}
              className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-md shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all mt-2"
            >
              {loadingCheckout ? 'Processando...' : 'Finalizar Pagamento'}
            </button>
          </form>
        </div>

        {/* PayPal UI - visível apenas quando método = paypal */}
        {paypalConfig?.enabled && (
          <div className={checkoutMethod === 'paypal' ? 'space-y-4 pt-2' : 'hidden'}>
            {requireCheckoutConsent && (
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[10px] font-semibold text-slate-600 mt-2">
                <input
                  type="checkbox"
                  checked={checkoutConsent}
                  onChange={(e) => setCheckoutConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Autorizo o processamento dos meus dados para concluir esta compra.</span>
              </label>
            )}
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-100 text-[11px] text-blue-800 font-medium leading-relaxed">
              <strong>Recebimento PayPal em {paypalConfig?.currency || 'USD'}.</strong><br />
              O valor é convertido automaticamente conforme a moeda padrão configurada.
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-[10px] font-semibold text-slate-600">
              <div className="flex justify-between">
                <span>Total em BRL:</span>
                <span className="text-slate-800 font-black">R$ {totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cotação:</span>
                <span>
                  1 {paypalConfig?.currency || 'USD'} = R$ {Number(paypalConfig?.currency === 'BRL' ? 1 : (paypalConfig?.brl_usd_rate ?? 5.2)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5">
                <span>Estimado em {paypalConfig?.currency || 'USD'}:</span>
                <span className="text-blue-700 font-black">
                  {paypalConfig?.currency === 'BRL' ? 'R$' : '$'}{' '}
                  {Number(paypalConfig?.currency === 'BRL' ? totalPrice : totalPrice / (paypalConfig?.brl_usd_rate ?? 5.2)).toFixed(2)}
                </span>
              </div>
            </div>
            <button
              onClick={handlePayPalCheckout}
              disabled={loadingCheckout || (requireCheckoutConsent && !checkoutConsent)}
              className="w-full bg-[#0070ba] text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-md shadow-blue-500/10 active:scale-95 transition-all"
            >
              {loadingCheckout ? 'Processando...' : 'Pagar com PayPal'}
            </button>
          </div>
        )}

        {/* Botão para o PIX */}
        {checkoutMethod === 'pix' && (
          <div className="flex flex-col gap-3.5 pt-2">
            {requireCheckoutConsent && (
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[10px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={checkoutConsent}
                  onChange={(e) => setCheckoutConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Autorizo o processamento dos meus dados para concluir esta compra.</span>
              </label>
            )}
            
            <button
              onClick={handlePixCheckout}
              disabled={loadingCheckout || !canSubmitPayer || (requireCheckoutConsent && !checkoutConsent)}
              className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-md shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {loadingCheckout ? 'Gerando PIX...' : `Pagar R$ ${totalPrice.toFixed(2)} com PIX`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
