import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Banner from '../components/Banner';
import ProductCard from '../components/ProductCard';
import { Category, Product } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Award, ChevronLeft, ChevronRight, Search, Shield, Sparkles } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

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

  const companyIcons = (() => {
    const iconMap: Record<string, any> = { shield: Shield, sparkles: Sparkles, award: Award };
    try {
      const parsed = JSON.parse(String(settings.home_company_icons || '[]'));
      if (!Array.isArray(parsed)) return [Shield, Sparkles, Award];
      const mapped = parsed.map((k: string) => iconMap[String(k || '').toLowerCase()]).filter(Boolean);
      return mapped.length ? mapped.slice(0, 6) : [Shield, Sparkles, Award];
    } catch {
      return [Shield, Sparkles, Award];
    }
  })();

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

      {String(settings.home_company_enabled || 'true') === 'true' && (
        <section
          className="mt-20 rounded-[2.5rem] overflow-hidden shadow-2xl"
          style={{ backgroundColor: settings.home_company_bg_color || '#0f172a', color: settings.home_company_text_color || '#f8fafc' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8 md:p-12">
            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-80">Institucional</p>
              <h3 className="mt-3 text-3xl md:text-4xl font-black leading-tight">{settings.home_company_title || 'Nossa Empresa'}</h3>
              <p className="mt-2 text-sm md:text-base font-semibold opacity-90">{settings.home_company_subtitle || ''}</p>
              <p className="mt-6 text-sm md:text-base leading-relaxed opacity-90">{settings.home_company_text || ''}</p>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-white/10 border border-white/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Missão</p>
                  <p className="mt-2 text-sm font-semibold">{settings.home_company_mission || ''}</p>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Visão</p>
                  <p className="mt-2 text-sm font-semibold">{settings.home_company_vision || ''}</p>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Valores</p>
                  <p className="mt-2 text-sm font-semibold">{settings.home_company_values || ''}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {companyIcons.map((Icon: any, idx: number) => (
                  <span key={idx} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 border border-white/25">
                    <Icon className="w-5 h-5" />
                  </span>
                ))}
              </div>

              <Link
                to={settings.home_company_cta_link || '/loja'}
                className="inline-flex mt-8 items-center gap-2 rounded-xl bg-white text-slate-900 px-6 py-3 text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] transition-transform"
              >
                {settings.home_company_cta_text || 'Conheça nossa coleção'}
              </Link>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: 0.08 }} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 rounded-[2rem] overflow-hidden border border-white/20 bg-black/10 min-h-[220px]">
                {settings.home_company_image_main ? (
                  <img src={settings.home_company_image_main} alt="Nossa Empresa" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold opacity-70">Imagem principal</div>
                )}
              </div>
              <div className="rounded-[1.5rem] overflow-hidden border border-white/20 bg-black/10 min-h-[140px]">
                {settings.home_company_image_secondary ? (
                  <img src={settings.home_company_image_secondary} alt="Nossa Empresa" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold opacity-70">Imagem secundária</div>
                )}
              </div>
              <div className="rounded-[1.5rem] border border-white/20 bg-white/10 p-5 flex flex-col justify-center">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Compromisso</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed">Experiência premium, arquivos protegidos e suporte próximo em cada etapa.</p>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Brand Logos Footer */}
      {(() => {
        let logos: string[] = [];
        try {
          logos = JSON.parse(settings.brand_logos || '[]');
        } catch (e) {
          logos = [];
        }

        if (logos.length === 0) return null;

        // Duplicate logos for infinite scroll effect
        const tickerLogos = [...logos, ...logos, ...logos];

        return (
          <section className="mt-24 py-16 border-t border-slate-100 overflow-hidden bg-slate-50/30">
            <div className="max-w-[1440px] mx-auto px-6 md:px-10">
              <div className="flex flex-col items-center mb-10">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Compatível com as principais máquinas</h3>
                <div className="h-1 w-10 bg-primary rounded-full"></div>
              </div>
              
              <div className="relative">
                {/* Gradient Masks */}
                <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/80 to-transparent z-10 pointer-events-none"></div>
                <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-white/80 to-transparent z-10 pointer-events-none"></div>
                
                <div className="flex overflow-hidden">
                  <motion.div 
                    className="flex gap-16 items-center"
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
                      <div key={idx} className="w-32 h-16 flex-shrink-0 flex items-center justify-center grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
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
