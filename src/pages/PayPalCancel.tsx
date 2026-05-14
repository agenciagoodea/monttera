import { Link } from 'react-router-dom';
import { XCircle, ShoppingCart } from 'lucide-react';
import { motion } from 'motion/react';

export default function PayPalCancel() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-10 md:p-16 max-w-lg w-full text-center"
      >
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">
          Pagamento Cancelado
        </h1>
        <p className="text-slate-500 font-medium mb-2">
          Você cancelou o pagamento via PayPal.
        </p>
        <p className="text-slate-400 text-sm mb-8">
          Seu carrinho foi mantido. Você pode tentar novamente ou escolher outro método de pagamento.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/carrinho"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
          >
            <ShoppingCart className="w-4 h-4" />
            Voltar ao Carrinho
          </Link>
          <Link
            to="/"
            className="px-8 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
          >
            Continuar Comprando
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
