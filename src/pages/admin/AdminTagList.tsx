import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Tag as TagIcon,
  X,
  Save,
  Search
} from 'lucide-react';

interface Tag {
  id: number;
  name: string;
  slug: string;
}

export default function AdminTagList() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/admin/tags');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTags(data);
      } else {
        console.error('Data is not an array:', data);
        setTags([]);
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error);
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) return;
    
    try {
      const res = await fetch(`/api/admin/tags/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTags();
      }
    } catch (error) {
      alert('Erro ao excluir tag');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName })
      });

      if (res.ok) {
        setShowModal(false);
        setNewTagName('');
        fetchTags();
      }
    } catch (error) {
      alert('Erro ao salvar tag');
    }
  };

  const filteredTags = tags.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Tags</h1>
          <p className="text-slate-500 font-medium">Marcas para facilitar a busca e organização dos produtos.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
        >
          <Plus className="w-5 h-5" />
          Nova Tag
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Buscar tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          </div>
        </div>

        <div className="p-8">
          {loading ? (
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
               {[...Array(6)].map((_, i) => (
                 <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
               ))}
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredTags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-blue-100 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <TagIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{tag.name}</span>
                  </div>
                  <button 
                    onClick={() => handleDelete(tag.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {!loading && filteredTags.length === 0 && (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhuma tag encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tag */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
             <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Nova Tag</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center text-slate-400"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Tag</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                />
              </div>
              <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20">
                Salvar Tag
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
