import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import { useCart } from '../contexts/CartContext';

type CaptureState = 'loading' | 'success' | 'error';

export default function PayPalSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [state, setState] = useState<CaptureState>('loading');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token'); // PayPal passes token = paypal_order_id
    if (!token) {
      setState('error');
      setErrorMsg('Token de pagamento não encontrado na URL.');
      return;
    }

    async function capturePayment() {
      try {
        const res = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paypal_order_id: token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          clearCart();
          setOrderId(data.order_id);
          navigate(`/obrigado-compra?order_id=${encodeURIComponent(String(data.order_id || ''))}&payment_method=paypal`, { replace: true });
          return;
        } else {
          setState('error');
          setErrorMsg(data?.error || 'Falha ao confirmar pagamento. Entre em contato com o suporte.');
        }
      } catch {
        setState('error');
        setErrorMsg('Erro de conexão ao confirmar pagamento.');
      }
    }

    capturePayment();
  }, [searchParams, clearCart, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-10 md:p-16 max-w-lg w-full text-center"
      >
        {state === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-blue-600 mx-auto mb-6 animate-spin" />
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">Confirmando Pagamento</h1>
            <p className="text-slate-500 font-medium">Aguarde, estamos confirmando seu pagamento com o PayPal...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">Pagamento Confirmado!</h1>
            <p className="text-slate-500 font-medium mb-2">
              Seu pedido {orderId ? `#${orderId}` : ''} foi pago com sucesso via PayPal.
            </p>
            <p className="text-slate-400 text-sm mb-8">
              Seus arquivos de bordado já estão disponíveis na sua conta.
            </p>
            <Link
              to="/minha-conta"
              className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
            >
              <ShoppingBag className="w-4 h-4" />
              Ir para Minha Conta
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">Erro no Pagamento</h1>
            <p className="text-slate-500 font-medium mb-8">{errorMsg}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/carrinho"
                className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Voltar ao Carrinho
              </Link>
              <Link
                to="/minha-conta"
                className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors"
              >
                Minha Conta
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
