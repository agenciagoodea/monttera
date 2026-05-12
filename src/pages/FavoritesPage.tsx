import { useEffect, useMemo, useState } from 'react';
import { Heart, PackageOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../contexts/FavoritesContext';
import { Product } from '../types';
import ProductCard from '../components/ProductCard';

interface FavoriteApiItem {
  product_id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  sale_price?: number | null;
  is_new?: number | boolean;
}

function mapFavoriteToProduct(item: FavoriteApiItem): Product {
  return {
    id: Number(item.product_id),
    name: item.name,
    slug: item.slug,
    price: Number(item.price || 0),
    sale_price: item.sale_price ?? null,
    image: item.image,
    category_id: 0,
    is_new: item.is_new ?? 0,
    is_featured: 0,
    status: 'active',
  };
}

export default function FavoritesPage() {
  const { favorites, loading } = useFavorites();
  const [products, setProducts] = useState<Product[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function fetchFavorites() {
      setPageLoading(true);
      try {
        const res = await fetch('/api/favorites');
        if (!res.ok) {
          setProducts([]);
          return;
        }

        const data = await res.json();
        const list = Array.isArray(data?.favorites) ? data.favorites : [];
        const mapped = list.map(mapFavoriteToProduct);
        setProducts(mapped);
      } catch (error) {
        console.error('Failed to fetch favorites page:', error);
        setProducts([]);
      } finally {
        setPageLoading(false);
      }
    }

    fetchFavorites();
  }, [favorites]);

  const isBusy = loading || pageLoading;
  const hasProducts = products.length > 0;

  const titleCount = useMemo(() => {
    if (hasProducts) return products.length;
    return favorites.length;
  }, [hasProducts, products.length, favorites.length]);

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-10 py-8 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">Meus Favoritos</h1>
          <p className="text-sm text-slate-500 font-bold mt-1">
            {titleCount} {titleCount === 1 ? 'item salvo' : 'itens salvos'} com coração.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          Voltar para vitrine
        </Link>
      </div>

      {isBusy ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-[4/5] bg-white border border-slate-50 rounded-[2.5rem]" />
          ))}
        </div>
      ) : hasProducts ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 mx-auto flex items-center justify-center mb-4">
            <PackageOpen className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-800 mb-2">Você ainda não tem favoritos</h2>
          <p className="text-sm text-slate-500 font-medium mb-6">
            Clique no coração dos produtos para montar sua seleção favorita.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors"
          >
            <Heart className="w-4 h-4" />
            Explorar produtos
          </Link>
        </div>
      )}
    </main>
  );
}

