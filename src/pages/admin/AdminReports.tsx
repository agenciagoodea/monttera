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
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  Calendar,
  Download,
  Filter,
  RefreshCcw,
  FileText,
  ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ReportStats {
  revenue: { total: number; average: number };
  orders: { total: number };
  salesChart: any[];
  topProducts: any[];
  paymentMethods: any[];
  categoryUsage: any[];
}

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [period, setPeriod] = useState('30d');
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?period=${period}`);
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
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Add a header to the PDF
      pdf.setFontSize(18);
      pdf.setTextColor(30, 41, 59);
      pdf.text('RELATÓRIO DE DESEMPENHO - DIGITAL BORDADOS', 15, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139);
      const dateStr = new Date().toLocaleDateString('pt-BR');
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      pdf.text(`Gerado em: ${dateStr} às ${timeStr} | Período: ${period.toUpperCase()}`, 15, 28);
      
      pdf.addImage(imgData, 'PNG', 10, 35, pdfWidth - 20, pdfHeight - 20);
      pdf.save(`relatorio-digital-bordados-${period}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('PDF Export error:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest animate-pulse">Compilando estatísticas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Relatórios
            <span className="text-xs font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest">Análise</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Métricas de desempenho e conversão do seu e-commerce.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-2xl border border-slate-200 flex shadow-sm">
            {[
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: '12m', label: '1A' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setPeriod(item.id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${
                  period === item.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button 
            onClick={handleDownloadPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95 disabled:opacity-50"
          >
            {isExporting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Gerando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 relative overflow-hidden group">
            <div className="relative">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-600/30">
                <DollarSign className="w-6 h-6" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita no Período</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-black text-slate-900">R$ {(stats?.revenue?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 relative overflow-hidden group">
            <div className="relative">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-500/30">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pedidos no Período</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-black text-slate-900">{(stats?.orders?.total || 0)}</h2>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 relative overflow-hidden group">
            <div className="relative">
              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-amber-500/30">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Médio</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-black text-slate-900">R$ {(stats?.revenue?.average || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 relative overflow-hidden group">
            <div className="relative">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-indigo-600/30">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status do Sistema</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-black text-emerald-500 uppercase tracking-tighter">Online</h2>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Sales Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Histórico de Vendas</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receita Bruta (R$)</span>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.salesChart || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      fontSize: '10px',
                      fontWeight: 900,
                      textTransform: 'uppercase'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3b82f6" 
                    strokeWidth={4} 
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Products */}
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
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fontWeight: 900, fill: '#1e293b', textTransform: 'uppercase' }}
                      width={150}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontSize: '10px',
                        fontWeight: 900
                      }}
                    />
                    <Bar 
                      dataKey="sales" 
                      fill="#3b82f6" 
                      radius={[0, 8, 8, 0]} 
                      barSize={12}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center space-y-2">
                  <ShoppingBag className="w-8 h-8 text-slate-200 mx-auto" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum dado de venda disponível</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Payment Methods */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 lg:col-span-1">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Métodos de Pagamento</h3>
            <div className="h-64 w-full flex items-center justify-center">
              {stats?.paymentMethods && stats.paymentMethods.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.paymentMethods}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
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
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-[10px] font-black text-slate-600 uppercase truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories Performance */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 lg:col-span-2">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Performance por Categoria</h3>
            <div className="space-y-6">
              {stats?.categoryUsage && stats.categoryUsage.length > 0 ? (
                stats.categoryUsage.map((cat: any, i: number) => (
                  <div key={cat.name} className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{cat.count} vendas</span>
                        <ChevronRight className="w-3 h-3 text-slate-300" />
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                        style={{ width: `${(cat.count / (stats?.orders?.total || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <Filter className="w-8 h-8 text-slate-200" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma categoria registrada com vendas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

