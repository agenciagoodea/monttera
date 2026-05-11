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
} from 'lucide-react';

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
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState<UserFormState>(emptyForm);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
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

  const filteredUsers = useMemo(() => users.filter((user) => {
    const search = searchTerm.toLowerCase();
    const role = user.role === 'user' ? 'customer' : user.role;
    return (
      (user.name?.toLowerCase().includes(search) || user.email?.toLowerCase().includes(search))
      && (roleFilter === 'all' || role === roleFilter)
    );
  }), [users, searchTerm, roleFilter]);

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
          <p className="text-2xl font-black text-slate-800">{users.length}</p>
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
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <select
            className="bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest px-4 py-3 focus:ring-2 focus:ring-blue-500"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">Todos os cargos</option>
            <option value="admin">Administradores</option>
            <option value="customer">Clientes</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Cadastro</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedidos</th>
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
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-xs font-black text-slate-600">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {user.order_count || 0}
                    </div>
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
    </div>
  );
}
