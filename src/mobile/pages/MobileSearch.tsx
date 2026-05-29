import React, { useEffect, useState } from 'react';
import { Search, Loader2, Sparkles, X, ArrowRight, AlertCircle, ShoppingBag } from 'lucide-react';
import { Product } from '../../types';
import MobileProductCard from '../components/MobileProductCard';
import { formatCurrency } from '../../lib/utils';
import { Link } from 'react-router-dom';

export default function MobileSearch() {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Tags populares sugeridas
  const popularTags = [
    { label: 'Enfermagem', query: 'enfermagem' },
    { label: 'Fisioterapia', query: 'fisioterapia' },
    { label: 'Universidade', query: 'universidade' },
    { label: 'Carros', query: 'carros' },
    { label: 'Desenhos', query: 'desenhos' },
    { label: 'Militar', query: 'militar' }
  ];

  // Carregar produtos de sugestão na inicialização
  useEffect(() => {
    async function fetchSuggestions() {
      setLoadingSuggestions(true);
      try {
        const res = await fetch('/api/products?limit=4');
        const data = await res.json();
        setRecentProducts(data.products || []);
      } catch (error) {
        console.error('Failed to fetch search suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    }
    fetchSuggestions();
  }, []);

  // Busca ativa com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.trim().length >= 2) {
        setIsSearching(true);
        try {
          const response = await fetch(`/api/products/search?q=${encodeURIComponent(search.trim())}`);
          const data = await response.json();
          setSearchResults(Array.isArray(data) ? data : (data.products || []));
        } catch (error) {
          console.error('Search failed:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleTagClick = (query: string) => {
    setSearch(query);
  };

  const handleClear = () => {
    setSearch('');
    setSearchResults([]);
  };

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Cabeçalho de Busca */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-600" />
          Busca de Matrizes
        </h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          Encontre os melhores designs de bordado instantaneamente
        </p>
      </div>

      {/* Caixa de Entrada de Pesquisa Premium */}
      <div className="relative">
        <input
          type="text"
          placeholder="Pesquisar matrizes (ex: flores, infantil, times)..."
          className="w-full pl-5 pr-12 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all shadow-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="absolute right-3.5 top-3 flex items-center gap-1.5">
          {search && (
            <button 
              onClick={handleClear}
              className="p-1.5 bg-slate-100 text-slate-400 rounded-lg active:scale-90 transition-transform"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md">
            {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>

      {/* Interface condicional baseada na query de pesquisa */}
      {search.trim().length < 2 ? (
        <div className="flex flex-col gap-6">
          {/* Seção de Tags Populares */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Buscas Populares
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {popularTags.map((tag) => (
                <button
                  key={tag.label}
                  onClick={() => handleTagClick(tag.query)}
                  className="px-4 py-2.5 bg-white border border-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 active:bg-slate-50 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sugestões de Matrizes Recomendadas */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Novidades Recomendadas
            </h3>
            {loadingSuggestions ? (
              <div className="grid grid-cols-2 gap-3.5">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-white border border-slate-100 rounded-[2rem] animate-pulse" />
                ))}
              </div>
            ) : recentProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5">
                {recentProducts.map((product) => (
                  <MobileProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        /* Seção de Resultados da Busca */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">
              Resultados para "{search}"
            </h3>
            <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
              {searchResults.length} Resultados
            </span>
          </div>

          {isSearching ? (
            <div className="grid grid-cols-2 gap-3.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-white border border-slate-100 rounded-[2rem] animate-pulse" />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5">
              {searchResults.map((product) => (
                <MobileProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            /* Sem resultados de busca */
            <div className="text-center py-16 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 flex flex-col items-center">
              <AlertCircle className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-500 font-black uppercase tracking-wider text-[10px] mb-1">
                Nenhuma matriz encontrada para "{search}".
              </p>
              <p className="text-slate-400 font-medium text-[9px] mb-4">
                Tente buscar por palavras mais curtas ou categorias relacionadas.
              </p>
              <button
                onClick={handleClear}
                className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-[9px] uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-md shadow-blue-100"
              >
                Limpar Busca
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
