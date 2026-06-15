import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { X, ShoppingBag } from 'lucide-react';
import { normalizePublicMediaUrl } from '../lib/utils';

// Lista de nomes fornecida pelo usuário
const RANDOM_NAMES = [
  'Adriano', 'Iraci', 'Carla', 'Fernanda', 'Juliana', 
  'Márcia', 'Renata', 'Ana Paula', 'Rosângela', 'Camila', 
  'Patrícia', 'Sandra', 'Michele', 'Vanessa', 'Priscila', 
  'Luciana', 'Simone', 'Elaine', 'Cristiane', 'Débora'
];

// Lista de tempos fictícios curtos
const RELATIVE_TIMES = [
  'há poucos minutos',
  'há 2 minutos',
  'há 4 minutos',
  'há 7 minutos',
  'há 10 minutos',
  'há 15 minutos',
  'há 18 minutos'
];

interface SimpleProduct {
  id: number;
  name: string;
  slug: string;
  image?: string | null;
}

export default function SocialProofNotification() {
  const location = useLocation();
  const { settings } = useAppData();
  
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [currentNotification, setCurrentNotification] = useState<{
    product: SimpleProduct;
    buyerName: string;
    timeAgo: string;
  } | null>(null);
  
  const [isVisible, setIsVisible] = useState(false);
  const [hasDismissed, setHasDismissed] = useState(false);

  // 1. Verificações de exibição inicial
  const isEnabled = String(settings.social_proof_enabled || 'true') === 'true';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isLoginRoute = location.pathname === '/login';

  // Se o recurso estiver desativado ou estiver em rotas administrativas/login, não renderiza nada
  if (!isEnabled || isAdminRoute || isLoginRoute || hasDismissed) {
    return null;
  }

  // 2. Carregar produtos recentes da API
  useEffect(() => {
    async function loadRecentProducts() {
      try {
        const res = await fetch('/api/products?limit=50');
        if (!res.ok) return;
        const data = await res.json();
        
        if (data && Array.isArray(data.products) && data.products.length > 0) {
          // Filtra produtos ativos (a API já retorna ativos, mas garante segurança de campos mínimos)
          const activeList = data.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            image: p.image || null
          }));
          setProducts(activeList);
        }
      } catch (err) {
        console.error('Erro ao carregar produtos para a prova social:', err);
      }
    }

    loadRecentProducts();
  }, []);

  // 3. Controlar o ciclo de exibição das notificações
  useEffect(() => {
    if (products.length === 0) return;

    let displayTimeout: NodeJS.Timeout;
    let nextNotificationTimeout: NodeJS.Timeout;

    function triggerNext() {
      // Seleciona um produto aleatório da lista de recentes
      const randomProduct = products[Math.floor(Math.random() * products.length)];
      // Seleciona um nome aleatório
      const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
      // Seleciona um tempo decorrido aleatório
      const randomTime = RELATIVE_TIMES[Math.floor(Math.random() * RELATIVE_TIMES.length)];

      setCurrentNotification({
        product: randomProduct,
        buyerName: randomName,
        timeAgo: randomTime
      });
      
      setIsVisible(true);

      // A notificação fica exibida por 5.5 segundos
      displayTimeout = setTimeout(() => {
        setIsVisible(false);
      }, 5500);

      // Agenda a próxima notificação para ocorrer entre 8 e 15 segundos depois
      const nextDelay = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
      nextNotificationTimeout = setTimeout(triggerNext, nextDelay + 5500); // soma o tempo de exibição
    }

    // Dispara a primeira notificação após 4 segundos do carregamento inicial
    const initialTimer = setTimeout(triggerNext, 4000);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(displayTimeout);
      clearTimeout(nextNotificationTimeout);
    };
  }, [products]);

  // Se não houver notificação ativa ou produtos, não renderiza nada na DOM
  if (!currentNotification) {
    return null;
  }

  const { product, buyerName, timeAgo } = currentNotification;
  const productImageUrl = product.image ? normalizePublicMediaUrl(product.image) : '';

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    setHasDismissed(true);
  };

  return (
    <div className="fixed bottom-24 left-4 md:bottom-6 md:left-6 z-[999] font-sans pointer-events-none select-none max-w-[340px] w-[calc(100vw-32px)]">
      {/* Estilos CSS inline para animações de entrada/saída com curvas modernas de transição */}
      <style>{`
        @keyframes social-proof-in {
          0% {
            transform: translateY(24px) scale(0.96);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes social-proof-out {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(16px) scale(0.96);
            opacity: 0;
          }
        }
        .social-proof-card {
          box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(226, 232, 240, 0.8);
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: border-color 0.3s, transform 0.2s;
        }
        .social-proof-card:hover {
          border-color: rgba(59, 130, 246, 0.3);
          transform: translateY(-2px);
        }
        .social-proof-enter {
          animation: social-proof-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: auto;
        }
        .social-proof-exit {
          animation: social-proof-out 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
        }
      `}</style>

      <div 
        className={`social-proof-card rounded-[20px] p-3 flex items-center gap-3 relative transition-all duration-300 ${
          isVisible ? 'social-proof-enter' : 'social-proof-exit'
        }`}
      >
        {/* Link que cobre o card inteiro para levar ao produto */}
        <Link 
          to={`/produto/${product.slug}`} 
          className="absolute inset-0 rounded-[20px] z-10"
          aria-label={`Ver produto ${product.name}`}
        />

        {/* Imagem em Miniatura do Produto */}
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 relative flex items-center justify-center">
          {productImageUrl ? (
            <img 
              src={productImageUrl} 
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback caso a imagem dê erro ao carregar
                (e.target as HTMLImageElement).src = '';
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLElement).parentElement;
                if (parent) {
                  const fallbackIcon = parent.querySelector('.fallback-icon');
                  if (fallbackIcon) fallbackIcon.classList.remove('hidden');
                }
              }}
            />
          ) : null}

          {/* Ícone de Fallback se não tiver imagem */}
          <div className={`fallback-icon w-full h-full bg-slate-100 text-slate-400 flex items-center justify-center ${productImageUrl ? 'hidden' : ''}`}>
            <ShoppingBag className="w-5 h-5 text-blue-500/80" />
          </div>
        </div>

        {/* Informações da Notificação */}
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-[11px] md:text-xs text-slate-500 font-semibold leading-none mb-1">
            <span className="font-extrabold text-slate-800">{buyerName}</span> comprou uma matriz
          </p>
          <h4 className="text-xs md:text-[13px] font-black text-slate-800 leading-tight uppercase tracking-tight truncate">
            {product.name}
          </h4>
          <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
            {timeAgo}
          </span>
        </div>

        {/* Botão de Fechar */}
        <button 
          onClick={handleClose}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100/50 transition-colors z-20 pointer-events-auto"
          title="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
