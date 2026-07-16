import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, Trash2, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Link as LinkIcon } from 'lucide-react';

export default function DataDeletion() {
  const { user } = useAuth();
  
  // State do formulário
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  
  // Status de envio
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Autopreencher se o usuário estiver logado
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/public/privacy/delete-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          details: details || `Solicitação de exclusão de conta via página de privacidade por ${name}.`,
        }),
      });

      if (response.ok) {
        setSuccess(true);
        setDetails('');
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || 'Não foi possível enviar a solicitação. Tente novamente mais tarde.');
      }
    } catch (err) {
      console.error(err);
      setError('Erro de conexão ao enviar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-slate-800">
      {/* Header */}
      <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-md">
          <Trash2 className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">Exclusão de Dados do Usuário</h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Instruções de revogação de acesso e solicitação de exclusão em conformidade com a LGPD e a Meta (Facebook).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Coluna de Instruções (Facebook / LGPD) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card: Como excluir via Facebook */}
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-100/30 space-y-4">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true" className="shrink-0">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Instruções de Remoção no Facebook
            </h2>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Se você utilizou o recurso "Entrar com Facebook" e deseja remover as permissões do aplicativo <strong>Monttera</strong> de sua conta, você pode revogá-lo diretamente pelas configurações da Meta:
            </p>
            
            <ol className="text-xs text-slate-600 font-semibold space-y-2 list-decimal pl-5">
              <li>Acesse as configurações do seu perfil do Facebook em <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Configurações &gt; Aplicativos e Sites</a>.</li>
              <li>Procure e selecione o aplicativo <strong>"Monttera"</strong> ou <strong>"Monttera Login"</strong> na lista.</li>
              <li>Clique no botão <strong>Remover</strong> ao lado do nome do aplicativo.</li>
              <li>Confirme a remoção na caixa de diálogo. Pronto! O aplicativo não terá mais acesso às suas informações básicas.</li>
            </ol>
          </div>

          {/* Card: Direitos LGPD */}
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-100/30 space-y-4">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-600" />
              Seus Direitos (LGPD)
            </h2>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você possui o direito de solicitar a exclusão definitiva dos seus dados coletados e armazenados em nossa plataforma a qualquer momento.
            </p>
            <div className="bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-100 p-4 text-xs font-semibold leading-relaxed">
              <strong>O que acontece ao excluir seus dados?</strong>
              <ul className="list-disc pl-5 mt-1.5 space-y-1">
                <li>Sua conta e perfil de acesso serão removidos de forma definitiva.</li>
                <li>Seu histórico de pedidos será apagado.</li>
                <li><strong>Atenção:</strong> Você perderá permanentemente o acesso ao painel de downloads dos produtos que comprou em nosso site.</li>
              </ul>
            </div>
          </div>

        </div>

        {/* Coluna do Formulário de Solicitação */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-xl shadow-slate-200/40 sticky top-6 space-y-6">
            
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Solicitar Exclusão</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Preencha o formulário para processar a remoção</p>
            </div>

            {success ? (
              <div className="bg-green-50 border border-green-100 text-green-700 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wider">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  Solicitação Recebida!
                </div>
                <p className="text-xs font-semibold leading-relaxed">
                  Sua solicitação de exclusão de dados foi registrada em nosso sistema de conformidade de privacidade. Enviamos um e-mail de confirmação para <strong>{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setSuccess(false)}
                  className="w-full mt-2 py-3 bg-white text-green-700 border border-green-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-100/50 transition-colors"
                >
                  Nova Solicitação
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {user && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-xs font-semibold leading-relaxed text-amber-800">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      Você está logado como <strong>{user.name}</strong>. Enviar este formulário solicitará a remoção da sua conta de acesso.
                    </div>
                  </div>
                )}

                {/* Campo Nome */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Seu Nome Completo</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(user) || loading}
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    placeholder="Ex: João Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Campo E-mail */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Cadastrado / Vinculado</label>
                  <input
                    type="email"
                    required
                    disabled={Boolean(user) || loading}
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    placeholder="Ex: joao@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* Campo Detalhes */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Detalhes (Opcional)</label>
                  <textarea
                    rows={4}
                    disabled={loading}
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 disabled:opacity-60 resize-none"
                    placeholder="Escreva alguma observação ou motivo da exclusão, se desejar..."
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-rose-600 text-xs font-bold ml-1 animate-shake">{error}</p>
                )}

                {/* Botão de Envio */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      Solicitar Exclusão
                      <ArrowRight className="w-4.5 h-4.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Monttera • LGPD</span>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}
