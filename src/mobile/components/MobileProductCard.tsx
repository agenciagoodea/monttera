import React from 'react';
import { Heart, ShoppingCart, Check, Star } from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency, isNewProduct, normalizePublicMediaUrl } from '../../lib/utils';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useAppData } from '../../contexts/AppDataContext';
import { Link, useNavigate } from 'react-router-dom';

interface MobileProductCardProps {
  product: Product;
  key?: React.Key;
}

export default function MobileProductCard({ product }: MobileProductCardProps) {
  const navigate = useNavigate();
  const { addToCart, items } = useCart();
  const { settings } = useAppData();
  const { isFavorite, toggleFavorite } = useFavorites();

  const isInCart = items.some(item => item.product_id === product.id);
  const isProductFavorite = isFavorite(product.id);

  const showNewBadge = isNewProduct(
    product.created_at,
    settings.new_badge_days,
    Number(product.is_new) === 1,
  );

  const redirectToCheckout = String(settings.redirect_to_checkout_after_add_to_cart || 'false') === 'true';
  const productImageUrl = normalizePublicMediaUrl(product.image);

  // Preço base
  const basePrice = Number(product.sale_price || product.price);
  
  // Preço com desconto no PIX (à vista menor) - 5% de desconto padrão
  const pixPrice = basePrice * 0.95;

  // Parcelamento em destaque (até 3x sem juros)
  const installPrice = basePrice / 3;

  // Desconto em percentual se houver promoção
  const promoDiscount = product.sale_price 
    ? Math.round(((product.price - product.sale_price) / product.price) * 100)
    : 0;

  // Formatos permitidos (sem EMP)
  const allowedFormats = ['PES', 'JEF', 'DST', 'EXP', 'XXX'];

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 p-3.5 relative flex flex-col justify-between h-full shadow-[0_4px_16px_rgba(0,0,0,0.01)] hover:shadow-lg transition-all duration-300 overflow-hidden active:scale-[0.99]">
      {/* Badges de Destaque */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
        {showNewBadge && (
          <span className="bg-[#FF9900] text-white text-[8px] font-black px-2 py-0.5 rounded-lg shadow-sm tracking-wider uppercase">
            Novo
          </span>
        )}
      </div>

      {/* Botão de Favorito */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(product.id, product.name);
        }}
        aria-label={isProductFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        className="absolute top-3 right-3 z-10 p-2 bg-white/90 backdrop-blur-sm border border-slate-100 rounded-full shadow-sm active:scale-90 transition-transform flex items-center justify-center"
      >
        <Heart className={`w-4 h-4 ${isProductFavorite ? 'text-red-500 fill-current' : 'text-slate-400'}`} />
      </button>

      {/* Imagem do Produto */}
      <Link 
        to={`/produto/${product.slug}`} 
        className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-50 border border-slate-50 flex-shrink-0 block"
      >
        <img 
          src={productImageUrl} 
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </Link>

      {/* Conteúdo do Card */}
      <div className="flex-grow flex flex-col justify-between mt-3">
        {/* Título */}
        <div className="flex-1 min-w-0">
          <Link to={`/produto/${product.slug}`} className="block">
            <h3 className="text-xs font-black text-slate-800 line-clamp-2 min-h-[32px] mb-2 leading-snug uppercase tracking-tight hover:text-blue-600 transition-colors">
              {product.name}
            </h3>
          </Link>
        </div>

        {/* Bloco de Preços & Botão Comprar Inline */}
        <div className="pt-2 border-t border-slate-50 flex items-center justify-between mt-auto">
          <div className="flex flex-col">
            {/* Preço de Tabela Riscado se em Promoção */}
            {product.sale_price ? (
              <>
                <span className="text-[10px] text-slate-400 line-through font-bold leading-none mb-0.5">
                  {formatCurrency(product.price)}
                </span>
                <span className="text-emerald-600 font-black text-sm leading-none">
                  {formatCurrency(product.sale_price)}
                </span>
              </>
            ) : (
              <span className="text-blue-600 font-black text-sm leading-none">
                {formatCurrency(product.price)}
              </span>
            )}
          </div>

          {/* Botão de Compra Compacto e Elegante */}
          <button
            onClick={(e) => {
              e.preventDefault();
              addToCart(product);
              if (redirectToCheckout) {
                navigate('/carrinho');
              }
            }}
            disabled={isInCart}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 border ${
              isInCart
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-emerald-100'
                : 'bg-blue-600 border-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
            }`}
          >
            {isInCart ? (
              <>
                <Check className="w-3.5 h-3.5" /> Ok
              </>
            ) : (
              <>
                <ShoppingCart className="w-3.5 h-3.5" /> Comprar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
