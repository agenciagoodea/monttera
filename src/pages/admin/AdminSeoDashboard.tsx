import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ShoppingBag, 
  Image, 
  ExternalLink, 
  Copy, 
  RefreshCw, 
  FileCode,
  Link,
  Edit2
} from 'lucide-react';

interface SeoAlert {
  type: string;
  severity: 'warning' | 'danger';
  message: string;
  productId: number;
  productName: string;
}

interface SeoMetrics {
  totalProducts: number;
  shoppingEligible: number;
  productsWithoutAlt: number;
  productsWithoutDescription: number;
  productsWithoutCategory: number;
  productsWithDuplicateTitles: number;
  sitemapsCount: number;
  alerts: SeoAlert[];
}

export default function AdminSeoDashboard() {
  const [metrics, setMetrics] = useState<SeoMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchMetrics = async () => {
    try {
      setError(null);
      const res = await fetch('/api/admin/seo/dashboard-metrics', { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar métricas de SEO.');
      const data = await res.json();
      setMetrics(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMetrics();
  };

  const copyToClipboard = (urlPath: string) => {
    const fullUrl = `${window.location.origin}${urlPath}`;
    navigator.clipboard.writeText(fullUrl);
    setMessage({ text: 'Link copiado com sucesso!', type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Auditoria SEO...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <XCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Erro de Conexão</h3>
        <p className="text-xs font-semibold text-slate-500 leading-relaxed mb-6">{error || 'Não foi possível carregar as métricas.'}</p>
        <button 
          onClick={fetchMetrics} 
          className="px-6 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // Filtrar alertas baseando-se no tipo selecionado
  const filteredAlerts = metrics.alerts.filter(alert => {
    if (filterType === 'all') return true;
    return alert.type === filterType;
  });

  // Cálculo da pontuação SEO da plataforma baseado nos problemas
  const totalIssuesCount = metrics.alerts.length;
  let seoHealthScore = 100;
  if (metrics.totalProducts > 0) {
    const penaltyPerIssue = 40 / Math.max(1, metrics.totalProducts); // Penalidade balanceada por quantidade de produtos
    seoHealthScore = Math.max(50, Math.round(100 - (totalIssuesCount * penaltyPerIssue)));
  }

  return (
    <div className="p-6 md:p-10 space-y-10 max-w-[1600px] mx-auto">
      
      {/* Toast Messages */}
      {message && (
        <div className={`fixed bottom-5 right-5 px-6 py-4 rounded-2xl shadow-xl z-50 transition-all transform animate-bounce flex items-center gap-3 text-xs font-bold ${
          message.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-wider">SEO Dashboard</h2>
          <p className="text-xs font-semibold text-slate-400 mt-1">Auditoria avançada e elegibilidade no Google Search, Imagens e Shopping.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar Dados
        </button>
      </div>

      {/* Visão Geral da Saúde e Pontuação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Saúde SEO Geral */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm flex flex-col md:flex-row items-center gap-8 lg:col-span-2">
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* Círculo de Progresso da Saúde */}
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle cx="72" cy="72" r="64" className="stroke-slate-100" strokeWidth="12" fill="transparent" />
              <circle 
                cx="72" 
                cy="72" 
                r="64" 
                className={`transition-all duration-500 ${
                  seoHealthScore >= 85 ? 'stroke-emerald-500' : seoHealthScore >= 70 ? 'stroke-amber-500' : 'stroke-rose-500'
                }`}
                strokeWidth="12" 
                fill="transparent"
                strokeDasharray={2 * Math.PI * 64}
                strokeDashoffset={2 * Math.PI * 64 * (1 - seoHealthScore / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-black text-slate-800">{seoHealthScore}%</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Saúde SEO</span>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Diagnóstico da Plataforma</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              Sua pontuação de saúde reflete a qualidade dos metadados e da estruturação das informações na loja. 
              {seoHealthScore >= 90 ? ' Excelente! Quase todos os seus produtos estão totalmente otimizados e prontos para decolar no Google.' : 
               seoHealthScore >= 75 ? ' Bom, mas há alguns pontos de melhoria que impedem sua loja de atingir o potencial máximo de vendas orgânicas.' : 
               ' Atenção! Existem problemas significativos em títulos, descrições ou imagens que prejudicam a indexação orgânica.'}
            </p>
            <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>WWW para não-WWW 301 ativo</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Dados estruturados dinâmicos</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cobertura de Canais do Google */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm space-y-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Elegibilidade nos Canais</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-700">Google Search</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3" /> Elegível
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <Image className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-700">Google Imagens</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3" /> Elegível
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-bold text-slate-700">Google Shopping</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3" /> Elegível
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total de Produtos */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-32">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total de Produtos Ativos</p>
          <div className="flex items-end justify-between mt-4">
            <span className="text-3xl font-black text-slate-800">{metrics.totalProducts}</span>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Elegibilidade Shopping */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-32">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Elegíveis no Google Shopping</p>
          <div className="flex items-end justify-between mt-4">
            <span className="text-3xl font-black text-slate-800">{metrics.shoppingEligible}</span>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Produtos sem ALT */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-32 border-l-4 border-l-amber-400">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Sem ALT Text</p>
          <div className="flex items-end justify-between mt-4">
            <span className="text-3xl font-black text-amber-600">{metrics.productsWithoutAlt}</span>
            <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
              <Image className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Sem Descrição Completa */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-32 border-l-4 border-l-rose-400">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sem Descrição/Muito Curta</p>
          <div className="flex items-end justify-between mt-4">
            <span className="text-3xl font-black text-rose-600">{metrics.productsWithoutDescription}</span>
            <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
        </div>

      </div>

      {/* Sitemaps e Integrações Google */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <FileCode className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Sitemaps XML e Google Merchant Feed</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Sitemap Index */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-4">
            <div>
              <p className="text-xs font-black text-slate-800">Sitemap XML Indexador</p>
              <p className="text-[10px] text-slate-400 font-bold font-mono">/sitemap.xml</p>
              <p className="text-xs text-slate-500 font-semibold mt-2">Aponta automaticamente para todos os outros sub-sitemaps (estático, produtos, categorias, imagens).</p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/sitemap.xml" target="_blank" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 hover:bg-slate-50">
                Ver Sitemap <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => copyToClipboard('/sitemap.xml')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50" title="Copiar URL">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Sitemap Imagens */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-4">
            <div>
              <p className="text-xs font-black text-slate-800">Sitemap de Imagens</p>
              <p className="text-[10px] text-slate-400 font-bold font-mono">/sitemap-images.xml</p>
              <p className="text-xs text-slate-500 font-semibold mt-2">Específico com todas as URLs de fotos dos produtos e títulos correspondentes para otimizar o Google Imagens.</p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/sitemap-images.xml" target="_blank" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 hover:bg-slate-50">
                Ver Sitemap <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => copyToClipboard('/sitemap-images.xml')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50" title="Copiar URL">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Google Merchant */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-4">
            <div>
              <p className="text-xs font-black text-slate-800">Feed Google Merchant Center</p>
              <p className="text-[10px] text-slate-400 font-bold font-mono">/google-merchant.xml</p>
              <p className="text-xs text-slate-500 font-semibold mt-2">Feed RSS de produtos XML oficial exigido pelo Google Merchant Center e Google Shopping. Atualizado dinamicamente.</p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/google-merchant.xml" target="_blank" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 hover:bg-slate-50">
                Ver Feed XML <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => copyToClipboard('/google-merchant.xml')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50" title="Copiar URL">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Lista de Alertas e Correções */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-50 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Pendências de SEO Encontradas ({metrics.alerts.length})</h3>
          </div>

          {/* Filtros de Tipos de Alerta */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setFilterType('all')} 
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilterType('alt_missing')} 
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                filterType === 'alt_missing' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              }`}
            >
              Sem Alt ({metrics.productsWithoutAlt})
            </button>
            <button 
              onClick={() => setFilterType('description_short')} 
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                filterType === 'description_short' ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
              }`}
            >
              Sem Descrição / Curta ({metrics.productsWithoutDescription})
            </button>
            <button 
              onClick={() => setFilterType('duplicate_title')} 
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                filterType === 'duplicate_title' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              Duplicados ({metrics.productsWithDuplicateTitles})
            </button>
          </div>
        </div>

        {/* Tabela de Alertas */}
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 animate-pulse" />
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Tudo limpo!</h4>
            <p className="text-xs font-semibold text-slate-400 mt-1">Nenhum problema de SEO encontrado com este filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-4 px-6">Produto</th>
                  <th className="py-4 px-6">Tipo do Alerta</th>
                  <th className="py-4 px-6">Gravidade</th>
                  <th className="py-4 px-6">Descrição do Problema</th>
                  <th className="py-4 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                {filteredAlerts.map((alert, index) => (
                  <tr key={`${alert.productId}-${alert.type}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-800">{alert.productName}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider font-mono ${
                        alert.type === 'duplicate_title' 
                          ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                          : alert.type === 'alt_missing'
                          ? 'bg-amber-50 text-amber-600 border border-amber-100'
                          : 'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {alert.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${
                        alert.severity === 'danger' ? 'text-rose-600' : 'text-amber-500'
                      }`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {alert.severity === 'danger' ? 'Crítico' : 'Alerta'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-medium max-w-sm truncate" title={alert.message}>
                      {alert.message}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <a 
                        href={`/admin/produtos/editar/${alert.productId}`} 
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                        Corrigir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
