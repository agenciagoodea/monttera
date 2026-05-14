import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Banner from '../components/Banner';
import ProductCard from '../components/ProductCard';
import { Category, Product } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pageParam = parseInt(searchParams.get('page') || '1');
  
  const { categories } = useAppData();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
    currentPage: 1
  });

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const url = new URL('/api/products', window.location.origin);
        url.searchParams.append('page', pageParam.toString());
        url.searchParams.append('limit', '12');

        if (selectedCategory) {
          const cat = categories.find(c => c.id === selectedCategory);
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

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sidebar */}
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

        {/* Content */}
        <div className="flex-1">
          <Banner />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 mt-10">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              {searchQuery ? (
                <>Resultado da busca: <span className="text-primary">"{searchQuery}"</span></>
              ) : selectedCategory ? (
                categories.find(c => c.id === selectedCategory)?.name 
              ) : 'Nossas Matrizes'}
            </h2>
            
            <div className="bg-white border border-slate-100 rounded-full py-3 px-8 flex items-center justify-between gap-6 shadow-sm">
               <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest whitespace-nowrap">
                {pagination?.total || 0} Matrizes Encontradas
               </p>
               <button className="text-primary hover:underline text-[10px] font-black uppercase tracking-widest">
                Ordenar por: Recentes
               </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-[4/5] bg-white border border-slate-50 rounded-[2.5rem]" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </AnimatePresence>
              </div>

              {/* No results */}
              {products.length === 0 && (
                <div className="text-center py-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
                  <Search className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhuma matriz encontrada.</p>
                  <button 
                    onClick={() => setSelectedCategory(null)}
                    className="mt-6 bg-primary text-white px-10 py-4 rounded-full font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20"
                  >
                    Ver todas as matrizes
                  </button>
                </div>
              )}

              {/* Pagination */}
              {pagination?.pages > 1 && (
                <div className="mt-16 flex flex-wrap justify-center items-center gap-3">
                  <button 
                    onClick={() => handlePageChange(Math.max(1, pageParam - 1))}
                    disabled={pageParam === 1}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary disabled:opacity-50 transition-all shadow-sm"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  {Array.from({ length: pagination?.pages || 0 }).map((_, i) => {
                    const p = i + 1;
                    // Only show 5 pages around current
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
                    disabled={pageParam === pagination.pages}
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

      {/* Brand Logos Footer */}
      <section className="mt-24 py-12 border-t border-slate-100">
        <div className="flex flex-wrap justify-center md:justify-between items-center gap-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
           {['Singer', 'Janome', 'Brother', 'Elna', 'Ricoma', 'Bernina', 'HappyJapan', 'Tajima', 'Barudan', 'ZSK'].map(brand => (
             <div key={brand} className="text-xl font-black text-slate-400 hover:text-slate-900 cursor-default uppercase tracking-tighter">
               {brand}
             </div>
           ))}
        </div>
      </section>
    </main>
  );
}
