import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3,
  X,
  Save,
  Search,
  BookOpen,
  Calendar,
  User,
  Eye,
  Settings
} from 'lucide-react';
import HtmlRichEditor from '../../components/admin/HtmlRichEditor';

interface BlogPost {
  id: number;
  title: string;
  title_en: string;
  title_es: string;
  slug: string;
  slug_en: string;
  slug_es: string;
  excerpt: string;
  excerpt_en: string;
  excerpt_es: string;
  content: string;
  content_en: string;
  content_es: string;
  image: string;
  author: string;
  status: string;
  published_at: string;
  created_at: string;
}

export default function AdminBlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  
  const [activeLangTab, setActiveLangTab] = useState<'pt' | 'en' | 'es'>('pt');
  const [translatingField, setTranslatingField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    title_en: '',
    title_es: '',
    slug: '',
    slug_en: '',
    slug_es: '',
    excerpt: '',
    excerpt_en: '',
    excerpt_es: '',
    content: '',
    content_en: '',
    content_es: '',
    image: '',
    author: '',
    status: 'draft',
    published_at: ''
  });

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/blog');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPosts(data);
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Failed to fetch blog posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta postagem?')) return;
    try {
      const res = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchPosts();
      }
    } catch (error) {
      alert('Erro ao excluir postagem');
    }
  };

  const handleAutoTranslate = async (field: 'title' | 'excerpt' | 'content') => {
    const sourceText = formData[field];
    if (!sourceText || sourceText.replace(/<[^>]*>/g, '').trim().length === 0) {
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
        
        if (field === 'title') {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingPost ? 'PUT' : 'POST';
      const url = editingPost ? `/api/admin/blog/${editingPost.id}` : '/api/admin/blog';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          published_at: formData.status === 'published' && !formData.published_at 
            ? new Date().toISOString() 
            : formData.published_at
        })
      });

      if (res.ok) {
        setShowModal(false);
        setEditingPost(null);
        setFormData({
          title: '',
          title_en: '',
          title_es: '',
          slug: '',
          slug_en: '',
          slug_es: '',
          excerpt: '',
          excerpt_en: '',
          excerpt_es: '',
          content: '',
          content_en: '',
          content_es: '',
          image: '',
          author: '',
          status: 'draft',
          published_at: ''
        });
        fetchPosts();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao salvar postagem');
      }
    } catch (error) {
      alert('Erro ao salvar postagem');
    }
  };

  const openEdit = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title || '',
      title_en: post.title_en || '',
      title_es: post.title_es || '',
      slug: post.slug || '',
      slug_en: post.slug_en || '',
      slug_es: post.slug_es || '',
      excerpt: post.excerpt || '',
      excerpt_en: post.excerpt_en || '',
      excerpt_es: post.excerpt_es || '',
      content: post.content || '',
      content_en: post.content_en || '',
      content_es: post.content_es || '',
      image: post.image || '',
      author: post.author || '',
      status: post.status || 'draft',
      published_at: post.published_at || ''
    });
    setActiveLangTab('pt');
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingPost(null);
    setFormData({
      title: '',
      title_en: '',
      title_es: '',
      slug: '',
      slug_en: '',
      slug_es: '',
      excerpt: '',
      excerpt_en: '',
      excerpt_es: '',
      content: '',
      content_en: '',
      content_es: '',
      image: '',
      author: '',
      status: 'draft',
      published_at: ''
    });
    setActiveLangTab('pt');
    setShowModal(true);
  };

  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(search.toLowerCase()) || 
    post.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Blog e Notícias</h1>
          <p className="text-slate-500 font-medium">Crie artigos, novidades e guias com suporte a SEO multilíngue e tradução com IA.</p>
        </div>
        <button 
          onClick={openCreate}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Nova Postagem
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Buscar por título ou autor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              {filteredPosts.length} Artigos
            </span>
          </div>
        </div>

        <div className="p-8">
          {loading ? (
             <div className="space-y-4">
               {[...Array(3)].map((_, i) => (
                 <div key={i} className="h-24 bg-slate-50 rounded-2xl animate-pulse" />
               ))}
             </div>
          ) : (
            <div className="space-y-4">
              {filteredPosts.map((post) => (
                <div key={post.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:bg-white hover:border-blue-100 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                  {post.image && (
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0">
                      <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase border ${
                        post.status === 'published' 
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                          : 'bg-amber-50 border-amber-100 text-amber-600'
                      }`}>
                        {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {post.author}
                      </span>
                      {post.published_at && (
                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(post.published_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">
                      {post.title}
                    </h3>
                    <p className="text-slate-500 text-xs font-medium line-clamp-2">
                      {post.excerpt || post.content.replace(/<[^>]*>/g, '').slice(0, 150)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                    <button
                      onClick={() => openEdit(post)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(post.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!loading && filteredPosts.length === 0 && (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhuma postagem encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Blog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {editingPost ? 'Editar Postagem' : 'Nova Postagem'}
              </h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Language Selection Tabs */}
            <div className="px-10 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Idioma Ativo:</span>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveLangTab('pt')}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${
                    activeLangTab === 'pt' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🇧🇷 PT
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLangTab('en')}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${
                    activeLangTab === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🇺🇸 EN
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLangTab('es')}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${
                    activeLangTab === 'es' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🇪🇸 ES
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-10 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                
                {/* --- PORTUGUESE FIELDS --- */}
                {activeLangTab === 'pt' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título do Artigo</label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Ex: Como Bordar em Tecidos Finos"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Slug amigável</label>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={e => setFormData({ ...formData, slug: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="ex: como-bordar-em-tecidos-finos"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Breve Resumo (Excerpt)</label>
                      <textarea
                        rows={3}
                        value={formData.excerpt}
                        onChange={e => setFormData({ ...formData, excerpt: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none"
                        placeholder="Resumo para listagens..."
                      />
                    </div>

                    <div className="space-y-2">
                      <HtmlRichEditor
                        label="Conteúdo do Artigo"
                        value={formData.content}
                        onChange={value => setFormData(prev => ({ ...prev, content: value }))}
                        rows={12}
                        placeholder="Escreva o artigo completo aqui..."
                      />
                    </div>
                  </>
                )}

                {/* --- TRANSLATED FIELDS (EN / ES) --- */}
                {activeLangTab !== 'pt' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Título ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('title')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'title' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.title_en : formData.title_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'title_en' : 'title_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Título em ${activeLangTab.toUpperCase()}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Slug ({activeLangTab.toUpperCase()})
                      </label>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.slug_en : formData.slug_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'slug_en' : 'slug_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Opcional"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Resumo ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('excerpt')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'excerpt' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={activeLangTab === 'en' ? formData.excerpt_en : formData.excerpt_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'excerpt_en' : 'excerpt_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Resumo em ${activeLangTab.toUpperCase()}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Conteúdo Completo ({activeLangTab.toUpperCase()})
                        </span>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('content')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'content' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <HtmlRichEditor
                        label=""
                        value={activeLangTab === 'en' ? formData.content_en : formData.content_es}
                        onChange={value => setFormData(prev => ({ ...prev, [activeLangTab === 'en' ? 'content_en' : 'content_es']: value }))}
                        rows={12}
                        placeholder={`Conteúdo completo em ${activeLangTab.toUpperCase()}...`}
                      />
                    </div>
                  </>
                )}

                {/* --- GLOBAL FIELDS --- */}
                <div className="border-t border-slate-100 pt-6 space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Configurações Gerais</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagem de Destaque (URL)</label>
                    <input
                      type="text"
                      value={formData.image}
                      onChange={e => setFormData({ ...formData, image: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                      placeholder="Ex: /uploads/artigo-bordado.jpg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Autor</label>
                      <input
                        type="text"
                        required
                        value={formData.author}
                        onChange={e => setFormData({ ...formData, author: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                        placeholder="Ex: Equipe Digital Bordados"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold appearance-none cursor-pointer"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="published">Publicado</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>

              <div className="px-10 py-6 border-t border-slate-50 bg-slate-50/50 flex-shrink-0">
                <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 cursor-pointer">
                  <Save className="w-5 h-5" />
                  Salvar Postagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
