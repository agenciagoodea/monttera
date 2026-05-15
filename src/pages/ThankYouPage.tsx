import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type DownloadItem = {
  order_id: number;
  product_name?: string;
  file_path?: string;
};

export default function ThankYouPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [downloadItem, setDownloadItem] = useState<DownloadItem | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const orderIdParam = Number(searchParams.get('order_id') || 0);
  const paymentMethod = String(searchParams.get('payment_method') || '').trim().toUpperCase();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login?redirect=/obrigado-compra');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const loadDownloads = async () => {
      try {
        const res = await fetch('/api/customer/downloads');
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          setStatusMessage(data?.error || 'Nao foi possivel carregar seus downloads agora.');
          return;
        }

        const matched = orderIdParam > 0
          ? data.find((item: any) => Number(item?.order_id) === orderIdParam && item?.file_path)
          : data.find((item: any) => item?.file_path);

        if (matched) {
          setDownloadItem({
            order_id: Number(matched.order_id || 0),
            product_name: String(matched.product_name || ''),
            file_path: String(matched.file_path || ''),
          });
        } else {
          setStatusMessage('Seu arquivo sera disponibilizado em instantes na area "Matrizes Compradas".');
        }
      } catch {
        setStatusMessage('Nao foi possivel carregar seus downloads agora.');
      }
    };

    loadDownloads();
  }, [user, orderIdParam]);

  const directDownloadHref = useMemo(() => {
    if (!downloadItem?.file_path) return '';
    return `/api/customer/download-file?path=${encodeURIComponent(downloadItem.file_path)}`;
  }, [downloadItem?.file_path]);

  const handleDirectDownload = () => {
    if (!directDownloadHref) return;
    setDownloading(true);
    window.location.href = directDownloadHref;
    setTimeout(() => setDownloading(false), 1500);
  };

  if (loading || !user) {
    return (
      <div className="max-w-[960px] mx-auto px-6 py-16">
        <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-slate-500 font-semibold">
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-6 py-16">
      <div className="rounded-[2rem] border border-emerald-100 bg-white p-8 md:p-12 shadow-xl shadow-emerald-100/30">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>

        <h1 className="text-center text-3xl md:text-4xl font-black text-slate-800 uppercase tracking-tight mb-3">
          Obrigado pela compra
        </h1>
        <p className="text-center text-slate-600 font-semibold mb-1">
          Pagamento confirmado com sucesso{orderIdParam > 0 ? ` no pedido #${orderIdParam}` : ''}.
        </p>
        {paymentMethod && (
          <p className="text-center text-xs uppercase tracking-wider font-black text-slate-400 mb-8">
            Metodo: {paymentMethod}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/minha-conta/downloads"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Ir para Matrizes Compradas
          </Link>

          <button
            type="button"
            disabled={!directDownloadHref || downloading}
            onClick={handleDirectDownload}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Baixando...' : 'Baixar arquivo direto'}
          </button>
        </div>

        {(statusMessage || downloadItem?.product_name) && (
          <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 font-semibold">
            {downloadItem?.product_name && (
              <p className="text-slate-700 mb-1">
                Arquivo principal: <strong>{downloadItem.product_name}</strong>
              </p>
            )}
            {statusMessage && <p>{statusMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

