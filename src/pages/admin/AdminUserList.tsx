import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  Search,
  UserPlus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ShoppingBag,
  Pencil,
  X,
  Save,
  Download,
} from 'lucide-react';
import { normalizePublicMediaUrl } from '../../lib/utils';
interface UserType {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  order_count?: number;
  total_spent?: number;
  phone?: string | null;
  cpf?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  date_registered?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  auth_provider?: string | null;
}

type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'customer';
  status: string;
  phone: string;
  cpf: string;
  first_name: string;
  last_name: string;
  date_registered: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

const emptyForm: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'customer',
  status: 'ativo',
  phone: '',
  cpf: '',
  first_name: '',
  last_name: '',
  date_registered: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  country: 'Brasil',
};

export default function AdminUserList() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null);
  const [formData, setFormData] = useState<UserFormState>(emptyForm);

  // Estados de Ordenação
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Estados do Modal de Pedidos
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page, limit, searchTerm, roleFilter, sortBy, sortOrder]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: searchTerm,
        role: roleFilter,
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setUsers(Array.isArray(data?.data) ? data.data : []);
        setTotal(Number(data?.pagination?.total || 0));
        setTotalPages(Math.max(1, Number(data?.pagination?.totalPages || 1)));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(format);
    try {
      const params = new URLSearchParams({
        format,
        search: searchTerm,
        role: roleFilter,
      });
      const res = await fetch(`/api/admin/users/export?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao exportar');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = format === 'excel' ? `clientes_${date}.xls` : `clientes_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export users:', error);
      alert('Não foi possível exportar o relatório de clientes.');
    } finally {
      setExporting(null);
    }
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingUserId(null);
    setFormData({ ...emptyForm });
    setErrorMessage('');
    setShowModal(true);
  };

  const openEditModal = (user: UserType) => {
    setIsEditing(true);
    setEditingUserId(user.id);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role === 'admin' ? 'admin' : 'customer',
      status: user.status || 'ativo',
      phone: user.phone || '',
      cpf: user.cpf || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      date_registered: user.date_registered ? String(user.date_registered).slice(0, 10) : '',
      address: user.address || '',
      city: user.city || '',
      state: user.state || '',
      zip: user.zip || '',
      country: user.country || 'Brasil',
    });
    setErrorMessage('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
  };

  const handleSubmitUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

    if (!formData.name.trim() || !formData.email.trim()) {
      setErrorMessage('Nome e e-mail são obrigatórios.');
      return;
    }

    if (!isEditing && !formData.password.trim()) {
      setErrorMessage('Senha é obrigatória para novo usuário.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
      };

      const parseResponseBody = async (response: Response) => {
        const rawText = await response.text();
        if (!rawText) return null;
        try {
          return JSON.parse(rawText);
        } catch {
          return { raw: rawText };
        }
      };

      let response: Response;
      let responseData: any;

      if (isEditing && editingUserId) {
        const normalizedId = Math.trunc(Number(editingUserId));
        response = await fetch(`/api/admin/users/${normalizedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        responseData = await parseResponseBody(response);

        if (response.status === 404) {
          response = await fetch(`/api/admin/users/${normalizedId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          responseData = await parseResponseBody(response);
        }
      } else {
        response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        responseData = await parseResponseBody(response);
      }

      if (!response.ok) {
        if (response.status === 404 && isEditing) {
          setErrorMessage('Rota de edição não encontrada. Reinicie o servidor para carregar as novas rotas.');
          return;
        }
        setErrorMessage(responseData?.error || 'Falha ao salvar usuário.');
        return;
      }

      setShowModal(false);


      await fetchUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      setErrorMessage('Erro de conexão ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'customer' : 'admin';
    if (!confirm(`Deseja realmente alterar o cargo deste usuário para ${newRole}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Deseja realmente excluir este usuário? Todos os pedidos associados serão afetados.')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleOpenUserOrders = async (user: UserType) => {
    setSelectedUser(user);
    setShowOrdersModal(true);
    setLoadingOrders(true);
    setUserOrders([]);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/orders`);
      if (res.ok) {
        const data = await res.json();
        setUserOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch user orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const filteredUsers = useMemo(() => users, [users]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Gestão de Usuários</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            Controle de usuários e níveis de acesso
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Usuários</p>
          <p className="text-2xl font-black text-slate-800">{total}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Administradores</p>
          <p className="text-2xl font-black text-blue-600">{users.filter((u) => u.role === 'admin').length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Clientes</p>
          <p className="text-2xl font-black text-emerald-600">{users.filter((u) => (u.role === 'customer' || u.role === 'user')).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest px-4 py-3 focus:ring-2 focus:ring-blue-500"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos os cargos</option>
            <option value="admin">Administradores</option>
            <option value="customer">Clientes</option>
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting === 'csv' ? 'Exportando...' : 'CSV'}
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting === 'excel' ? 'Exportando...' : 'Excel'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cadastro via</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Cadastro</th>
                <th 
                  onClick={() => {
                    const nextOrder = sortBy === 'order_count' && sortOrder === 'desc' ? 'asc' : 'desc';
                    setSortBy('order_count');
                    setSortOrder(nextOrder);
                    setPage(1);
                  }}
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100/80 transition-colors select-none group/col"
                >
                  <div className="flex items-center gap-1">
                    Pedidos
                    <span className="text-[8px] font-black text-blue-500 transition-opacity">
                      {sortBy === 'order_count' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                    </span>
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Gasto</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8">
                      <div className="h-4 bg-slate-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
                        <User className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{user.name}</span>
                        <span className="text-[10px] font-bold text-slate-400 italic">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                      user.role === 'admin'
                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {user.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {user.role === 'admin' ? 'Administrador' : 'Cliente'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const provider = String(user.auth_provider || 'local').toLowerCase();
                      if (provider === 'google') return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-[9px] font-black text-red-600 uppercase tracking-widest">
                          <svg width="10" height="10" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                          Google
                        </span>
                      );
                      if (provider === 'facebook') return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[9px] font-black text-blue-600 uppercase tracking-widest">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                          Facebook
                        </span>
                      );
                      return <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Local</span>;
                    })()}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleOpenUserOrders(user)}
                      disabled={!user.order_count}
                      className={`flex items-center gap-1.5 text-xs font-black rounded-xl px-2.5 py-1.5 border transition-all active:scale-95 ${
                        user.order_count 
                          ? 'text-blue-600 border-blue-150 bg-blue-50/40 hover:bg-blue-600 hover:text-white hover:border-blue-600 cursor-pointer' 
                          : 'text-slate-400 border-slate-100 bg-slate-50 opacity-60 pointer-events-none'
                      }`}
                      title={user.order_count ? 'Visualizar histórico de compras' : 'Nenhum pedido realizado'}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {user.order_count || 0}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-slate-800">
                    R$ {(user.total_spent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        title="Editar usuário"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => toggleUserRole(user.id, user.role)}
                        className={`p-2 rounded-xl transition-all ${
                          user.role === 'admin'
                            ? 'text-amber-500 hover:bg-amber-50'
                            : 'text-blue-500 hover:bg-blue-50'
                        }`}
                        title={user.role === 'admin' ? 'Remover Admin' : 'Tornar Admin'}
                      >
                        {user.role === 'admin' ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Excluir usuário"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredUsers.length === 0 && (
            <div className="p-20 text-center">
              <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Nenhum usuário encontrado</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-slate-500">
          Exibindo {total > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} de {total} clientes
        </p>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
          >
            <option value={10}>10 / página</option>
            <option value={20}>20 / página</option>
            <option value={50}>50 / página</option>
            <option value={100}>100 / página</option>
          </select>
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                {isEditing ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black uppercase tracking-widest">
                  {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nome*</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">E-mail*</label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.email}
                    onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    {isEditing ? 'Senha (opcional)' : 'Senha*'}
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.password}
                    onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Cargo</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.role}
                    onChange={(event) => setFormData((prev) => ({ ...prev, role: event.target.value as 'admin' | 'customer' }))}
                  >
                    <option value="customer">Cliente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Status</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.status}
                    onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Data de Registro</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.date_registered}
                    onChange={(event) => setFormData((prev) => ({ ...prev, date_registered: event.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Primeiro Nome</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.first_name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Sobrenome</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.last_name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Telefone</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.phone}
                    onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">CPF</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.cpf}
                    onChange={(event) => setFormData((prev) => ({ ...prev, cpf: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Endereço</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.address}
                    onChange={(event) => setFormData((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Cidade</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.city}
                    onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Estado</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.state}
                    onChange={(event) => setFormData((prev) => ({ ...prev, state: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">CEP</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.zip}
                    onChange={(event) => setFormData((prev) => ({ ...prev, zip: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">País</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                    value={formData.country}
                    onChange={(event) => setFormData((prev) => ({ ...prev, country: event.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : isEditing ? 'Salvar Edição' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Pedidos */}
      {showOrdersModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  Histórico de Pedidos
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  Cliente: {selectedUser?.name || 'Cliente'} ({selectedUser?.email})
                </p>
              </div>
              <button 
                onClick={() => setShowOrdersModal(false)} 
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
              {loadingOrders ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-white p-6 rounded-3xl border border-slate-200 space-y-3">
                      <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                      <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                      <div className="h-10 bg-slate-100 rounded w-full mt-2"></div>
                    </div>
                  ))}
                </div>
              ) : userOrders.length === 0 ? (
                <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center">
                  <ShoppingBag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Este cliente não possui nenhum pedido cadastrado.</p>
                </div>
              ) : (
                userOrders.map((order) => {
                  const getStatusClass = (status: string) => {
                    const s = String(status).toLowerCase();
                    if (['paid', 'completed', 'success', 'pago', 'wc-completed', 'wc-processing', 'processing'].includes(s)) {
                      return 'bg-emerald-50 text-emerald-600 border-emerald-100';
                    }
                    if (['pending', 'pendente', 'aguardando'].includes(s)) {
                      return 'bg-amber-50 text-amber-600 border-amber-100';
                    }
                    return 'bg-rose-50 text-rose-600 border-rose-100';
                  };

                  const getStatusLabel = (status: string) => {
                    const s = String(status).toLowerCase();
                    if (['paid', 'completed', 'success', 'pago', 'wc-completed'].includes(s)) return 'Pago';
                    if (['pending', 'pendente'].includes(s)) return 'Pendente';
                    if (['processing', 'processing', 'wc-processing'].includes(s)) return 'Processando';
                    if (['failed', 'cancelado', 'rejeitado', 'failed', 'wc-cancelled', 'wc-failed'].includes(s)) return 'Cancelado';
                    return status;
                  };

                  return (
                    <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:border-blue-100 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">Pedido #{order.id}</span>
                          <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${getStatusClass(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span>Data: {new Date(order.created_at).toLocaleDateString('pt-BR')} {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {order.payment_method && (
                            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 ml-2">
                              Método: {String(order.payment_method).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Itens Comprados */}
                      <div className="space-y-2.5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Itens Adquiridos:</h4>
                        <div className="divide-y divide-slate-50 bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                          {order.items && order.items.length > 0 ? (
                            order.items.map((item: any, idx: number) => (
                              <div key={idx} className="p-3.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/30 transition-colors">
                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                  {/* Imagem do Produto */}
                                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                    {item.product_image ? (
                                      <img 
                                        src={normalizePublicMediaUrl(item.product_image)} 
                                        alt={item.product_name || ''} 
                                        className="w-full h-full object-cover" 
                                      />
                                    ) : (
                                      <ShoppingBag className="w-5 h-5 text-slate-300" />
                                    )}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-slate-800 uppercase font-black truncate">{item.product_name || 'Produto sem nome'}</span>
                                    {item.product_slug && <span className="text-[9px] text-slate-400 font-bold">Slug: {item.product_slug}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-6 flex-shrink-0">
                                  <span className="text-slate-400 font-medium">Qtd: {item.quantity || 1}</span>
                                  <span className="text-slate-800 font-black">
                                    R$ {Number(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-slate-400 text-xs italic font-medium">Nenhum detalhe de produto disponível</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-slate-800">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total do Pedido</span>
                        <span className="text-sm font-black text-blue-600">
                          R$ {Number(order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/20">
              <button
                onClick={() => setShowOrdersModal(false)}
                className="px-6 py-3 rounded-2xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
