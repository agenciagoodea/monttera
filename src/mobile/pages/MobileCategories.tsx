import React from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import { useNavigate } from 'react-router-dom';
import { Folder, ArrowRight } from 'lucide-react';

export default function MobileCategories() {
  const { categories, loadingCategories } = useAppData();
  const navigate = useNavigate();

  // Filtrar apenas as categorias pai (parent_id nulo ou indefinido)
  const parentCategories = React.useMemo(() => {
    return categories.filter(cat => !cat.parent_id && cat.status === 'active');
  }, [categories]);

  const handleCategoryClick = (slug: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    const isMobile = searchParams.get('mobile') === 'true';
    if (isMobile) {
      navigate(`/?category=${slug}&mobile=true`);
    } else {
      navigate(`/?category=${slug}`);
    }
  };

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

      {/* Grade de Categorias em Estilo "Pastas de Bordados" */}
      {loadingCategories ? (
        <div className="grid grid-cols-2 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm animate-pulse flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl" />
              <div className="h-3 bg-slate-100 rounded-lg w-2/3 mt-1" />
              <div className="h-2.5 bg-slate-50 rounded-lg w-1/3" />
            </div>
          ))}
        </div>
      ) : parentCategories.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5">
          {parentCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.slug)}
              className="bg-white border border-slate-100 hover:border-blue-100 rounded-[2rem] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] hover:shadow-md transition-all duration-300 flex flex-col items-center text-center gap-3 active:scale-[0.97]"
            >
              {/* Ícone de Pasta Grande e Elegante */}
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                <Folder className="w-7 h-7 fill-blue-500/20" />
              </div>
              
              <div className="flex flex-col gap-1 w-full mt-1">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight line-clamp-1">
                  {cat.name}
                </span>
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {cat.product_count || 0} {Number(cat.product_count) === 1 ? 'Matriz' : 'Matrizes'}
                </span>
              </div>

              {/* Indicador discreto de clique */}
              <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center mt-1 text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Estado Vazio de Alta Fidelidade */
        <div className="text-center py-16 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 flex flex-col items-center">
          <Folder className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-black uppercase tracking-wider text-[10px] mb-1">
            Nenhuma categoria disponível no momento.
          </p>
          <p className="text-slate-400 font-medium text-[9px]">
            Estamos preparando novidades incríveis para você em breve!
          </p>
        </div>
      )}
    </div>
  );
}
