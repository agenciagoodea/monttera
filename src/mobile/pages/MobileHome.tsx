import React, { useEffect, useState } from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import { Product } from '../../types';
import MobileProductCard from '../components/MobileProductCard';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Sparkles, Filter, AlertCircle, Plus, X } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

export default function MobileHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pageParam = parseInt(searchParams.get('page') || '1');
  const categoryParam = searchParams.get('category') || '';

  const { categories, settings } = useAppData();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
    currentPage: 1
  });
  const [activeParentForSubcategories, setActiveParentForSubcategories] = useState<any>(null);
  const [currentBrandIndex, setCurrentBrandIndex] = useState(0);

  const brandLogos = React.useMemo(() => {
    try {
      return JSON.parse((settings && settings.brand_logos) || '[]');
    } catch {
      return [];
    }
  }, [settings]);

  useEffect(() => {
    if (brandLogos.length <= 2) return;
    const interval = setInterval(() => {
      setCurrentBrandIndex((prev) => {
        const next = prev + 2;
        return next >= brandLogos.length ? 0 : next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [brandLogos]);

  // Filtrar apenas categorias pai ativas
  const parentCategories = React.useMemo(() => {
    return categories.filter(cat => !cat.parent_id && cat.status === 'active');
  }, [categories]);

  // Sincroniza selectedCategory (UI) com o param da URL quando categories carregam
  useEffect(() => {
    if (categoryParam && categories.length > 0) {
      const cat = categories.find(c => c.slug === categoryParam);
      if (cat) {
        setSelectedCategory(cat.id);
      } else {
        setSelectedCategory(null);
      }
    } else if (!categoryParam) {
      setSelectedCategory(null);
    }
  }, [categoryParam, categories]);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const url = new URL('/api/products', window.location.origin);
        // Sempre reseta para página 1 quando muda de categoria
        url.searchParams.append('page', pageParam.toString());
        url.searchParams.append('limit', '12');

        // Usa o slug diretamente da URL (não depende de categories carregado)
        if (categoryParam) {
          url.searchParams.append('category', categoryParam);
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
        console.error('Failed to fetch products for MobileHome:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [categoryParam, searchQuery, pageParam]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategorySelect = (id: number | null) => {
    setSelectedCategory(id);
    const params = new URLSearchParams(searchParams);
    if (id === null) {
      params.delete('category');
    } else {
      const cat = categories.find(c => c.id === id);
      if (cat) params.set('category', cat.slug);
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Banner Principal Leve e Premium */}
      <section className="relative w-full rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white p-6 shadow-xl shadow-blue-500/10">
        {/* Elemento de brilho decorativo de fundo */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 bg-white/15 border border-white/15 px-3 py-1 rounded-full w-max text-[8px] font-black uppercase tracking-widest">
            <Sparkles className="w-3 h-3 text-amber-300 fill-amber-300" /> Matrizes Digitais
          </div>
          <h2 className="text-xl font-black leading-tight uppercase tracking-tight mt-1">
            Variadas Matrizes <br/>para sua máquina de bordar
          </h2>
          <p className="text-[10px] text-blue-100 font-bold max-w-[80%] leading-relaxed">
            Muitas opções para você escolher e baixar. Download imediato após a compra.
          </p>
        </div>
      </section>

      {/* Carrossel Horizontal de Categorias (Scroll de Toque) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
            Categorias em Destaque
          </h3>
          {selectedCategory !== null && (
            <button 
              onClick={() => handleCategorySelect(null)}
              className="text-[9px] font-black text-blue-600 uppercase tracking-widest active:scale-95"
            >
              Limpar Filtro
            </button>
          )}
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
          {/* Bolha "Todas" */}
          <button
            onClick={() => handleCategorySelect(null)}
            className={`flex-shrink-0 snap-start px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider border transition-all ${
              selectedCategory === null
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'bg-white border-slate-100 text-slate-600 active:bg-slate-50'
            }`}
          >
            Todas
          </button>

          {/* Categorias Dinâmicas */}
          {parentCategories.map((cat) => {
            const subcats = categories.filter(c => c.parent_id === cat.id && c.status === 'active');
            const hasSubs = subcats.length > 0;
            const isSelected = selectedCategory === cat.id;
            const isSubSelected = categories.some(c => c.id === selectedCategory && c.parent_id === cat.id);
            const activeColorClass = isSelected || isSubSelected
              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border-slate-100 text-slate-600 active:bg-slate-50';

            if (hasSubs) {
              return (
                <div key={cat.id} className="flex-shrink-0 snap-start flex items-stretch">
                  {/* Botão Principal da Categoria Pai */}
                  <button
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`px-5 py-2.5 rounded-l-2xl font-black text-[10px] uppercase tracking-wider border transition-all ${
                      isSelected || isSubSelected
                        ? 'bg-blue-600 border-blue-600 text-white border-r-0'
                        : 'bg-white border-slate-100 text-slate-600 active:bg-slate-50 border-r-0'
                    }`}
                  >
                    {cat.name}
                  </button>
                  {/* Botão de Mais para Subcategorias */}
                  <button
                    onClick={() => setActiveParentForSubcategories(cat)}
                    className={`px-3.5 rounded-r-2xl border transition-all flex items-center justify-center ${
                      isSelected || isSubSelected
                        ? 'bg-blue-700 border-blue-700 text-blue-100 border-l-blue-500/30'
                        : 'bg-slate-50 border-slate-100 text-slate-500 active:bg-slate-100 border-l-slate-100/50'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              );
            }

            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`flex-shrink-0 snap-start px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider border transition-all ${activeColorClass}`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Seção da Vitrine de Produtos */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-500" />
            {searchQuery ? (
              <>Resultado da busca</>
            ) : selectedCategory ? (
              categories.find(c => c.id === selectedCategory)?.name
            ) : (
              'Nossas Coleções'
            )}
          </h3>

          <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full uppercase tracking-wider">
            {pagination.total || 0} Itens
          </span>
        </div>

        {/* Grade de Produtos - 2 Colunas */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-white border border-slate-100 rounded-[2rem] animate-pulse" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3.5">
              {products.map((product) => (
                <MobileProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Paginação Mobile Elegante */}
            {pagination.pages > 1 && (
              <div className="mt-8 flex justify-center items-center gap-2">
                <button
                  onClick={() => handlePageChange(Math.max(1, pageParam - 1))}
                  disabled={pageParam === 1}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-transform shadow-sm"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest px-2">
                    Página {pageParam} de {pagination.pages}
                  </span>
                </div>

                <button
                  onClick={() => handlePageChange(Math.min(pagination.pages, pageParam + 1))}
                  disabled={pageParam === pagination.pages}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-transform shadow-sm"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          /* Sem resultados */
          <div className="text-center py-16 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6">
            <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-black uppercase tracking-wider text-[10px]">
              Nenhuma matriz encontrada nesta seleção.
            </p>
            <button
              onClick={() => handleCategorySelect(null)}
              className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-200"
            >
              Ver todas as matrizes
            </button>
          </div>
        )}
      </section>

      {/* Seção Marcas Parceiras (Compatível com as principais máquinas) */}
      {brandLogos.length > 0 && (
        <section className="mt-4 mb-6 py-8 border-t border-slate-100/80 flex flex-col items-center gap-4 bg-white/50 backdrop-blur-md rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
          <div className="flex flex-col items-center gap-1.5 mb-2">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] text-center">
              Compatível com as principais máquinas
            </span>
            <div className="h-0.5 w-8 bg-blue-600 rounded-full" />
          </div>

          <div className="relative w-full overflow-hidden">
            <div 
              className="flex gap-4 transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${(currentBrandIndex / 2) * 100}%)` }}
            >
              {brandLogos.map((url, idx) => (
                <div 
                  key={idx} 
                  className="w-[calc(50%-8px)] h-16 bg-white border border-slate-50 rounded-2xl flex-shrink-0 flex items-center justify-center p-3 shadow-[0_4px_16px_rgba(0,0,0,0.01)]"
                >
                  <img 
                    src={url} 
                    alt="Logo Máquina de Bordar" 
                    className="max-w-full max-h-full object-contain filter grayscale opacity-75 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Dots de Paginação */}
          {brandLogos.length > 2 && (
            <div className="flex justify-center gap-1.5 mt-2">
              {Array.from({ length: Math.ceil(brandLogos.length / 2) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentBrandIndex(i * 2)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    Math.floor(currentBrandIndex / 2) === i 
                      ? 'bg-blue-600 w-3' 
                      : 'bg-slate-200'
                  }`}
                  aria-label={`Ir para marcas página ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Drawer de Subcategorias */}
      {activeParentForSubcategories && (
        <>
          {/* Overlay Escuro com Blur */}
          <div 
            onClick={() => setActiveParentForSubcategories(null)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200"
          />
          {/* Painel da Gaveta (Drawer) */}
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] p-6 pb-10 z-50 shadow-2xl flex flex-col gap-4 max-h-[75vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            {/* Indicador de gesto de deslizar */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-1 flex-shrink-0" />
            
            <div className="flex items-start justify-between gap-4 mt-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">Subcategorias de</span>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {activeParentForSubcategories.name}
                </h4>
              </div>
              <button
                onClick={() => setActiveParentForSubcategories(null)}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 mt-2">
              {/* Opção para Ver Toda a Categoria Pai */}
              <button
                onClick={() => {
                  handleCategorySelect(activeParentForSubcategories.id);
                  setActiveParentForSubcategories(null);
                }}
                className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                  selectedCategory === activeParentForSubcategories.id
                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                    : 'bg-white border-slate-100 text-slate-700'
                }`}
              >
                <span className="text-xs font-black uppercase tracking-tight">
                  Ver Todas de {activeParentForSubcategories.name}
                </span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                  {activeParentForSubcategories.product_count || 0} Itens
                </span>
              </button>

              {/* Subcategorias Dinâmicas */}
              {categories
                .filter(c => c.parent_id === activeParentForSubcategories.id && c.status === 'active')
                .map((subcat) => {
                  const isSubSelected = selectedCategory === subcat.id;
                  return (
                    <button
                      key={subcat.id}
                      onClick={() => {
                        handleCategorySelect(subcat.id);
                        setActiveParentForSubcategories(null);
                      }}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                        isSubSelected
                          ? 'bg-blue-50 border-blue-100 text-blue-700'
                          : 'bg-white border-slate-100 text-slate-700 active:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-tight">
                        {subcat.name}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                        {subcat.product_count || 0} Itens
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
