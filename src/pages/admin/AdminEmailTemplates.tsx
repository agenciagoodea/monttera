import React, { useEffect, useState } from 'react';
import { Mail, Edit3, Check, X, Send } from 'lucide-react';
import axios from 'axios';

interface EmailTemplate {
  id: number;
  key: string;
  name: string;
  subject: string;
  body: string;
  variables: string;
  active: number;
}

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get('/api/admin/email-templates', { withCredentials: true });
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEditClick = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditBody(template.body);
    setTestMessage('');
  };

  const handleSave = async () => {
    if (!editingTemplate) return;
    try {
      await axios.put(`/api/admin/email-templates/${editingTemplate.key}`, {
        subject: editSubject,
        body: editBody,
      }, { withCredentials: true });
      
      setTemplates(templates.map(t => 
        t.id === editingTemplate.id ? { ...t, subject: editSubject, body: editBody } : t
      ));
      setEditingTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Erro ao salvar template');
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !editingTemplate) return;
    setTestLoading(true);
    setTestMessage('');
    try {
      const { data } = await axios.post('/api/admin/email/send-test', {
        to: testEmail,
        template_key: editingTemplate.key
      }, { withCredentials: true });
      setTestMessage(data.message || 'E-mail enviado com sucesso!');
    } catch (error: any) {
      console.error('Error sending test email:', error);
      setTestMessage(error.response?.data?.error || 'Erro ao enviar e-mail de teste');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      await axios.post('/api/admin/email-templates/seed', {}, { withCredentials: true });
      fetchTemplates();
    } catch (error) {
      console.error('Error seeding templates:', error);
      alert('Erro ao criar templates padrão');
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Carregando templates...</div>;
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de Templates */}
        <div className="lg:col-span-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Selecione um template</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {templates.length === 0 ? (
              <div className="p-6 text-center space-y-4">
                <p className="text-sm text-slate-500">Nenhum template encontrado.</p>
                <button onClick={handleSeed} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700">
                  Criar Templates Padrão
                </button>
              </div>
            ) : (
              templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleEditClick(t)}
                className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${editingTemplate?.id === t.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'}`}
              >
                <div className="font-medium text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500 mt-1 truncate">{t.subject}</div>
              </button>
            )))}
          </div>
        </div>

        {/* Editor de Template */}
        <div className="lg:col-span-2">
          {editingTemplate ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{editingTemplate.name}</h2>
                  <p className="text-sm text-gray-500">Chave: <span className="font-mono bg-gray-200 px-1 rounded">{editingTemplate.key}</span></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                  <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Check className="w-4 h-4" /> Salvar Alterações
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assunto do E-mail</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex justify-between items-center">
                    <span>Corpo do E-mail (HTML)</span>
                    <span className="text-xs text-blue-600">Suporta Handlebars {`{{variavel}}`}</span>
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={12}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  ></textarea>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Variáveis Disponíveis</h3>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(editingTemplate.variables || '[]').map((v: string) => (
                      <span key={v} className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-600">
                        {`{{${v}}}`}
                      </span>
                    ))}
                    <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-mono text-blue-700">
                      {`{{store_name}}`}
                    </span>
                    <span className="px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-mono text-blue-700">
                      {`{{store_logo}}`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Clique na caixa de texto onde deseja inserir e digite a variável conforme listado acima.</p>
                </div>

                <hr className="my-6" />

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Send className="w-4 h-4 text-gray-500" /> Disparar E-mail de Teste
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="E-mail de destino"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleTestEmail}
                      disabled={testLoading || !testEmail}
                      className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-900 disabled:opacity-50"
                    >
                      {testLoading ? 'Enviando...' : 'Enviar Teste'}
                    </button>
                  </div>
                  {testMessage && (
                    <p className={`mt-2 text-sm ${testMessage.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
                      {testMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-gray-200 border-dashed p-12 text-center text-gray-500">
              <Edit3 className="w-12 h-12 mb-4 text-gray-400" />
              <p className="text-lg">Selecione um template na lista ao lado para editá-lo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
