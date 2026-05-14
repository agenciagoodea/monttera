import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ProductCard from '../components/ProductCard';
import { Category, Product } from '../types';

type SortMode = 'recent' | 'price_asc' | 'price_desc' | 'name';

import { useAppData } from '../contexts/AppDataContext';

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pageParam = Number(searchParams.get('page') || '1');

  const { categories } = useAppData();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
    currentPage: 1,
  });

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const url = new URL('/api/products', window.location.origin);
        url.searchParams.append('page', String(Math.max(1, pageParam || 1)));
        url.searchParams.append('limit', '12');

        if (selectedCategory) {
          const cat = categories.find((c) => c.id === selectedCategory);
          if (cat) url.searchParams.append('category', cat.slug);
        }

        if (searchQuery) {
          url.searchParams.append('q', searchQuery);
        }

        const res = await fetch(url.toString());
        const data = await res.json();
        if (data.products) {
          setProducts(data.products);
          setPagination(data.pagination);
        } else {
          setProducts([]);
        }
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [selectedCategory, categories, searchQuery, pageParam]);

  const sortedProducts = useMemo(() => {
    const cloned = [...products];
    if (sortMode === 'price_asc') {
      cloned.sort((a, b) => Number(a.sale_price ?? a.price) - Number(b.sale_price ?? b.price));
    } else if (sortMode === 'price_desc') {
      cloned.sort((a, b) => Number(b.sale_price ?? b.price) - Number(a.sale_price ?? a.price));
    } else if (sortMode === 'name') {
      cloned.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } else {
      cloned.sort((a, b) => b.id - a.id);
    }
    return cloned;
  }, [products, sortMode]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const subtitle = searchQuery
    ? `Resultados para "${searchQuery}"`
    : selectedCategory
      ? categories.find((c) => c.id === selectedCategory)?.name || 'Categoria'
      : 'Explore toda a colecao';

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <section className="mb-10 rounded-[2rem] border border-slate-100 bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-8 md:px-10 md:py-10 text-white shadow-xl shadow-blue-900/15">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-200">Loja oficial</p>
        <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-[-0.03em]">Matrizes Profissionais</h1>
        <p className="mt-3 max-w-2xl text-sm md:text-base text-blue-100/90 font-semibold">{subtitle}</p>
      </section>

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="w-full lg:w-72 shrink-0">
          <Sidebar
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(id) => {
              setSelectedCategory(id);
              const params = new URLSearchParams(searchParams);
              params.set('page', '1');
              setSearchParams(params);
            }}
          />
        </div>

        <div className="flex-1">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm inline-flex items-center gap-3">
              <Search className="w-4 h-4 text-blue-500" />
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                {pagination?.total || 0} itens encontrados
              </p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <SlidersHorizontal className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ordenar</span>
              <select
                className="text-xs font-black text-slate-700 bg-transparent outline-none"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="recent">Mais recentes</option>
                <option value="price_asc">Menor preco</option>
                <option value="price_desc">Maior preco</option>
                <option value="name">Nome A-Z</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-[2.5rem] border border-slate-100 bg-white" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {sortedProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </AnimatePresence>
              </div>

              {sortedProducts.length === 0 && (
                <div className="mt-8 text-center py-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
                  <Search className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhuma matriz encontrada.</p>
                </div>
              )}

              {pagination?.pages > 1 && (
                <div className="mt-14 flex flex-wrap justify-center items-center gap-3">
                  <button
                    onClick={() => handlePageChange(Math.max(1, pageParam - 1))}
                    disabled={pageParam <= 1}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary disabled:opacity-50 transition-all shadow-sm"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {Array.from({ length: pagination?.pages || 0 }).map((_, i) => {
                    const p = i + 1;
                    if (Math.abs(p - pageParam) > 2 && p !== 1 && p !== pagination.pages) {
                      if (Math.abs(p - pageParam) === 3) return <span key={p} className="text-slate-300 font-black">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={`w-12 h-12 rounded-2xl font-black text-xs transition-all shadow-sm ${
                          p === pageParam
                            ? 'bg-primary text-white shadow-lg shadow-blue-500/20'
                            : 'bg-white border border-slate-100 text-slate-400 hover:border-primary hover:text-primary'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handlePageChange(Math.min(pagination.pages, pageParam + 1))}
                    disabled={pageParam >= pagination.pages}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary disabled:opacity-50 transition-all shadow-sm"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

