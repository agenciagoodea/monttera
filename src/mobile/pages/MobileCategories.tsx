import React, { useEffect, useState } from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import { Product } from '../../types';
import MobileProductCard from '../components/MobileProductCard';
import { Filter, Grid, Folder, Search, Loader2, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

export default function MobileCategories() {
  const { categories } = useAppData();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    // Selecionar a primeira categoria por padrão se houver categorias e nenhuma estiver selecionada
    if (categories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (selectedCategoryId === null) return;
    
    async function fetchCategoryProducts() {
      setLoadingProducts(true);
      try {
        const cat = categories.find(c => c.id === selectedCategoryId);
        if (!cat) return;
        
        const url = new URL('/api/products', window.location.origin);
        url.searchParams.append('category', cat.slug);
        url.searchParams.append('limit', '24');
        
        const res = await fetch(url.toString());
        const data = await res.json();
        
        setProducts(data.products || []);
      } catch (error) {
        console.error('Failed to fetch category products:', error);
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    }
    
    fetchCategoryProducts();
  }, [selectedCategoryId, categories]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Cabeçalho de Categoria Premium */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <Folder className="w-5 h-5 text-blue-600" />
          Categorias
        </h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          Navegue pelas nossas coleções exclusivas de matrizes
        </p>
      </div>

      {/* Menu Superior de Categorias no Mobile - Modelo Estilo Apps Modernos */}
      <div className="flex gap-2.5 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`flex-shrink-0 snap-start px-5 py-3 rounded-2xl border font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 ${
                isSelected
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02]'
                  : 'bg-white border-slate-100 text-slate-500 active:bg-slate-50'
              }`}
            >
              <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-300'}`} />
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Título da Coleção Selecionada */}
      {selectedCategory && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex flex-col">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-indigo-500" />
              Coleção: {selectedCategory.name}
            </h3>
          </div>
          <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
            {products.length} Matrizes
          </span>
        </div>
      )}

      {/* Grade de Produtos Otimizada */}
      {loadingProducts ? (
        <div className="grid grid-cols-2 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-white border border-slate-100 rounded-[2rem] animate-pulse p-4 flex flex-col justify-between">
              <div className="w-full aspect-square bg-slate-50 rounded-2xl" />
              <div className="space-y-2 mt-2">
                <div className="h-3.5 bg-slate-100 rounded-lg w-5/6" />
                <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5">
          {products.map((product) => (
            <MobileProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        /* Estado Vazio de Alta Fidelidade */
        <div className="text-center py-16 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 flex flex-col items-center">
          <Folder className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-black uppercase tracking-wider text-[10px] mb-1">
            Nenhuma matriz disponível nesta categoria ainda.
          </p>
          <p className="text-slate-400 font-medium text-[9px]">
            Estamos preparando novidades incríveis para você nesta coleção!
          </p>
        </div>
      )}
    </div>
  );
}
