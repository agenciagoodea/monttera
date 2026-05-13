import React from 'react';
import { Heart, ShoppingBag, Check } from 'lucide-react';
import { Product } from '../types';
import { formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';
import { useCart } from '../contexts/CartContext';
import { Link } from 'react-router-dom';
import { useFavorites } from '../contexts/FavoritesContext';

interface ProductCardProps {
  product: Product;
  key?: React.Key;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, items } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isInCart = items.some(item => item.product_id === product.id);
  const isProductFavorite = isFavorite(product.id);
  const showNewBadge = Number(product.is_new) === 1;

  const discount = product.sale_price 
    ? Math.round(((product.price - product.sale_price) / product.price) * 100)
    : 0;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2rem] border border-slate-100 p-4 relative group hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 flex flex-col h-full overflow-hidden"
    >
      {/* Badges */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {showNewBadge ? (
          <span className="bg-[#FF9900] text-white text-[9px] font-black px-3 py-1 rounded-lg shadow-lg shadow-orange-200 tracking-widest uppercase">Novo</span>
        ) : null}
      </div>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(product.id, product.name);
        }}
        aria-label={isProductFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        className={`absolute top-4 right-4 z-10 transition-colors bg-white p-2 rounded-full shadow-sm transition-opacity ${
          isProductFavorite
            ? 'opacity-100 text-red-500'
            : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500'
        }`}
      >
        <Heart className={`w-4 h-4 ${isProductFavorite ? 'fill-current' : ''}`} />
      </button>

      {/* Image Container */}
      <Link to={`/produto/${product.slug}`} className="relative aspect-square mb-4 bg-slate-50 rounded-2xl overflow-hidden group-hover:bg-slate-100/50 transition-colors block">
        <img 
          src={product.image} 
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 p-6"
        />
        {discount > 0 && (
          <div className="absolute bottom-3 right-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-lg">
            {discount}% OFF
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="px-1 flex-grow flex flex-col">
        <Link to={`/produto/${product.slug}`} className="block">
          <h3 className="text-xs font-black text-slate-800 line-clamp-2 min-h-[32px] mb-3 leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>
        
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
          <div className="flex flex-col">
            {product.sale_price ? (
              <>
                <span className="text-[10px] text-slate-400 line-through font-bold">
                  {formatCurrency(product.price)}
                </span>
                <span className="text-emerald-600 font-black text-sm">
                  {formatCurrency(product.sale_price)}
                </span>
              </>
            ) : (
              <span className="text-primary font-black text-sm">
                {formatCurrency(product.price)}
              </span>
            )}
          </div>
          
          <button 
            onClick={() => addToCart(product)}
            disabled={isInCart}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${
              isInCart 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' 
                : 'bg-primary text-white hover:bg-blue-700 shadow-lg shadow-blue-100 active:scale-95'
            }`}
          >
            {isInCart ? <Check className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
            {isInCart ? 'Ok' : 'Comprar'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
