import React, { useEffect, useState, useMemo } from 'react';
import { 
  Folder, 
  File, 
  Upload, 
  Plus, 
  Trash2, 
  Edit3, 
  Archive, 
  ChevronRight, 
  LayoutGrid, 
  List, 
  Image as ImageIcon, 
  Loader2, 
  HardDrive, 
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { getPublicAssetUrl } from '../../lib/utils';

interface DiskSpace {
  total: number;
  free: number;
  used: number;
}

interface FileItem {
  name: string;
  isDir: boolean;
  size: number;
  updatedAt: string;
  relative: string;
}

interface FilesResponse {
  currentPath: string;
  items: FileItem[];
  disk: DiskSpace;
}

export default function AdminFiles() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'thumbs'>('thumbs');
  
  // Modais e inputs
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isMkdirOpen, setIsMkdirOpen] = useState<boolean>(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [renameNewName, setRenameNewName] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [unzipTarget, setUnzipTarget] = useState<FileItem | null>(null);
  
  // Status de operações
  const [operationLoading, setOperationLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Upload
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  const DANGEROUS_EXTENSIONS = ['.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps', '.js', '.jsx', '.ts', '.tsx', '.sh', '.bat', '.cmd', '.exe', '.json', '.htaccess', '.config'];

  const isDangerousFile = (fileName: string): boolean => {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    return DANGEROUS_EXTENSIONS.includes(ext);
  };

  const fetchFiles = async (pathStr: string = '') => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/files?path=${encodeURIComponent(pathStr)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar arquivos');
      
      setCurrentPath(data.currentPath || '');
      setItems(data.items || []);
      setDisk(data.disk || null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Falha ao buscar arquivos do site.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles('');
  }, []);

  const handleNavigate = (pathName: string) => {
    fetchFiles(pathName);
  };

  const handleBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    fetchFiles(parts.join('/'));
  };

  // Criar pasta
  const handleMkdir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || operationLoading) return;
    
    if (isDangerousFile(newFolderName)) {
      setMessage({ type: 'error', text: 'Nome de pasta contém extensão ou padrão proibido por segurança.' });
      return;
    }

    setOperationLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: newFolderName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar diretório');

      setMessage({ type: 'success', text: `Pasta "${newFolderName}" criada com sucesso!` });
      setNewFolderName('');
      setIsMkdirOpen(false);
      fetchFiles(currentPath);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao criar pasta.' });
    } finally {
      setOperationLoading(false);
    }
  };

  // Renomear
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameNewName.trim() || operationLoading) return;

    if (isDangerousFile(renameNewName)) {
      setMessage({ type: 'error', text: 'O novo nome possui uma extensão perigosa bloqueada por segurança.' });
      return;
    }

    setOperationLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, oldName: renameTarget.name, newName: renameNewName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao renomear');

      setMessage({ type: 'success', text: 'Item renomeado com sucesso!' });
      setRenameTarget(null);
      setRenameNewName('');
      fetchFiles(currentPath);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao renomear.' });
    } finally {
      setOperationLoading(false);
    }
  };

  // Excluir
  const handleDelete = async () => {
    if (!deleteTarget || operationLoading) return;

    setOperationLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: deleteTarget.name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir');

      setMessage({ type: 'success', text: `Item "${deleteTarget.name}" removido com sucesso!` });
      setDeleteTarget(null);
      fetchFiles(currentPath);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao excluir.' });
    } finally {
      setOperationLoading(false);
    }
  };

  // Descompactar ZIP
  const handleUnzip = async () => {
    if (!unzipTarget || operationLoading) return;

    setOperationLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/files/unzip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: unzipTarget.name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao extrair');

      setMessage({ type: 'success', text: `ZIP "${unzipTarget.name}" extraído com sucesso!` });
      setUnzipTarget(null);
      fetchFiles(currentPath);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao descompactar.' });
    } finally {
      setOperationLoading(false);
    }
  };

  // Upload de arquivos
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0 || operationLoading) return;

        // Validar extensões executáveis antes de enviar
    const filesArray = Array.from(uploadFiles || []) as File[];
    const dangerousList = filesArray.filter(file => isDangerousFile(file.name));
    if (dangerousList.length > 0) {
      setMessage({
        type: 'error',
        text: `Upload bloqueado: O arquivo "${dangerousList[0].name}" possui extensão proibida.`
      });
      return;
    }

    setOperationLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('path', currentPath);
      filesArray.forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch('/api/admin/files/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao efetuar upload');

      let text = 'Upload concluído com sucesso!';
      if (data.skipped && data.skipped.length > 0) {
        text += ` (Ignorados por segurança: ${data.skipped.join(', ')})`;
      }
      setMessage({ type: 'success', text });
      setUploadFiles(null);
      setIsUploadOpen(false);
      fetchFiles(currentPath);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao fazer upload.' });
    } finally {
      setOperationLoading(false);
    }
  };

  // Filtro de pesquisa
  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  // Formatar tamanho de arquivo
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Gráfico de disco circular
  const diskPercentage = useMemo(() => {
    if (!disk || disk.total === 0) return 0;
    return Math.round((disk.used / disk.total) * 100);
  }, [disk]);

  // Determinar se é imagem
  const isImageFile = (fileName: string): boolean => {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext);
  };

  // Obter URL pública do arquivo
  const getFileUrl = (item: FileItem) => {
    // Se o caminho relativo começa com "uploads" ou similar, já é servido publicamente sob /uploads
    // O ROOT_DIR é a pasta "public". Então se o item está em "public/uploads/imagem.jpg",
    // o caminho relativo retornado é "uploads/imagem.jpg", e o acesso público é via "/uploads/imagem.jpg"
    return `/${item.relative}`;
  };

  return (
    <div className="space-y-8 max-w-[1440px] mx-auto px-4 md:px-0">
      
      {/* Cabeçalho do módulo */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Arquivos do Site</h1>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mt-1">
            Gerenciador seguro de pastas, imagens de galeria, uploads e mídias públicas do e-commerce.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsUploadOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 flex items-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Upload className="w-4.5 h-4.5" />
            Fazer Upload
          </button>
          <button
            onClick={() => setIsMkdirOpen(true)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 flex items-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="w-4.5 h-4.5" />
            Nova Pasta
          </button>
        </div>
      </header>

      {/* Gráfico circular premium de uso de espaço de disco */}
      {disk && (
        <section className="bg-white rounded-[2.25rem] border border-slate-100 p-6 md:p-8 shadow-sm grid grid-cols-1 md:grid-cols-[160px_1fr] items-center gap-8">
          <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
            {/* SVG Círculo de Progresso */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="62"
                className="stroke-slate-100 fill-none"
                strokeWidth="12"
              />
              <circle
                cx="72"
                cy="72"
                r="62"
                className="fill-none transition-all duration-1000 ease-out"
                stroke={diskPercentage > 85 ? '#ef4444' : diskPercentage > 65 ? '#f59e0b' : '#3b82f6'}
                strokeWidth="12"
                strokeDasharray={2 * Math.PI * 62}
                strokeDashoffset={2 * Math.PI * 62 * (1 - diskPercentage / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-slate-800">{diskPercentage}%</span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Usado</span>
            </div>
          </div>
          <div className="space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-slate-700">
              <HardDrive className="w-6 h-6 text-blue-600" />
              <h3 className="text-sm font-black uppercase tracking-wider">Uso do Disco Rígido do Servidor</h3>
            </div>
            <p className="text-slate-500 text-xs font-semibold max-w-xl">
              Armazenamento total do volume em que o e-commerce está alocado. O monitoramento previne estouro de cota e interrupções em compras ou uploads de novas matrizes.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto md:mx-0">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                <span className="block text-sm font-black text-slate-700 mt-0.5">{formatBytes(disk.total)}</span>
              </div>
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-center">
                <span className="block text-[9px] font-black text-blue-400 uppercase tracking-widest">Livre</span>
                <span className="block text-sm font-black text-blue-600 mt-0.5">{formatBytes(disk.free)}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Usado</span>
                <span className="block text-sm font-black text-slate-700 mt-0.5">{formatBytes(disk.used)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Alerta de Operações */}
      {message && (
        <div
          className={`rounded-2xl border p-4 text-xs font-black uppercase tracking-wider flex items-center gap-3 ${
            message.type === 'success' 
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800' 
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <div>{message.text}</div>
        </div>
      )}

      {/* Área do Navegador de Arquivos */}
      <section className="bg-white rounded-[2.25rem] border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Barra de controle superior */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
          
          {/* Breadcrumbs de Navegação */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <button
              onClick={() => handleNavigate('')}
              className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors"
            >
              public
            </button>
            {currentPath.split('/').filter(Boolean).map((part, idx, arr) => {
              const fullSubPath = arr.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={fullSubPath}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <button
                    onClick={() => handleNavigate(fullSubPath)}
                    className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors truncate max-w-[120px]"
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Filtro e Seletor de Modo de Exibição */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-initial">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar arquivos..."
                className="w-full md:w-64 pl-10 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500 bg-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 transition-all ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                title="Visualização em Lista"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                title="Visualização em Grid"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('thumbs')}
                className={`p-2 transition-all ${viewMode === 'thumbs' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                title="Miniaturas (Imagens)"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Corpo de arquivos */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <span className="text-xs font-black uppercase tracking-widest">Carregando mídias...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center space-y-4">
              <Folder className="w-16 h-16 text-slate-200" />
              <div>
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight">Diretório Vazio</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Não encontramos arquivos {searchQuery ? 'correspondentes ao seu filtro' : 'nesta pasta no momento'}.
                </p>
              </div>
              {currentPath && (
                <button
                  onClick={handleBack}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border border-slate-200 inline-flex items-center gap-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar Pasta
                </button>
              )}
            </div>
          ) : (
            <>
              {currentPath && (
                <div className="mb-4">
                  <button
                    onClick={handleBack}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider border border-slate-100 inline-flex items-center gap-2 transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    [Voltar para pasta anterior]
                  </button>
                </div>
              )}

              {/* LIST MODE */}
              {viewMode === 'list' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/50">
                        <th className="py-3 px-4">Nome</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4">Tamanho</th>
                        <th className="py-3 px-4">Modificação</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredItems.map((item) => (
                        <tr key={item.name} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="py-3.5 px-4 font-bold text-slate-800">
                            {item.isDir ? (
                              <button
                                onClick={() => handleNavigate(item.relative)}
                                className="flex items-center gap-2.5 text-blue-600 hover:underline font-black text-left"
                              >
                                <Folder className="w-4 h-4 text-amber-500 fill-amber-100 shrink-0" />
                                <span className="truncate max-w-[280px]">{item.name}</span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <File className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[280px]">{item.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-500 uppercase tracking-wide">
                            {item.isDir ? 'Pasta' : item.name.split('.').pop() || 'Arquivo'}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-500">
                            {item.isDir ? '-' : formatBytes(item.size)}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-400">
                            {new Date(item.updatedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              {!item.isDir && (
                                <a
                                  href={getFileUrl(item)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600"
                                  title="Baixar/Visualizar na Web"
                                >
                                  <File className="w-4 h-4" />
                                </a>
                              )}
                              {!item.isDir && item.name.toLowerCase().endsWith('.zip') && (
                                <button
                                  onClick={() => setUnzipTarget(item)}
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-emerald-600"
                                  title="Extrair arquivo ZIP"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setRenameTarget(item);
                                  setRenameNewName(item.name);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
                                title="Renomear"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-red-600"
                                title="Excluir permanentemente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* GRID MODE */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.name}
                      className="border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-white rounded-2xl p-4 flex flex-col items-center justify-between text-center transition-all group relative min-h-[160px] shadow-sm hover:shadow-md"
                    >
                      <div className="flex-1 flex flex-col items-center justify-center space-y-3 w-full">
                        {item.isDir ? (
                          <button
                            onClick={() => handleNavigate(item.relative)}
                            className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 fill-amber-50 group-hover:scale-110 transition-transform duration-300 shadow-md shadow-amber-500/5"
                          >
                            <Folder className="w-6 h-6 fill-amber-100" />
                          </button>
                        ) : (
                          <div className="w-12 h-12 bg-slate-200/50 rounded-2xl flex items-center justify-center text-slate-500 shadow-md shadow-slate-200/5">
                            <File className="w-6 h-6" />
                          </div>
                        )}
                        <span className="block text-xs font-bold text-slate-800 uppercase tracking-tight truncate max-w-full px-2" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      
                      <div className="mt-3 w-full">
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          {item.isDir ? 'Diretório' : formatBytes(item.size)}
                        </span>
                      </div>

                      {/* Ações Hover */}
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 shadow-lg border border-slate-100 rounded-lg p-0.5 z-20">
                        {!item.isDir && (
                          <a
                            href={getFileUrl(item)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-slate-50 rounded text-blue-600"
                            title="Visualizar"
                          >
                            <File className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {!item.isDir && item.name.toLowerCase().endsWith('.zip') && (
                          <button
                            onClick={() => setUnzipTarget(item)}
                            className="p-1 hover:bg-slate-50 rounded text-emerald-600"
                            title="Extrair"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setRenameTarget(item);
                            setRenameNewName(item.name);
                          }}
                          className="p-1 hover:bg-slate-50 rounded text-slate-600"
                          title="Renomear"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1 hover:bg-slate-50 rounded text-red-600"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* THUMBNAILS MODE */}
              {viewMode === 'thumbs' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredItems.map((item) => {
                    const isImg = isImageFile(item.name);
                    const fileUrl = isImg ? getFileUrl(item) : '';
                    return (
                      <div
                        key={item.name}
                        className="border border-slate-100 hover:border-blue-200 bg-white rounded-2xl overflow-hidden flex flex-col justify-between transition-all group relative shadow-sm hover:shadow-md min-h-[190px]"
                      >
                        {/* Preview Area */}
                        <div className="aspect-square bg-slate-50 relative flex items-center justify-center border-b border-slate-100 overflow-hidden">
                          {item.isDir ? (
                            <button
                              onClick={() => handleNavigate(item.relative)}
                              className="text-amber-500 fill-amber-50 hover:scale-110 transition-transform duration-300 flex flex-col items-center gap-1"
                            >
                              <Folder className="w-10 h-10 fill-amber-100" />
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Abrir</span>
                            </button>
                          ) : isImg ? (
                            <img
                              src={fileUrl}
                              alt={item.name}
                              loading="lazy"
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : item.name.toLowerCase().endsWith('.zip') ? (
                            <Archive className="w-10 h-10 text-emerald-500 fill-emerald-50" />
                          ) : (
                            <File className="w-10 h-10 text-slate-400" />
                          )}
                        </div>

                        {/* Info Area */}
                        <div className="p-3 bg-white space-y-1">
                          <span className="block text-xs font-bold text-slate-800 uppercase tracking-tight truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                            {item.isDir ? 'Diretório' : formatBytes(item.size)}
                          </span>
                        </div>

                        {/* Ações Hover */}
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 shadow-lg border border-slate-100 rounded-lg p-0.5 z-20">
                          {!item.isDir && (
                            <a
                              href={getFileUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-slate-50 rounded text-blue-600"
                              title="Visualizar"
                            >
                              <File className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {!item.isDir && item.name.toLowerCase().endsWith('.zip') && (
                            <button
                              onClick={() => setUnzipTarget(item)}
                              className="p-1 hover:bg-slate-50 rounded text-emerald-600"
                              title="Extrair"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setRenameTarget(item);
                              setRenameNewName(item.name);
                            }}
                            className="p-1 hover:bg-slate-50 rounded text-slate-600"
                            title="Renomear"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="p-1 hover:bg-slate-50 rounded text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* MODAL: CRIAR PASTA */}
      {isMkdirOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Criar Nova Pasta</h3>
              <p className="text-slate-400 text-xs font-semibold mt-1">Crie um diretório de mídia na pasta atual.</p>
            </div>
            <form onSubmit={handleMkdir} className="space-y-4">
              <input
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Exemplo: banners, matrizes-2026"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMkdirOpen(false);
                    setNewFolderName('');
                  }}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={operationLoading || !newFolderName.trim()}
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {operationLoading ? 'Criando...' : 'Criar Pasta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Upload de Mídias</h3>
              <p className="text-slate-400 text-xs font-semibold mt-1">
                Selecione um ou mais arquivos. Extensões executáveis são proibidas por segurança.
              </p>
            </div>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-[1.75rem] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50/50">
                <Upload className="w-10 h-10 text-slate-400 mb-3" />
                <label className="w-full text-xs font-black text-blue-600 cursor-pointer hover:underline">
                  <span>Selecionar arquivos do computador</span>
                  <input
                    type="file"
                    multiple
                    required
                    onChange={(e) => setUploadFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
                                {uploadFiles && uploadFiles.length > 0 && (
                  <div className="mt-4 p-3 bg-white border border-slate-100 rounded-xl max-h-36 overflow-y-auto w-full text-left space-y-1">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Arquivos selecionados ({uploadFiles.length}):
                    </span>
                    {(Array.from(uploadFiles || []) as File[]).map((f) => (
                      <div key={f.name} className="flex justify-between items-center text-[10px] font-bold text-slate-700">
                        <span className="truncate max-w-[260px]">{f.name}</span>
                        <span className="text-slate-400">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadOpen(false);
                    setUploadFiles(null);
                  }}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={operationLoading || !uploadFiles || uploadFiles.length === 0}
                  className="px-5 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {operationLoading ? 'Enviando...' : 'Iniciar Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENOMEAR */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Renomear Item</h3>
              <p className="text-slate-400 text-xs font-semibold mt-1">Informe o novo nome do arquivo ou pasta.</p>
            </div>
            <form onSubmit={handleRename} className="space-y-4">
              <input
                type="text"
                required
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                placeholder="Novo nome"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenameTarget(null);
                    setRenameNewName('');
                  }}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={operationLoading || !renameNewName.trim() || renameNewName === renameTarget.name}
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {operationLoading ? 'Salvando...' : 'Renomear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex flex-col items-center justify-center text-center space-y-3 text-red-500">
              <AlertTriangle className="w-12 h-12 shrink-0 animate-bounce" />
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Excluir Permanentemente?</h3>
              <p className="text-slate-500 text-xs font-semibold max-w-xs leading-relaxed">
                Você está prestes a excluir permanentemente o item <strong className="text-red-600">"{deleteTarget.name}"</strong>. Esta operação não poderá ser desfeita!
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={operationLoading}
                className="px-5 py-3 rounded-xl bg-red-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-red-700 disabled:opacity-50"
              >
                {operationLoading ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXTRAÇÃO ZIP */}
      {unzipTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex flex-col items-center justify-center text-center space-y-3 text-emerald-600">
              <Archive className="w-12 h-12 shrink-0 animate-pulse fill-emerald-50" />
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Extrair Arquivo ZIP?</h3>
              <p className="text-slate-500 text-xs font-semibold max-w-xs leading-relaxed">
                O arquivo <strong className="text-emerald-600">"{unzipTarget.name}"</strong> será descompactado de forma segura na pasta atual. Quaisquer arquivos com nomes duplicados serão substituídos.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnzipTarget(null)}
                className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleUnzip}
                disabled={operationLoading}
                className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {operationLoading ? 'Extraindo...' : 'Confirmar Extração'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
