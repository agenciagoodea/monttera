import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  FolderTree,
  X,
  Save,
} from 'lucide-react';
import LucideIcon from '../../components/LucideIcon';

interface Category {
  id: number;
  name: string;
  name_en?: string | null;
  name_es?: string | null;
  slug: string;
  slug_en?: string | null;
  slug_es?: string | null;
  parent_id: number | null;
  parent_name: string | null;
  description?: string | null;
  description_en?: string | null;
  description_es?: string | null;
  icon?: string | null;
  product_count?: number;
  status: string;
  sort_order: number;
}

export default function AdminCategoryList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'none' | 'delete'>('none');
  const [processingBulk, setProcessingBulk] = useState(false);

  // i18n
  const [activeLangTab, setActiveLangTab] = useState<'pt' | 'en' | 'es'>('pt');
  const [translatingField, setTranslatingField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    name_en: '',
    name_es: '',
    slug: '',
    slug_en: '',
    slug_es: '',
    parent_id: '',
    sort_order: '0',
    status: 'active',
    description: '',
    description_en: '',
    description_es: '',
    icon: '',
  });

  const handleAutoTranslate = async (field: 'name' | 'description') => {
    const sourceText = formData[field];
    if (!sourceText || sourceText.trim().length === 0) {
      alert('Escreva primeiro o conteúdo em português para poder traduzir.');
      return;
    }

    setTranslatingField(field);
    try {
      const res = await fetch('/api/admin/translate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          target: activeLangTab
        })
      });

      if (res.ok) {
        const { translatedText } = await res.json();
        setFormData(prev => ({
          ...prev,
          [`${field}_${activeLangTab}`]: translatedText
        }));
        
        if (field === 'name') {
          const targetSlug = translatedText
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
          setFormData(prev => ({
            ...prev,
            [`slug_${activeLangTab}`]: targetSlug
          }));
        }
        alert('Tradução gerada com sucesso via Gemini!');
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao traduzir.');
      }
    } catch (e) {
      alert('Erro de conexão ao tentar traduzir.');
    } finally {
      setTranslatingField(null);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/admin/categories');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCategories(data);
      } else {
        console.error('Data is not an array:', data);
        setCategories([]);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
      setSelectedIds([]);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria? Os produtos vinculados ficarão sem categoria.')) return;

    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories();
      }
    } catch (error) {
      alert('Erro ao excluir categoria');
    }
  };

  const handleBulkApply = async () => {
    if (bulkAction === 'none' || selectedIds.length === 0) return;

    if (bulkAction === 'delete') {
      if (!confirm(`Excluir ${selectedIds.length} categorias selecionadas?`)) return;

      setProcessingBulk(true);
      try {
        const res = await fetch('/api/admin/categories/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds }),
        });

        if (res.ok) {
          await fetchCategories();
        } else {
          alert('Erro ao aplicar exclusão em massa');
        }
      } catch (error) {
        alert('Erro ao aplicar exclusão em massa');
      } finally {
        setProcessingBulk(false);
      }
    }
  };

  const toggleStatus = async (category: Category) => {
    const nextStatus = category.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: category.name,
          name_en: category.name_en || '',
          name_es: category.name_es || '',
          slug: category.slug,
          slug_en: category.slug_en || '',
          slug_es: category.slug_es || '',
          parent_id: category.parent_id || '',
          sort_order: category.sort_order,
          status: nextStatus,
          description: category.description || '',
          description_en: category.description_en || '',
          description_es: category.description_es || '',
          icon: category.icon || '',
        }),
      });
      if (res.ok) {
        fetchCategories();
      }
    } catch (error) {
      alert('Erro ao atualizar status');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingCategory ? 'PUT' : 'POST';
      const url = editingCategory ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories';

      // Garante que subcategorias (com parent_id preenchido) não enviem ícone
      const dataToSubmit = {
        ...formData,
        icon: formData.parent_id ? '' : formData.icon,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSubmit),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingCategory(null);
        setFormData({
          name: '',
          name_en: '',
          name_es: '',
          slug: '',
          slug_en: '',
          slug_es: '',
          parent_id: '',
          sort_order: '0',
          status: 'active',
          description: '',
          description_en: '',
          description_es: '',
          icon: ''
        });
        fetchCategories();
      }
    } catch (error) {
      alert('Erro ao salvar categoria');
    }
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      name_en: cat.name_en || '',
      name_es: cat.name_es || '',
      slug: cat.slug,
      slug_en: cat.slug_en || '',
      slug_es: cat.slug_es || '',
      parent_id: cat.parent_id?.toString() || '',
      sort_order: cat.sort_order.toString(),
      status: cat.status,
      description: cat.description || '',
      description_en: cat.description_en || '',
      description_es: cat.description_es || '',
      icon: cat.icon || '',
    });
    setActiveLangTab('pt'); // Resetar aba de idioma para o padrão
    setShowModal(true);
  };

  const filteredCategories = categories.filter(
    (category) =>
      category.name.toLowerCase().includes(search.toLowerCase()) ||
      category.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const hierarchicalCategories = useMemo(() => {
    const byId = new Map(filteredCategories.map((category) => [category.id, category]));
    const childrenByParent = new Map<number | null, Category[]>();

    filteredCategories.forEach((category) => {
      const parentId = category.parent_id && byId.has(category.parent_id) ? category.parent_id : null;
      const list = childrenByParent.get(parentId) || [];
      list.push(category);
      childrenByParent.set(parentId, list);
    });

    const sortByVisualOrder = (items: Category[]) =>
      [...items].sort((left, right) => {
        if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
        return left.name.localeCompare(right.name, 'pt-BR');
      });

    const flattened: Array<Category & { level: number }> = [];
    const walk = (parentId: number | null, level: number) => {
      const children = sortByVisualOrder(childrenByParent.get(parentId) || []);
      children.forEach((child) => {
        flattened.push({ ...child, level });
        walk(child.id, level + 1);
      });
    };

    walk(null, 0);
    return flattened;
  }, [filteredCategories]);

  const allSelected = hierarchicalCategories.length > 0 && hierarchicalCategories.every((category) => selectedIds.includes(category.id));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Categorias</h1>
          <p className="text-slate-500 font-medium">Organize suas matrizes por nichos e temas.</p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null);
            setFormData({ name: '', slug: '', parent_id: '', sort_order: '0', status: 'active', description: '', icon: '' });
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
        >
          <Plus className="w-5 h-5" />
          Nova Categoria
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative w-full lg:w-96">
            <input
              type="text"
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value as 'none' | 'delete')}
              className="px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest"
            >
              <option value="none">Ações em massa</option>
              <option value="delete">Excluir</option>
            </select>
            <button
              onClick={handleBulkApply}
              disabled={processingBulk || selectedIds.length === 0 || bulkAction === 'none'}
              className="px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-800 text-white disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                <th className="px-4 py-6 w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(hierarchicalCategories.map((category) => category.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-8 py-6">Categoria</th>
                <th className="px-8 py-6">Slug</th>
                <th className="px-8 py-6">Pai</th>
                <th className="px-8 py-6 text-center">Ordem</th>
                <th className="px-8 py-6 text-center">Contagem</th>
                <th className="px-8 py-6 text-center">Status</th>
                <th className="px-8 py-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading
                ? [...Array(3)].map((_, index) => (
                    <tr key={index} className="animate-pulse">
                      <td colSpan={8} className="px-8 py-6 h-20 bg-slate-50/20" />
                    </tr>
                  ))
                : hierarchicalCategories.map((category) => (
                    <tr key={category.id} className={`transition-colors group ${category.level > 0 ? 'bg-blue-50/35 hover:bg-blue-50/55' : 'bg-white hover:bg-slate-50/50'}`}>
                      <td className="px-4 py-6">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(category.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, category.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== category.id));
                            }
                          }}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          {!category.parent_id ? (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 flex-shrink-0 border border-blue-100/50">
                              {category.icon ? (
                                <LucideIcon name={category.icon} className="w-5 h-5 text-blue-600" />
                              ) : (
                                <FolderTree className="w-5 h-5 text-blue-500/80" />
                              )}
                            </div>
                          ) : (
                            <div className="w-10 h-10 flex-shrink-0" />
                          )}
                          <div className="flex flex-col">
                            <span
                              className={`text-xs uppercase tracking-tight ${category.level > 0 ? 'font-extrabold text-blue-700' : 'font-black text-slate-800'}`}
                              style={{ paddingLeft: `${category.level * 14}px` }}
                            >
                              {category.level > 0 ? `${'— '.repeat(category.level)}${category.name}` : category.name}
                            </span>
                            {!!category.description && (
                              <span className="text-[10px] font-bold text-slate-400 truncate max-w-[320px]">{category.description}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[10px] font-black text-slate-500">/{category.slug}</span>
                      </td>
                      <td className="px-8 py-6">
                        {category.parent_name ? (
                           <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                            {category.parent_name}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300 uppercase italic">Nenhuma</span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="text-xs font-black text-slate-600">{category.sort_order}</span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="text-xs font-black text-slate-600">{category.product_count || 0}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          {category.status === 'active' ? (
                            <button
                              onClick={() => toggleStatus(category)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Ativo
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleStatus(category)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest"
                            >
                              <XCircle className="w-3 h-3" /> Inativo
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(category)}
                            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(category.id)}
                            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && hierarchicalCategories.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhuma categoria encontrada.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[85vh] md:max-h-[90vh]">
            <div className="px-6 py-5 md:px-10 md:py-8 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tight">
                  {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                </h3>
                <p className="text-slate-400 text-xs font-medium">Preencha as informações detalhadas.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Language Selection Tabs */}
              <div className="px-6 md:px-10 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Idioma Ativo:</span>
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveLangTab('pt')}
                    className={`px-2.5 py-1 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                      activeLangTab === 'pt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    🇧🇷 PT
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLangTab('en')}
                    className={`px-2.5 py-1 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                      activeLangTab === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    🇺🇸 EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLangTab('es')}
                    className={`px-2.5 py-1 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                      activeLangTab === 'es' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    🇪🇸 ES
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-10 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                {activeLangTab === 'pt' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Ex: Animais, Infantil..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Slug</label>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Opcional (gerado automaticamente se vazio)"
                      />
                    </div>
                  </>
                )}

                {activeLangTab !== 'pt' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Nome da Categoria ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('name')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'name' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.name_en : formData.name_es}
                        onChange={(e) => setFormData({ ...formData, [activeLangTab === 'en' ? 'name_en' : 'name_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Ex: Animals, Kids (${activeLangTab.toUpperCase()})`}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Slug ({activeLangTab.toUpperCase()})
                      </label>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.slug_en : formData.slug_es}
                        onChange={(e) => setFormData({ ...formData, [activeLangTab === 'en' ? 'slug_en' : 'slug_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Opcional"
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria Pai</label>
                    <select
                      value={formData.parent_id}
                      onChange={(e) => {
                        const newParentId = e.target.value;
                        setFormData({
                          ...formData,
                          parent_id: newParentId,
                          icon: newParentId ? '' : formData.icon
                        });
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold appearance-none cursor-pointer"
                    >
                      <option value="">Nenhuma (Principal)</option>
                      {categories
                        .filter((category) => category.id !== editingCategory?.id && !category.parent_id)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ordem</label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                    />
                  </div>
                </div>

                {!formData.parent_id && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ícone da Categoria (Lucide)</label>
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={formData.icon}
                          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                          className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                          placeholder="Ex: Dog, Flag, Car, Skull..."
                        />
                      </div>
                      <div className="w-14 h-14 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-700 flex-shrink-0">
                        {formData.icon ? (
                          <LucideIcon name={formData.icon} className="w-6 h-6" />
                        ) : (
                          <span className="text-[9px] font-black uppercase text-slate-300">Nenhum</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Sugestões rápidas de ícones:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'Dog', label: 'Animais' },
                          { name: 'Gamepad2', label: 'Animes' },
                          { name: 'Flag', label: 'Bandeiras' },
                          { name: 'Flame', label: 'Bombeiros' },
                          { name: 'Car', label: 'Carros' },
                          { name: 'Skull', label: 'Caveiras' },
                          { name: 'Heart', label: 'Coleções' },
                          { name: 'Sparkles', label: 'Destaque' },
                          { name: 'School', label: 'Escolar' },
                          { name: 'Flower2', label: 'Florais' },
                          { name: 'Palette', label: 'Artes' },
                          { name: 'Gift', label: 'Presentes' },
                          { name: 'Bug', label: 'Insetos' },
                          { name: 'ShieldAlert', label: 'Policial / Militar' },
                          { name: 'Compass', label: 'Texas / Maçonaria' },
                          { name: 'Landmark', label: 'Governo / Institutos' },
                          { name: 'Briefcase', label: 'Profissões / Empresas' },
                          { name: 'GraduationCap', label: 'Faculdade / Univ.' },
                          { name: 'Shield', label: 'Brasões' },
                          { name: 'Fuel', label: 'Autos / Logomarcas' },
                          { name: 'Wrench', label: 'Escola Técnica' },
                          { name: 'Users', label: 'Personagens' },
                          { name: 'Building2', label: 'Instituições' },
                          { name: 'Church', label: 'Religiosos' },
                          { name: 'Apple', label: 'Frutas' },
                          { name: 'Flower', label: 'Decorativos' },
                          { name: 'Fish', label: 'Peixe e Pesca' },
                          { name: 'Trophy', label: 'Times e Clubes' },
                          { name: 'Crown', label: 'Marcas Famosas' },
                          { name: 'Notebook', label: 'Material Escolar' },
                          { name: 'Tractor', label: 'Tratores' },
                          { name: 'Map', label: 'Brasil / Mapas' },
                          { name: 'Bike', label: 'Motos' }
                        ].map((sug) => (
                          <button
                            key={sug.name}
                            type="button"
                            onClick={() => setFormData({ ...formData, icon: sug.name })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                              formData.icon === sug.name
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <LucideIcon name={sug.name} className="w-3.5 h-3.5" />
                            {sug.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeLangTab === 'pt' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                    <textarea
                      rows={4}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder="Descrição da categoria (opcional)"
                    />
                  </div>
                )}

                {activeLangTab !== 'pt' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Descrição ({activeLangTab.toUpperCase()})
                      </label>
                      <button
                        type="button"
                        disabled={translatingField !== null}
                        onClick={() => handleAutoTranslate('description')}
                        className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {translatingField === 'description' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={activeLangTab === 'en' ? formData.description_en : formData.description_es}
                      onChange={(e) => setFormData({ ...formData, [activeLangTab === 'en' ? 'description_en' : 'description_es']: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder={`Descrição da categoria em ${activeLangTab.toUpperCase()} (opcional)`}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'active' })}
                      className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                        formData.status === 'active'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-lg shadow-emerald-500/10'
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'inactive' })}
                      className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                        formData.status === 'inactive'
                          ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-500/10'
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Inativo
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 md:px-10 md:py-6 border-t border-slate-50 bg-slate-50/50 flex-shrink-0">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl md:rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3"
                >
                  <Save className="w-5 h-5" />
                  Salvar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
