import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3,
  X,
  Save,
  Search,
  HelpCircle,
  Sparkles
} from 'lucide-react';

interface Faq {
  id: number;
  question: string;
  question_en: string;
  question_es: string;
  answer: string;
  answer_en: string;
  answer_es: string;
  category: string;
  category_en: string;
  category_es: string;
  sort_order: number;
}

export default function AdminFaqList() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  
  const [activeLangTab, setActiveLangTab] = useState<'pt' | 'en' | 'es'>('pt');
  const [translatingField, setTranslatingField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    question: '',
    question_en: '',
    question_es: '',
    answer: '',
    answer_en: '',
    answer_es: '',
    category: '',
    category_en: '',
    category_es: '',
    sort_order: '0'
  });

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      // No admin, listamos tudo
      const res = await fetch('/api/admin/faqs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaqs(data);
      } else {
        setFaqs([]);
      }
    } catch (error) {
      console.error('Failed to fetch FAQs:', error);
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta pergunta frequente?')) return;
    try {
      const res = await fetch(`/api/admin/faqs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchFaqs();
      }
    } catch (error) {
      alert('Erro ao excluir FAQ');
    }
  };

  const handleAutoTranslate = async (field: 'question' | 'answer' | 'category') => {
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
      const method = editingFaq ? 'PUT' : 'POST';
      const url = editingFaq ? `/api/admin/faqs/${editingFaq.id}` : '/api/admin/faqs';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowModal(false);
        setEditingFaq(null);
        setFormData({
          question: '',
          question_en: '',
          question_es: '',
          answer: '',
          answer_en: '',
          answer_es: '',
          category: '',
          category_en: '',
          category_es: '',
          sort_order: '0'
        });
        fetchFaqs();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao salvar FAQ');
      }
    } catch (error) {
      alert('Erro ao salvar FAQ');
    }
  };

  const openEdit = (faq: Faq) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question || '',
      question_en: faq.question_en || '',
      question_es: faq.question_es || '',
      answer: faq.answer || '',
      answer_en: faq.answer_en || '',
      answer_es: faq.answer_es || '',
      category: faq.category || '',
      category_en: faq.category_en || '',
      category_es: faq.category_es || '',
      sort_order: String(faq.sort_order || 0)
    });
    setActiveLangTab('pt');
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingFaq(null);
    setFormData({
      question: '',
      question_en: '',
      question_es: '',
      answer: '',
      answer_en: '',
      answer_es: '',
      category: '',
      category_en: '',
      category_es: '',
      sort_order: '0'
    });
    setActiveLangTab('pt');
    setShowModal(true);
  };

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(search.toLowerCase()) || 
    faq.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Perguntas Frequentes (FAQ)</h1>
          <p className="text-slate-500 font-medium">Gerencie as dúvidas mais comuns dos clientes com suporte multilíngue.</p>
        </div>
        <button 
          onClick={openCreate}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Novo FAQ
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative w-full md:w-96">
            <input
              type="text"
              placeholder="Buscar FAQ por pergunta ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              {filteredFaqs.length} Perguntas
            </span>
          </div>
        </div>

        <div className="p-8">
          {loading ? (
             <div className="space-y-4">
               {[...Array(3)].map((_, i) => (
                 <div key={i} className="h-20 bg-slate-50 rounded-2xl animate-pulse" />
               ))}
             </div>
          ) : (
            <div className="space-y-4">
              {filteredFaqs.map((faq) => (
                <div key={faq.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:bg-white hover:border-blue-100 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase border border-blue-100">
                        {faq.category}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">
                        Ordem: {faq.sort_order}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-start gap-2">
                      <HelpCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      {faq.question}
                    </h3>
                    <p className="text-slate-500 text-xs font-medium pl-7 line-clamp-2">
                      {faq.answer.replace(/<[^>]*>/g, '')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                    <button
                      onClick={() => openEdit(faq)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(faq.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!loading && filteredFaqs.length === 0 && (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Nenhuma pergunta frequente encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal FAQ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[85vh]">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {editingFaq ? 'Editar FAQ' : 'Novo FAQ'}
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
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pergunta</label>
                      <input
                        type="text"
                        required
                        value={formData.question}
                        onChange={e => setFormData({ ...formData, question: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Ex: Como faço para baixar meus bordados?"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resposta</label>
                      <textarea
                        required
                        rows={4}
                        value={formData.answer}
                        onChange={e => setFormData({ ...formData, answer: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Escreva a resposta detalhada..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                      <input
                        type="text"
                        required
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder="Ex: Downloads, Pagamentos..."
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
                          Pergunta ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('question')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'question' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.question_en : formData.question_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'question_en' : 'question_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Pergunta em ${activeLangTab.toUpperCase()}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Resposta ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('answer')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'answer' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={activeLangTab === 'en' ? formData.answer_en : formData.answer_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'answer_en' : 'answer_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Resposta em ${activeLangTab.toUpperCase()}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Categoria ({activeLangTab.toUpperCase()})
                        </label>
                        <button
                          type="button"
                          disabled={translatingField !== null}
                          onClick={() => handleAutoTranslate('category')}
                          className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {translatingField === 'category' ? 'Traduzindo...' : '🤖 Traduzir com Gemini'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeLangTab === 'en' ? formData.category_en : formData.category_es}
                        onChange={e => setFormData({ ...formData, [activeLangTab === 'en' ? 'category_en' : 'category_es']: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                        placeholder={`Categoria em ${activeLangTab.toUpperCase()}`}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ordem de Exibição</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={e => setFormData({ ...formData, sort_order: e.target.value })}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="px-10 py-6 border-t border-slate-50 bg-slate-50/50 flex-shrink-0">
                <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 cursor-pointer">
                  <Save className="w-5 h-5" />
                  Salvar FAQ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
