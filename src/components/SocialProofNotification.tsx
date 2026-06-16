import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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

    // Tempo de delay configurado pelo admin (mínimo de 5s, padrão 10s)
    const delaySeconds = Math.max(5, Number(settings.social_proof_delay || 10));
    // Duração que a notificação fica visível (no máximo 5.5s ou metade do delay configurado para dar tempo de sumir)
    const displayTime = Math.min(5500, (delaySeconds * 1000) / 2);

    function triggerNext() {
      if (hasDismissed) return;

      const randomProduct = products[Math.floor(Math.random() * products.length)];
      const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
      const randomTime = RELATIVE_TIMES[Math.floor(Math.random() * RELATIVE_TIMES.length)];

      setCurrentNotification({
        product: randomProduct,
        buyerName: randomName,
        timeAgo: randomTime
      });
      
      setIsVisible(true);

      // A notificação fica exibida pela duração calculada
      displayTimeout = setTimeout(() => {
        setIsVisible(false);
      }, displayTime);

      // Agenda a próxima notificação usando o intervalo de alternância total configurado
      nextNotificationTimeout = setTimeout(triggerNext, delaySeconds * 1000);
    }

    // Dispara a primeira notificação após 4 segundos do carregamento inicial
    const initialTimer = setTimeout(triggerNext, 4000);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(displayTimeout);
      clearTimeout(nextNotificationTimeout);
    };
  }, [products, settings.social_proof_delay, hasDismissed]);

  // Se não houver notificação ativa ou produtos, não renderiza nada na DOM
  if (!currentNotification) {
    return null;
  }

  const { product, buyerName, timeAgo } = currentNotification;
  const productImageUrl = product.image ? normalizePublicMediaUrl(product.image) : '';

  // Handler para fechar o widget (correção para evitar tela branca de desmonte síncrono no React)
  const handleClose = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    
    // Apenas desmonsta fisicamente o componente após terminar a transição de saída do CSS (400ms)
    // Isso evita o erro 'Minified React error #300' na propagação de eventos
    setTimeout(() => {
      setHasDismissed(true);
    }, 400);
  };

  // Handler para navegar programaticamente se clicar no card
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.close-btn')) {
      return;
    }
    navigate(`/produto/${product.slug}`);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 md:top-auto md:bottom-6 md:left-6 md:translate-x-0 z-[9999] font-sans pointer-events-none select-none max-w-[340px] w-[calc(100vw-32px)]">
      {/* Estilos CSS com suporte responsivo a animações via Media Queries */}
      <style>{`
        /* Animações Padrão (Mobile - Topo Centro) */
        @keyframes social-proof-in-mobile {
          0% {
            transform: translateY(-40px) scale(0.96);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes social-proof-out-mobile {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-40px) scale(0.96);
            opacity: 0;
          }
        }
        
        .social-proof-card {
          box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(226, 232, 240, 0.85);
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          transition: border-color 0.3s, transform 0.2s;
        }
        .social-proof-card:hover {
          border-color: rgba(59, 130, 246, 0.3);
          transform: translateY(1px);
        }
        .social-proof-enter {
          animation: social-proof-in-mobile 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: auto;
        }
        .social-proof-exit {
          animation: social-proof-out-mobile 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
        }

        /* Estilos e Animações para Desktop (md) */
        @media (min-width: 768px) {
          @keyframes social-proof-in-desktop {
            0% {
              transform: translateY(24px) scale(0.96);
              opacity: 0;
            }
            100% {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
          }
          @keyframes social-proof-out-desktop {
            0% {
              transform: translateY(0) scale(1);
              opacity: 1;
            }
            100% {
              transform: translateY(16px) scale(0.96);
              opacity: 0;
            }
          }
          .social-proof-card:hover {
            transform: translateY(-2px);
          }
          .social-proof-enter {
            animation: social-proof-in-desktop 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .social-proof-exit {
            animation: social-proof-out-desktop 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        }
      `}</style>

      <div 
        onClick={handleCardClick}
        className={`social-proof-card rounded-[20px] p-3 flex items-center gap-3 relative transition-all duration-300 cursor-pointer ${
          isVisible ? 'social-proof-enter' : 'social-proof-exit'
        }`}
      >
        {/* Imagem em Miniatura do Produto */}
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 relative flex items-center justify-center">
          {productImageUrl ? (
            <img 
              src={productImageUrl} 
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
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

          <div className={`fallback-icon w-full h-full bg-slate-100 text-slate-400 flex items-center justify-center ${productImageUrl ? 'hidden' : ''}`}>
            <ShoppingBag className="w-5 h-5 text-blue-500/80" />
          </div>
        </div>

        {/* Informações da Notificação */}
        <div className="flex-1 min-w-0 pr-6">
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
          className="absolute top-1 right-1 md:top-2 md:right-2 text-slate-400 hover:text-slate-600 rounded-full p-2.5 hover:bg-slate-100/50 transition-colors z-30 pointer-events-auto close-btn"
          aria-label="Fechar notificação"
          title="Fechar"
        >
          <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
        </button>
      </div>
    </div>
  );
}
