import { Category } from '../types';
import { Plus, Minus } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SidebarProps {
  categories: Category[];
  selectedCategory: number | null;
  onSelectCategory: (id: number | null) => void;
}

export default function Sidebar({ categories, selectedCategory, onSelectCategory }: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  
  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: number) => categories.filter((c) => c.parent_id === parentId);

  // Auto-expand parent if a child is selected or if the parent itself is selected
  useEffect(() => {
    if (selectedCategory) {
      const selectedCat = categories.find(c => c.id === selectedCategory);
      if (selectedCat?.parent_id) {
        setExpanded(prev => ({ ...prev, [selectedCat.parent_id!]: true }));
      } else {
        setExpanded(prev => ({ ...prev, [selectedCategory]: true }));
      }
    }
  }, [selectedCategory, categories]);

  const toggleExpand = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
            const hasChildren = subcategories.length > 0;
            const isParentSelected = selectedCategory === category.id;
            const isExpanded = expanded[category.id];

            return (
              <li key={category.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectCategory(category.id)}
                    className={`flex-1 text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                      isParentSelected
                        ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                        : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span className={hasChildren ? 'text-blue-900' : ''}>{category.name}</span>
                    {isParentSelected && !hasChildren && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                  </button>
                  
                  {hasChildren && (
                    <button
                      onClick={(e) => toggleExpand(e, category.id)}
                      className={`p-2 rounded-lg transition-all ${
                        isExpanded ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                    >
                      {isExpanded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {hasChildren && isExpanded && (
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
