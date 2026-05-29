import React, { useEffect, useState } from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import { Product } from '../../types';
import MobileProductCard from '../components/MobileProductCard';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Sparkles, Filter, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

export default function MobileHome() {
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
        url.searchParams.append('limit', '12'); // Limite menor no mobile para maior velocidade de carregamento

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
        console.error('Failed to fetch products for MobileHome:', error);
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
            Qualidade Extra <br/>para seus Bordados
          </h2>
          <p className="text-[10px] text-blue-100 font-bold max-w-[80%] leading-relaxed">
            Desenhos profissionais testados e aprovados. Download instantâneo logo após o pagamento!
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
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className={`flex-shrink-0 snap-start px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider border transition-all ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'bg-white border-slate-100 text-slate-600 active:bg-slate-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
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
    </div>
  );
}
