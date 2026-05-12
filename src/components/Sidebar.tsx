import { Link } from 'react-router-dom';
import { Category } from '../types';

interface SidebarProps {
  categories: Category[];
  selectedCategory: number | null;
  onSelectCategory: (id: number | null) => void;
}

export default function Sidebar({ categories, selectedCategory, onSelectCategory }: SidebarProps) {
  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: number) => categories.filter((c) => c.parent_id === parentId);

  return (
    <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-6">
      <div className="bg-white border border-blue-50 rounded-2xl p-5 shadow-sm">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">
          Categorias
        </h3>
        <ul className="space-y-2 flex flex-col custom-scrollbar">
          <li>
            <button
              onClick={() => onSelectCategory(null)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                selectedCategory === null
                  ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <span>Todas as Matrizes</span>
              {selectedCategory === null && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
            </button>
          </li>

          {parentCategories.map((category) => {
            const subcategories = getSubcategories(category.id);
            const isParentSelected = selectedCategory === category.id;
            const isAnySubSelected = subcategories.some((s) => s.id === selectedCategory);

            return (
              <li key={category.id} className="space-y-1">
                <button
                  onClick={() => onSelectCategory(category.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                    isParentSelected
                      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                      : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span className={subcategories.length > 0 ? 'text-blue-900' : ''}>{category.name}</span>
                  {isParentSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                </button>

                {subcategories.length > 0 && (isParentSelected || isAnySubSelected) && (
                  <ul className="ml-4 space-y-1 mt-1 border-l border-slate-100 pl-3">
                    {subcategories.map((sub) => (
                      <li key={sub.id}>
                        <button
                          onClick={() => onSelectCategory(sub.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                            selectedCategory === sub.id
                              ? 'text-blue-600 bg-blue-50/50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <span>{sub.name}</span>
                          {selectedCategory === sub.id && <span className="w-1 h-1 rounded-full bg-blue-400" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

    </aside>
  );
}
