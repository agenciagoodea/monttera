import { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  Eye, 
  RefreshCw, 
  Calendar, 
  Laptop, 
  Smartphone, 
  FileText, 
  ArrowUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface SummaryData {
  totalVisits: number;
  uniqueVisitors: number;
  mostVisitedPage: {
    path: string;
    page_title: string | null;
    visits: number;
  } | null;
  devices: {
    desktop: number;
    mobile: number;
  };
  cards: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
}

interface PageVisit {
  path: string;
  page_title: string | null;
  visits: number;
  unique_visitors: number;
}

interface ChartPoint {
  name: string;
  visits: number;
  unique_visitors: number;
}

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<string>('week');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customActive, setCustomActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Ordenação da tabela
  const [sortField, setSortField] = useState<'visits' | 'path'>('visits');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Paginação da tabela
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Estados dos dados
  const [summary, setSummary] = useState<SummaryData>({
    totalVisits: 0,
    uniqueVisitors: 0,
    mostVisitedPage: null,
    devices: { desktop: 0, mobile: 0 },
    cards: { today: 0, week: 0, month: 0, year: 0 }
  });
  const [topPages, setTopPages] = useState<PageVisit[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  // Inicializar datas personalizadas
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  const fetchAllData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const queryParams = new URLSearchParams({
        period,
        ...(period === 'custom' && startDate ? { startDate } : {}),
        ...(period === 'custom' && endDate ? { endDate } : {}),
        orderBy: sortField,
        order: sortOrder
      });

      // Carregar Summary, Chart e Top Pages paralelamente
      const [summaryRes, chartRes, topPagesRes] = await Promise.all([
        fetch(`/api/admin/analytics/summary?${queryParams.toString()}`, { credentials: 'include' }),
        fetch(`/api/admin/analytics/visits-chart?${queryParams.toString()}`, { credentials: 'include' }),
        fetch(`/api/admin/analytics/top-pages?${queryParams.toString()}`, { credentials: 'include' })
      ]);

      const summaryPayload = await summaryRes.json();
      const chartPayload = await chartRes.json();
      const topPagesPayload = await topPagesRes.json();

      if (summaryRes.ok) setSummary(summaryPayload);
      if (chartRes.ok) setChartData(chartPayload);
      if (topPagesRes.ok) setTopPages(topPagesPayload);

    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Evita carregar dados caso o filtro seja 'custom' mas as datas não estejam preenchidas
    if (period === 'custom' && (!startDate || !endDate)) return;
    fetchAllData();
    setCurrentPage(1); // Resetar página
  }, [period, sortField, sortOrder]);

  const handleApplyCustomDates = () => {
    if (startDate && endDate) {
      fetchAllData();
      setCurrentPage(1);
    }
  };

  const handleToggleSort = (field: 'visits' | 'path') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC');
    } else {
      setSortField(field);
      setSortOrder('DESC');
    }
  };

  // Filtragem da tabela pelo termo de pesquisa
  const filteredPages = topPages.filter(page => {
    const pathMatch = page.path.toLowerCase().includes(searchTerm.toLowerCase());
    const titleMatch = page.page_title?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    return pathMatch || titleMatch;
  });

  // Paginação
  const totalPages = Math.ceil(filteredPages.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPagesToDisplay = filteredPages.slice(indexOfFirstItem, indexOfLastItem);

  // Percentual de desktop vs mobile
  const totalDevices = summary.devices.desktop + summary.devices.mobile || 1;
  const desktopPercentage = Math.round((summary.devices.desktop / totalDevices) * 100);
  const mobilePercentage = Math.round((summary.devices.mobile / totalDevices) * 100);

  // Formata o número com separador de milhares
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('pt-BR').format(num);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header com filtros de período */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600 animate-pulse" />
            Estatísticas do Site
          </h1>
          <p className="text-slate-500 font-medium">Monitore a audiência e os caminhos mais percorridos pelos seus clientes.</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-1.5 border-r border-slate-100 pr-3">
            <button
              onClick={() => { setPeriod('today'); setCustomActive(false); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'today' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => { setPeriod('yesterday'); setCustomActive(false); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'yesterday' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Ontem
            </button>
            <button
              onClick={() => { setPeriod('week'); setCustomActive(false); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'week' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => { setPeriod('month'); setCustomActive(false); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'month' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => { setPeriod('year'); setCustomActive(false); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'year' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Ano
            </button>
            <button
              onClick={() => { setPeriod('custom'); setCustomActive(true); }}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                period === 'custom' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Seção datas personalizadas */}
          {customActive && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left duration-300">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-blue-400"
              />
              <span className="text-[10px] font-bold text-slate-400 uppercase">até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={handleApplyCustomDates}
                className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-sm"
              >
                Aplicar
              </button>
            </div>
          )}

          {/* Botão atualizar */}
          <button
            onClick={() => fetchAllData(true)}
            disabled={loading || refreshing}
            className={`p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all ${
              refreshing ? 'animate-spin text-blue-600' : ''
            }`}
            title="Atualizar Estatísticas"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[500px] flex flex-col items-center justify-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando estatísticas...</p>
        </div>
      ) : (
        <>
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            
            {/* Card 1: Visitas Totais */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                <Eye className="w-36 h-36 text-slate-900" />
              </div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitas no Período</span>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Eye className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatNumber(summary.totalVisits)}</h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide mt-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                Páginas carregadas
              </p>
            </div>

            {/* Card 2: Visitantes Únicos */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                <Users className="w-36 h-36 text-slate-900" />
              </div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitantes Únicos</span>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{formatNumber(summary.uniqueVisitors)}</h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide mt-2">Identificados por cookie</p>
            </div>

            {/* Card 3: Dispositivos */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acessos por Dispositivo</span>
                  <div className="flex gap-1">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                      <Smartphone className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">
                  <span>{desktopPercentage}% Desk</span>
                  <span>{mobilePercentage}% Mobile</span>
                </div>
                {/* Barra de progresso */}
                <div className="w-full h-3 bg-violet-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all duration-505" style={{ width: `${desktopPercentage}%` }} />
                  <div className="h-full bg-violet-500 transition-all duration-55" style={{ width: `${mobilePercentage}%` }} />
                </div>
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide mt-4">
                Desk: {formatNumber(summary.devices.desktop)} | Mobile: {formatNumber(summary.devices.mobile)}
              </p>
            </div>

            {/* Card 4: Mais Visitada */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                <FileText className="w-36 h-36 text-slate-900" />
              </div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página Mais Popular</span>
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              {summary.mostVisitedPage ? (
                <>
                  <h4 className="text-sm font-black text-slate-800 truncate uppercase tracking-tight" title={summary.mostVisitedPage.page_title || summary.mostVisitedPage.path}>
                    {summary.mostVisitedPage.page_title || summary.mostVisitedPage.path}
                  </h4>
                  <p className="text-slate-400 text-[9px] font-bold truncate mt-1">Caminho: {summary.mostVisitedPage.path}</p>
                  <p className="text-slate-900 text-xs font-black uppercase tracking-widest mt-3 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl inline-block">
                    {formatNumber(summary.mostVisitedPage.visits)} Visitas
                  </p>
                </>
              ) : (
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] py-4">Sem dados no período</p>
              )}
            </div>
          </div>

          {/* Gráfico de Evolução de Acessos */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Curva de Acessos no Período</h3>
                <p className="text-slate-400 text-xs font-medium">Evolução temporal das páginas carregadas e visitantes únicos.</p>
              </div>
              {/* Legenda do gráfico */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 bg-blue-600 rounded-md"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitas Totais</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 bg-violet-500 rounded-md"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitantes Únicos</span>
                </div>
              </div>
            </div>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold" 
                    tickLine={false} 
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderRadius: '16px', 
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'black', textTransform: 'uppercase' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="visits" 
                    stroke="#2563eb" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorVisits)" 
                    name="Visitas"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="unique_visitors" 
                    stroke="#8b5cf6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorUnique)" 
                    name="Únicos"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Linha com Visitas Rápidas e Tabela de Páginas */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Bloco 1: Cartões Rápidos do Período */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Visitas Rápidas</h3>
                <p className="text-slate-400 text-xs font-medium mb-6">Comparativos acumulados de visitas em datas pré-definidas.</p>
                
                <div className="space-y-4">
                  
                  {/* Hoje */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:scale-[1.01] transition-transform">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitas Hoje</span>
                    <span className="text-sm font-black text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                      {formatNumber(summary.cards.today)}
                    </span>
                  </div>

                  {/* Semana */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:scale-[1.01] transition-transform">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitas na Semana</span>
                    <span className="text-sm font-black text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                      {formatNumber(summary.cards.week)}
                    </span>
                  </div>

                  {/* Mês */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:scale-[1.01] transition-transform">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitas no Mês</span>
                    <span className="text-sm font-black text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                      {formatNumber(summary.cards.month)}
                    </span>
                  </div>

                  {/* Ano */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:scale-[1.01] transition-transform">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visitas no Ano</span>
                    <span className="text-sm font-black text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                      {formatNumber(summary.cards.year)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Atualização do Servidor em Tempo Real</span>
              </div>
            </div>

            {/* Bloco 2: Tabela de Páginas Mais Acessadas */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm xl:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Páginas mais Acessadas</h3>
                    <p className="text-slate-400 text-xs font-medium">Rankings das rotas públicas com maior tráfego no período.</p>
                  </div>

                  {/* Busca interna */}
                  <div className="relative w-full md:w-64">
                    <input
                      type="text"
                      placeholder="Filtrar por página/título..."
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all placeholder:text-slate-400"
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>

                {/* Tabela */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                        <th className="px-4 py-4">
                          <button onClick={() => handleToggleSort('path')} className="flex items-center gap-1 hover:text-slate-600">
                            Página {sortField === 'path' && <ArrowUpDown className="w-3.5 h-3.5" />}
                          </button>
                        </th>
                        <th className="px-4 py-4 text-right">
                          <button onClick={() => handleToggleSort('visits')} className="flex items-center gap-1 ml-auto hover:text-slate-600">
                            Visitas {sortField === 'visits' && <ArrowUpDown className="w-3.5 h-3.5" />}
                          </button>
                        </th>
                        <th className="px-4 py-4 text-right">Visitantes Únicos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-[10px] font-bold text-slate-700">
                      {currentPagesToDisplay.length > 0 ? (
                        currentPagesToDisplay.map((page, index) => (
                          <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5 max-w-xs md:max-w-md truncate">
                              <div className="flex flex-col min-w-0">
                                <span className="text-slate-800 font-black uppercase tracking-tight text-[11px] truncate" title={page.page_title || 'Sem título'}>
                                  {page.page_title || 'Sem título'}
                                </span>
                                <a 
                                  href={page.path}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 font-bold hover:text-blue-600 truncate transition-colors text-[9px]"
                                >
                                  {page.path}
                                </a>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-slate-850 text-[11px]">
                              {formatNumber(page.visits)}
                            </td>
                            <td className="px-4 py-3.5 text-right text-slate-500">
                              {formatNumber(page.unique_visitors)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="text-center py-10 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                            Nenhuma página encontrada
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginação da tabela */}
              {totalPages > 1 && (
                <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Página {currentPage} de {totalPages}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all border border-slate-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    {[...Array(totalPages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-[9px] font-black transition-all ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      return null;
                    })}

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all border border-slate-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
