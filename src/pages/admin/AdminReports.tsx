import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ShoppingBag, Users, Download, Filter, RefreshCcw, FileText, ChevronRight, DollarSign } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { normalizePublicMediaUrl } from '../../lib/utils';

interface ReportStats {
  revenue: { total: number; average: number; gross?: number; net?: number };
  orders: { total: number };
  comparison?: { gross?: number; net?: number; orders?: number; average_ticket?: number };
  salesChart: any[];
  topProducts: any[];
  paymentMethods: any[];
  categoryUsage: any[];
  soldProducts?: any[];
}

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [period, setPeriod] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'custom' && customStart && customEnd) {
        params.set('start', customStart);
        params.set('end', customEnd);
      }
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch report stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || !stats) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.setFontSize(18);
      pdf.setTextColor(30, 41, 59);
      pdf.text('RELATORIO DE DESEMPENHO - LOJA ONLINE', 15, 20);
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139);
      const dateStr = new Date().toLocaleDateString('pt-BR');
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      pdf.text(`Gerado em: ${dateStr} as ${timeStr} | Periodo: ${period.toUpperCase()}`, 15, 28);

      pdf.addImage(imgData, 'PNG', 10, 35, pdfWidth - 20, pdfHeight - 20);
      pdf.save(`relatorio-desempenho-${period}-${Date.now()}.pdf`);
    } catch (error) {
      console.error('PDF Export error:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!stats) return;
    const lines: string[] = [];
    lines.push('Relatório de Desempenho');
    lines.push(`Periodo,${period}`);
    lines.push(`Receita Bruta,${Number(stats.revenue?.gross || 0).toFixed(2)}`);
    lines.push(`Receita Liquida,${Number(stats.revenue?.net || stats.revenue?.total || 0).toFixed(2)}`);
    lines.push(`Pedidos,${Number(stats.orders?.total || 0)}`);
    lines.push(`Ticket Medio,${Number(stats.revenue?.average || 0).toFixed(2)}`);
    lines.push('');
    lines.push('Historico de Vendas');
    lines.push('Periodo,Valor');
    (stats.salesChart || []).forEach((row: any) => lines.push(`${row.name},${Number(row.value || 0).toFixed(2)}`));
    lines.push('');
    lines.push('Produtos Mais Vendidos');
    lines.push('Produto,Vendas');
    (stats.topProducts || []).forEach((row: any) => lines.push(`"${String(row.name || '').replace(/"/g, '""')}",${Number(row.sales || 0)}`));
    
    lines.push('');
    lines.push('Detalhamento de Vendas por Matriz');
    lines.push('Pedido,Cliente,Produto,Quantidade Vendida,Receita Total (R$)');
    (stats.soldProducts || []).forEach((row: any) => lines.push(`${row.order_id},"${String(row.customer_name || '').replace(/"/g, '""')}","${String(row.name || '').replace(/"/g, '""')}",${Number(row.quantity || 0)},${Number(row.total_revenue || 0).toFixed(2)}`));

    const csv = lines.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-digital-bordados-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trendClass = (value?: number) => ((value || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600');
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest animate-pulse">Compilando estatisticas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Relatorios
            <span className="text-xs font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest">Analise</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">Metricas de desempenho e conversao do seu e-commerce.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white p-1 rounded-2xl border border-slate-200 flex flex-wrap shadow-sm">
            {[
              { id: 'today', label: 'Hoje' },
              { id: 'yesterday', label: 'Ontem' },
              { id: '7d', label: '7 dias' },
              { id: '30d', label: '30 dias' },
              { id: 'current_month', label: 'Mes atual' },
              { id: 'last_month', label: 'Ultimo mes' },
              { id: 'current_year', label: 'Ano atual' },
              { id: 'custom', label: 'Personalizado' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setPeriod(item.id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${
                  period === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold" />
              <button onClick={fetchStats} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">Aplicar</button>
            </div>
          )}

          <button onClick={handleDownloadPDF} disabled={isExporting} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95 disabled:opacity-50">
            {isExporting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Gerando...' : 'Exportar PDF'}
          </button>
          <button onClick={handleDownloadExcel} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 active:scale-95">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6"><DollarSign className="w-6 h-6" /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita Bruta</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900">R$ {(stats?.revenue?.gross || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              <span className={`text-[10px] font-black ${trendClass(stats?.comparison?.gross)}`}>{(stats?.comparison?.gross || 0).toFixed(1)}%</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mb-6"><ShoppingBag className="w-6 h-6" /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pedidos no Periodo</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900">{stats?.orders?.total || 0}</h2>
              <span className={`text-[10px] font-black ${trendClass(stats?.comparison?.orders)}`}>{(stats?.comparison?.orders || 0).toFixed(1)}%</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white mb-6"><Users className="w-6 h-6" /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Medio</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900">R$ {(stats?.revenue?.average || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              <span className={`text-[10px] font-black ${trendClass(stats?.comparison?.average_ticket)}`}>{(stats?.comparison?.average_ticket || 0).toFixed(1)}%</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6"><FileText className="w-6 h-6" /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita Liquida</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-emerald-600">R$ {(stats?.revenue?.net || stats?.revenue?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              <span className={`text-[10px] font-black ${trendClass(stats?.comparison?.net)}`}>{(stats?.comparison?.net || 0).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Historico de Vendas</h3>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receita Bruta (R$)</span>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.salesChart || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 900 }} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Top Matrizes Vendidas</h3>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Qtd. Vendida</span>
            </div>
            <div className="h-80 w-full flex items-center justify-center">
              {stats?.topProducts && stats.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#1e293b' }} width={170} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 900 }} />
                    <Bar dataKey="sales" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center space-y-2"><ShoppingBag className="w-8 h-8 text-slate-200 mx-auto" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum dado de venda disponivel</p></div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 lg:col-span-1">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Metodos de Pagamento</h3>
            <div className="h-64 w-full flex items-center justify-center">
              {stats?.paymentMethods && stats.paymentMethods.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.paymentMethods} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {stats.paymentMethods.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sem dados</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              {stats?.paymentMethods?.map((item: any, index: number) => (
                <div key={item.name} className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div><span className="text-[10px] font-black text-slate-600 uppercase truncate">{item.name}</span></div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 lg:col-span-2">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Performance por Categoria</h3>
            <div className="space-y-6">
              {stats?.categoryUsage && stats.categoryUsage.length > 0 ? (
                stats.categoryUsage.map((cat: any) => (
                  <div key={cat.name} className="space-y-3">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{cat.name}</span><div className="flex items-center gap-2"><span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{cat.count} vendas</span><ChevronRight className="w-3 h-3 text-slate-300" /></div></div>
                    <div className="w-full h-2.5 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${(cat.count / (stats?.orders?.total || 1)) * 100}%` }}></div></div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 space-y-3"><Filter className="w-8 h-8 text-slate-200" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma categoria registrada com vendas</p></div>
              )}
            </div>
          </div>
        </div>

        {/* Detalhamento de Produtos Vendidos no Periodo */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Matrizes Vendidas no Periodo</h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">Lista completa de matrizes vendidas no periodo selecionado, ordenadas por quantidade e receita.</p>
            </div>
            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-3.5 py-1.5 rounded-full uppercase tracking-widest">
              {stats?.soldProducts?.length || 0} Matrizes
            </span>
          </div>

          {stats?.soldProducts && stats.soldProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Pedido</th>
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Foto</th>
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome da Matriz</th>
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Qtd.</th>
                    <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right pr-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.soldProducts.map((prod: any, idx: number) => (
                    <tr 
                      key={prod.id || idx}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-4 pl-2 font-black text-xs text-blue-600">
                        #{prod.order_id}
                      </td>
                      <td className="py-4 font-bold text-xs text-slate-600 truncate max-w-[150px]" title={prod.customer_name}>
                        {prod.customer_name}
                      </td>
                      <td className="py-4">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm">
                          {prod.image ? (
                            <img 
                              src={normalizePublicMediaUrl(prod.image)} 
                              alt={prod.name} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <ShoppingBag className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                      </td>
                      <td className="py-4 font-bold text-xs text-slate-800">
                        {prod.slug ? (
                          <a 
                            href={`/produto/${prod.slug}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors inline-block"
                          >
                            {prod.name}
                          </a>
                        ) : (
                          <span>{prod.name}</span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <span className="inline-block bg-blue-50 text-blue-600 text-[10px] font-black px-3 py-1 rounded-full">
                          {prod.quantity}x
                        </span>
                      </td>
                      <td className="py-4 text-right font-black text-xs text-emerald-600 pr-2">
                        R$ {(prod.total_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-200" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma venda registrada no periodo selecionado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
