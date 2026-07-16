import { useEffect, useState, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import Banner from '../components/Banner';
import SideBanner from '../components/SideBanner';
import ProductCard from '../components/ProductCard';
import { Category, Product } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Search, Smartphone, Laptop, 
  Sparkles, Tent, Shirt, Joystick, Tv, Watch, Compass, Flame, ShoppingBag
} from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

const getCategoryIcon = (name: string) => {
  const n = String(name || '').toLowerCase();
  if (n.includes('celular') || n.includes('fone') || n.includes('phone') || n.includes('móvel')) return Smartphone;
  if (n.includes('informática') || n.includes('computador') || n.includes('notebook') || n.includes('laptop')) return Laptop;
  if (n.includes('perfume') || n.includes('cosmético') || n.includes('beleza')) return Sparkles;
  if (n.includes('lazer') || n.includes('pesca') || n.includes('camping') || n.includes('esporte')) return Tent;
  if (n.includes('moda') || n.includes('vestuário') || n.includes('roupa') || n.includes('calçado')) return Shirt;
  if (n.includes('game') || n.includes('jogo') || n.includes('console') || n.includes('videogame')) return Joystick;
  if (n.includes('eletrônico') || n.includes('tv') || n.includes('som')) return Tv;
  if (n.includes('acessório')) return Watch;
  return Compass; // Default
};

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pageParam = parseInt(searchParams.get('page') || '1');
  
  const { categories, settings } = useAppData();
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
        url.searchParams.append('limit', '20');

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

  const handleCategorySelect = (id: number | null) => {
    setSelectedCategory(id);
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    setSearchParams(params);
  };

  // Separa produtos em alta (trending) a partir dos itens em destaque ou promoção
  const trendingProducts = useMemo(() => {
    return products.filter(p => Number(p.is_featured) === 1 || (p.sale_price && p.sale_price < p.price)).slice(0, 4);
  }, [products]);

  const parentCategories = useMemo(() => {
    return categories.filter(c => !c.parent_id).slice(0, 7);
  }, [categories]);

  const hasSideBanners = useMemo(() => {
    try {
      if (settings?.side_sliders) {
        const parsed = JSON.parse(settings.side_sliders);
        if (Array.isArray(parsed)) {
          return parsed.some((slide: any) => slide.active !== false);
        }
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, [settings]);

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-10 py-6 md:py-10">
      <h1 className="sr-only">{settings?.site_name || 'Monttera'} - Loja Online com os Melhores Produtos</h1>
      
      {/* Bloco Hero: Departamentos + Slider (Estilo Compras Paraguai) */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        {/* Departamentos lateral (Apenas Desktop) */}
        <div className="hidden lg:block lg:col-span-1 bg-white border border-slate-100 rounded-[2.25rem] p-6 shadow-sm max-h-[420px] overflow-y-auto">
          <h3 className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 mb-4 px-2">Departamentos</h3>
          <ul className="space-y-1.5">
            <li>
              <button
                onClick={() => handleCategorySelect(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-between ${selectedCategory === null ? 'bg-blue-50 text-blue-700 font-black' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <span>Todos os Produtos</span>
                <ChevronRight className="w-3 h-3 opacity-40" />
              </button>
            </li>
            {parentCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  onClick={() => handleCategorySelect(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-between ${selectedCategory === cat.id ? 'bg-blue-50 text-blue-700 font-black' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="truncate">{cat.name}</span>
                  <ChevronRight className="w-3 h-3 opacity-40" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Banner rotativo principal */}
        <div className="lg:col-span-3">
          <Banner />
        </div>
      </section>

      {/* Grade de Atalhos Rápidos com Ícones (Estilo Compras Paraguai) */}
      {categories.length > 0 && (
        <section className="mb-12">
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-7 gap-4">
            {categories.filter(c => !c.parent_id).slice(0, 7).map((cat) => {
              const IconComponent = getCategoryIcon(cat.name);
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  className={`flex flex-col items-center justify-center p-5 rounded-[2rem] border transition-all hover:scale-105 active:scale-95 text-center ${
                    isActive 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20' 
                      : 'bg-white border-slate-100 hover:border-blue-200 text-slate-700 shadow-sm'
                  }`}
                >
                  <div className={`p-3 rounded-2xl mb-2.5 ${isActive ? 'bg-white/20 text-white' : 'bg-blue-50/70 text-blue-600'}`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Seção Mais Procurados (Se houver produtos em destaque no grid) */}
      {!searchQuery && trendingProducts.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
              Mais Procurados
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Em Destaque</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trendingProducts.map((product) => (
              <ProductCard key={`trending-${product.id}`} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Seção Grid de Produtos Principal */}
      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sidebar clássica para filtros adicionais (Filtro por categorias) */}
        <div className="w-full lg:w-72 shrink-0">
          <Sidebar 
            categories={categories} 
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategorySelect}
          />
        </div>

        {/* Listagem de Produtos */}
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {searchQuery ? (
                <>Busca: <span className="text-blue-600">"{searchQuery}"</span></>
              ) : selectedCategory ? (
                categories.find(c => c.id === selectedCategory)?.name 
              ) : 'Todos os Produtos'}
            </h2>
            
            <div className="bg-white border border-slate-100 rounded-full py-2.5 px-6 flex items-center justify-between gap-6 shadow-sm self-start">
               <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest whitespace-nowrap">
                {pagination?.total || 0} Itens
               </p>
               <button className="text-blue-600 hover:underline text-[9px] font-black uppercase tracking-widest">
                Ordenar: Recentes
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

              {/* Nenhum produto */}
              {products.length === 0 && (
                <div className="text-center py-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
                  <Search className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhum produto encontrado.</p>
                  <button 
                    onClick={() => handleCategorySelect(null)}
                    className="mt-6 bg-blue-600 text-white px-10 py-4 rounded-full font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20"
                  >
                    Ver todos os produtos
                  </button>
                </div>
              )}

              {/* Paginação */}
              {pagination?.pages > 1 && (
                <div className="mt-16 flex flex-wrap justify-center items-center gap-3">
                  <button 
                    onClick={() => handlePageChange(Math.max(1, pageParam - 1))}
                    disabled={pageParam === 1}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-600 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
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
                        className={`w-12 h-12 rounded-2xl font-black text-xs transition-all shadow-sm cursor-pointer ${
                          p === pageParam 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                            : 'bg-white border border-slate-100 text-slate-400 hover:border-blue-600 hover:text-blue-600'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button 
                    onClick={() => handlePageChange(Math.min(pagination.pages, pageParam + 1))}
                    disabled={pageParam === pagination.pages}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-600 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Grid de Marcas Parceiras */}
      {(() => {
        let logos: string[] = [];
        try {
          logos = JSON.parse(settings.brand_logos || '[]');
        } catch (e) {
          logos = [];
        }

        if (logos.length === 0) return null;
        const tickerLogos = [...logos, ...logos, ...logos];

        return (
          <section className="mt-24 py-16 border-t border-slate-100 overflow-hidden bg-slate-50/30">
            <div className="max-w-[1440px] mx-auto px-6 md:px-10">
              <div className="flex flex-col items-center mb-10">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 font-black">Parceiros e marcas</h3>
                <div className="h-1 w-10 bg-blue-600 rounded-full"></div>
              </div>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/80 to-transparent z-10 pointer-events-none"></div>
                <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-white/80 to-transparent z-10 pointer-events-none"></div>
                
                <div className="overflow-hidden w-full">
                  <motion.div 
                    className="flex gap-16 items-center w-max"
                    animate={{ x: ["0%", "-33.33%"] }}
                    transition={{ 
                      x: {
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear"
                      }
                    }}
                  >
                    {tickerLogos.map((url, idx) => (
                      <div key={idx} className="w-32 h-16 flex-shrink-0 flex items-center justify-center transition-all duration-250 ease-in-out hover:scale-[1.06] cursor-pointer">
                        <img 
                          src={url} 
                          alt="Brand Logo" 
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ))}
                  </motion.div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}
    </main>
  );
}

