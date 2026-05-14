import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Mail, 
  CreditCard, 
  Save, 
  Layout, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Link as LinkIcon,
  Check,
  Send,
  Wifi,
  FileText,
  Activity
} from 'lucide-react';
import AdminEmailTemplates from './AdminEmailTemplates';
import AdminEmailLogs from './AdminEmailLogs';

type MpConnectionInfo = {
  nickname: string;
  account_id: string;
  email: string;
  site_id: string;
};

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<MpConnectionInfo | null>(null);
  const [emailSubTab, setEmailSubTab] = useState<'smtp' | 'templates' | 'logs'>('smtp');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState<string | null>(null);
  const [testingPayPal, setTestingPayPal] = useState(false);
  const [paypalTestResult, setPaypalTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showPayPalSandboxSecret, setShowPayPalSandboxSecret] = useState(false);
  const [showPayPalProdSecret, setShowPayPalProdSecret] = useState(false);
  const [copiedPaypalWebhook, setCopiedPaypalWebhook] = useState(false);

  const [settings, setSettings] = useState({
    // Home/Info
    site_name: 'Digital Bordados',
    site_description: 'Excelência em Matrizes de Bordado',
    logo_url: '/logo.png',
    primary_color: '#3b82f6',
    secondary_color: '#1e293b',
    phone: '',
    email_contact: 'contato@digitalbordados.com',
    address: '',
    new_badge_days: '20',
    // Suporte ao Cliente
    support_whatsapp: '',
    support_email: '',

    // Mercado Pago
    mp_public_key: '',
    mp_access_token: '',
    mp_mode: 'sandbox',
    mp_application_id: '',
    mp_webhook_secret: '',
    mp_enable_pix: 'true',
    mp_enable_credit_card: 'true',
    mp_enable_debit_card: 'true',
    mp_enable_boleto: 'false',

    // PayPal
    paypal_enabled: 'false',
    paypal_mode: 'sandbox',
    paypal_sandbox_client_id: '',
    paypal_sandbox_client_secret: '',
    paypal_production_client_id: '',
    paypal_production_client_secret: '',
    paypal_default_currency: 'USD',
    paypal_brl_usd_rate: '5.20',
    paypal_webhook_id: '',

    // Email Config
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from_name: '',
    smtp_from_email: '',
    smtp_secure: 'false',
    matrix_request_team_email: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const toRgb = (hex: string) => {
      const normalized = String(hex || '').replace('#', '').trim();
      const raw = normalized.length === 3
        ? normalized.split('').map((ch) => ch + ch).join('')
        : normalized;
      if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
      const int = Number.parseInt(raw, 16);
      return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
    };

    if (settings.primary_color) {
      document.documentElement.style.setProperty('--brand-primary', settings.primary_color);
      const rgb = toRgb(settings.primary_color);
      if (rgb) document.documentElement.style.setProperty('--brand-primary-rgb', rgb);
    }
    if (settings.secondary_color) {
      document.documentElement.style.setProperty('--brand-secondary', settings.secondary_color);
      const rgb = toRgb(settings.secondary_color);
      if (rgb) document.documentElement.style.setProperty('--brand-secondary-rgb', rgb);
    }
  }, [settings.primary_color, settings.secondary_color]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data) {
        setSettings(prev => ({
          ...prev,
          ...data,
          mp_public_key: data.mp_public_key || data.mercadopago_public_key || prev.mp_public_key,
          mp_access_token: data.mp_access_token || data.mercadopago_access_token || prev.mp_access_token,
          mp_application_id: data.mp_application_id || data.mercadopago_application_id || prev.mp_application_id,
          mp_webhook_secret: data.mp_webhook_secret || data.mercadopago_webhook_secret || prev.mp_webhook_secret,
          mp_mode: data.mp_mode || data.modo_operacao || prev.mp_mode,
          mp_enable_pix: data.mp_enable_pix ?? prev.mp_enable_pix,
          mp_enable_credit_card: data.mp_enable_credit_card ?? prev.mp_enable_credit_card,
          mp_enable_debit_card: data.mp_enable_debit_card ?? prev.mp_enable_debit_card,
          mp_enable_boleto: data.mp_enable_boleto ?? prev.mp_enable_boleto,
          paypal_enabled: data.paypal_enabled ?? prev.paypal_enabled,
          paypal_mode: data.paypal_mode ?? prev.paypal_mode,
          paypal_sandbox_client_id: data.paypal_sandbox_client_id ?? prev.paypal_sandbox_client_id,
          paypal_sandbox_client_secret: data.paypal_sandbox_client_secret ?? prev.paypal_sandbox_client_secret,
          paypal_production_client_id: data.paypal_production_client_id ?? prev.paypal_production_client_id,
          paypal_production_client_secret: data.paypal_production_client_secret ?? prev.paypal_production_client_secret,
          paypal_brl_usd_rate: data.paypal_brl_usd_rate ?? prev.paypal_brl_usd_rate,
          paypal_webhook_id: data.paypal_webhook_id ?? prev.paypal_webhook_id,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          mercadopago_public_key: settings.mp_public_key,
          mercadopago_access_token: settings.mp_access_token,
          mercadopago_application_id: settings.mp_application_id,
          mercadopago_webhook_secret: settings.mp_webhook_secret,
          modo_operacao: settings.mp_mode,
        })
      });
      if (res.ok) {
        setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' });
      } else {
        setMessage({ text: 'Erro ao salvar configurações.', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Erro de conexão.', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const tabs = [
    { id: 'home', label: 'Aparência & Home', icon: Layout },
    { id: 'email', label: 'Configuração de E-mail', icon: Mail },
    { id: 'payment', label: 'Meios de Pagamento', icon: CreditCard },
  ];

  const webhookUrl = `${window.location.origin}/api/webhooks/mercadopago`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1500);
    } catch (error) {
      setMessage({ text: 'Não foi possível copiar a URL do webhook.', type: 'error' });
    }
  };

  const testMercadoPagoConnection = async () => {
    setTestingConnection(true);
    try {
      if (!settings.mp_access_token?.trim()) {
        setMessage({ text: 'Preencha o Access Token antes de testar.', type: 'error' });
        setConnectionInfo(null);
        return;
      }
      const res = await fetch('/api/admin/payments/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mp_mode: settings.mp_mode,
          mp_public_key: settings.mp_public_key,
          mp_access_token: settings.mp_access_token,
          mp_application_id: settings.mp_application_id,
          mp_webhook_secret: settings.mp_webhook_secret,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.connected) {
        setConnectionInfo(data.account || null);
        setMessage({ text: 'Conexão validada com sucesso.', type: 'success' });
      } else {
        setConnectionInfo(null);
        const details =
          typeof data?.details === 'string'
            ? data.details
            : Array.isArray(data?.details)
              ? JSON.stringify(data.details)
              : '';
        const messageText = details ? `${data?.error || 'Falha ao validar conexão do Mercado Pago.'} (${details})` : (data?.error || 'Falha ao validar conexão do Mercado Pago.');
        setMessage({ text: messageText, type: 'error' });
      }
    } catch (error) {
      setConnectionInfo(null);
      setMessage({ text: 'Erro ao testar conexão do Mercado Pago.', type: 'error' });
    } finally {
      setTestingConnection(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const testPayPalConnection = async () => {
    setTestingPayPal(true);
    setPaypalTestResult(null);
    try {
      const res = await fetch('/api/admin/paypal/test');
      const data = await res.json();
      setPaypalTestResult({ ok: data.ok, msg: data.message || data.error || 'Resultado desconhecido' });
    } catch {
      setPaypalTestResult({ ok: false, msg: 'Erro de rede ao testar PayPal' });
    } finally {
      setTestingPayPal(false);
    }
  };

  const copyPaypalWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/api/webhooks/paypal');
      setCopiedPaypalWebhook(true);
      setTimeout(() => setCopiedPaypalWebhook(false), 1500);
    } catch { /* noop */ }
  };

  const testSmtpConnection = async () => {
    setTestingSmtp(true);
    setSmtpStatus(null);
    try {
      const res = await fetch('/api/admin/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setSmtpStatus({ ok: data.ok, msg: data.ok ? 'Conexão estabelecida com sucesso!' : (data.error || 'Falha na conexão SMTP') });
    } catch {
      setSmtpStatus({ ok: false, msg: 'Erro de rede ao testar SMTP' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const sendSmtpTestEmail = async () => {
    if (!smtpTestEmail) return;
    setSmtpTestLoading(true);
    setSmtpTestMsg(null);
    try {
      const res = await fetch('/api/admin/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: smtpTestEmail, template_key: 'user_welcome' }),
      });
      const data = await res.json();
      setSmtpTestMsg(data.success ? 'E-mail enviado com sucesso!' : (data.error || 'Falha ao enviar'));
    } catch {
      setSmtpTestMsg('Erro de rede ao enviar e-mail');
    } finally {
      setSmtpTestLoading(false);
    }
  };

  if (loading) return <div className="p-10 animate-pulse text-slate-400 font-black uppercase tracking-widest text-xs">Carregando configurações...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Configurações do Sistema</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            Personalize a plataforma e integre serviços
          </p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50"
        >
          {saving ? 'Salvando...' : (
            <>
              <Save className="w-4 h-4" />
              Salvar Alterações
            </>
          )}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-[10px] font-black uppercase tracking-widest">{message.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 space-y-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-6 py-4 rounded-2xl transition-all border ${
                  activeTab === tab.id 
                    ? 'bg-white border-blue-600 text-blue-600 shadow-sm' 
                    : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Form Content */}
        <div className="flex-1">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-8 lg:p-10">
            <form onSubmit={handleSave} className="space-y-10">
              
              {/* Tab: Home/Aparência */}
              {activeTab === 'home' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Informações Institucionais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Site</label>
                        <input 
                          type="text" 
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.site_name}
                          onChange={e => setSettings({...settings, site_name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Contato</label>
                        <input 
                          type="email" 
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.email_contact}
                          onChange={e => setSettings({...settings, email_contact: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp de Suporte</label>
                        <input 
                          type="text" 
                          placeholder="+55 11 99999-9999"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-green-500 text-xs font-bold"
                          value={settings.support_whatsapp}
                          onChange={e => setSettings({...settings, support_whatsapp: e.target.value})}
                        />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Exibido na área "Minha Conta" do cliente.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Suporte</label>
                        <input 
                          type="email" 
                          placeholder="suporte@seusite.com"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.support_email}
                          onChange={e => setSettings({...settings, support_email: e.target.value})}
                        />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Exibido na área "Minha Conta" do cliente.</p>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descrição (SEO)</label>
                        <textarea 
                          rows={3}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.site_description}
                          onChange={e => setSettings({...settings, site_description: e.target.value})}
                        ></textarea>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dias para selo "Novo"</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.new_badge_days}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D/g, '');
                            setSettings({ ...settings, new_badge_days: onlyDigits || '20' });
                          }}
                        />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Produtos cadastrados nos ultimos X dias exibirao o badge "Novo".
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Identidade Visual</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Logotipo da Loja</label>
                        <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 transition-all hover:border-blue-200">
                          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm relative group">
                            {settings.logo_url ? (
                              <img src={settings.logo_url} alt="Logo Preview" className="max-w-[80%] max-h-[80%] object-contain" />
                            ) : (
                              <ImageIcon className="w-8 h-8 text-slate-300" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                               <ImageIcon className="w-6 h-6 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">Formatos: PNG, JPG ou SVG.<br/>Recomendado: 400x120px</p>
                            <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all active:scale-95">
                              <ImageIcon className="w-4 h-4" />
                              Fazer Upload
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;

                                  try {
                                    const formData = new FormData();
                                    formData.append('logo', file);

                                    const res = await fetch('/api/admin/upload-logo', {
                                      method: 'POST',
                                      body: formData,
                                    });

                                    const data = await res.json().catch(() => ({}));
                                    if (!res.ok) {
                                      setMessage({ text: data?.error || 'Erro ao subir logo.', type: 'error' });
                                      return;
                                    }

                                    if (data.url) {
                                      setSettings({ ...settings, logo_url: data.url });
                                      setMessage({ text: 'Logo carregada! Salve para aplicar.', type: 'success' });
                                    }
                                  } catch (err) {
                                    setMessage({ text: 'Erro ao subir logo.', type: 'error' });
                                  } finally {
                                    e.currentTarget.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cor Primária</label>
                          <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center gap-4">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm ring-2 ring-white">
                              <input 
                                type="color" 
                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 border-none cursor-pointer p-0"
                                value={settings.primary_color}
                                onChange={e => setSettings({...settings, primary_color: e.target.value})}
                              />
                            </div>
                            <div className="flex-1">
                              <input 
                                type="text" 
                                className="w-full bg-transparent border-none focus:ring-0 text-xs font-black uppercase tracking-widest text-slate-700"
                                value={settings.primary_color}
                                onChange={e => setSettings({...settings, primary_color: e.target.value})}
                              />
                              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Cor principal e botões</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cor Secundária</label>
                          <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center gap-4">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-sm ring-2 ring-white">
                              <input 
                                type="color" 
                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 border-none cursor-pointer p-0"
                                value={settings.secondary_color}
                                onChange={e => setSettings({...settings, secondary_color: e.target.value})}
                              />
                            </div>
                            <div className="flex-1">
                              <input 
                                type="text" 
                                className="w-full bg-transparent border-none focus:ring-0 text-xs font-black uppercase tracking-widest text-slate-700"
                                value={settings.secondary_color}
                                onChange={e => setSettings({...settings, secondary_color: e.target.value})}
                              />
                              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Cor de contraste</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Email */}
              {activeTab === 'email' && (
                <div className="space-y-6">
                  {/* Sub-tabs */}
                  <div className="flex gap-2 border-b border-slate-100 pb-4">
                    {[
                      { id: 'smtp', label: 'Configurações SMTP', icon: Wifi },
                      { id: 'templates', label: 'Templates', icon: FileText },
                      { id: 'logs', label: 'Logs de Envio', icon: Activity },
                    ].map(st => {
                      const Icon = st.icon;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setEmailSubTab(st.id as any)}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            emailSubTab === st.id
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {st.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-tab Content */}
                  {emailSubTab === 'smtp' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Host SMTP</label>
                          <input 
                            type="text" 
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.smtp_host}
                            onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                            placeholder="smtp.exemplo.com"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Porta</label>
                            <input 
                              type="text" 
                              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                              value={settings.smtp_port}
                              onChange={e => setSettings({...settings, smtp_port: e.target.value})}
                              placeholder="587"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Segurança</label>
                            <select 
                              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                              value={settings.smtp_secure}
                              onChange={e => setSettings({...settings, smtp_secure: e.target.value})}
                            >
                              <option value="false">STARTTLS (Porta 587)</option>
                              <option value="true">SSL/TLS (Porta 465)</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Usuário / E-mail</label>
                          <input 
                            type="text" 
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.smtp_user}
                            onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha</label>
                          <input 
                            type="password" 
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.smtp_pass}
                            onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Remetente</label>
                          <input 
                            type="text" 
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.smtp_from_name}
                            onChange={e => setSettings({...settings, smtp_from_name: e.target.value})}
                            placeholder="Suporte Digital Bordados"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail do Remetente</label>
                          <input 
                            type="email" 
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.smtp_from_email}
                            onChange={e => setSettings({...settings, smtp_from_email: e.target.value})}
                            placeholder="nao-responda@seusite.com"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail da Equipe (Solicitacao de Matriz)</label>
                          <input
                            type="email"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.matrix_request_team_email}
                            onChange={e => setSettings({ ...settings, matrix_request_team_email: e.target.value })}
                            placeholder="equipe@seusite.com"
                          />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                            Este e-mail recebe os novos pedidos de matriz personalizada.
                          </p>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-50 flex flex-wrap items-center gap-6">
                        <button
                          type="button"
                          onClick={testSmtpConnection}
                          disabled={testingSmtp}
                          className="px-6 py-3 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50"
                        >
                          {testingSmtp ? 'Testando...' : 'Testar Conexão'}
                        </button>

                        {smtpStatus && (
                          <div className={`flex items-center gap-2 text-xs font-bold ${smtpStatus.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {smtpStatus.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {smtpStatus.msg}
                          </div>
                        )}
                      </div>

                      <div className="bg-blue-50 rounded-3xl p-6 md:p-8 space-y-4">
                        <div className="flex items-center gap-3">
                          <Send className="w-5 h-5 text-blue-600" />
                          <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Enviar E-mail de Teste</h4>
                        </div>
                        <div className="flex gap-3">
                          <input 
                            type="email" 
                            placeholder="seu-email@exemplo.com"
                            className="flex-1 px-5 py-3.5 rounded-2xl bg-white border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold shadow-sm"
                            value={smtpTestEmail}
                            onChange={e => setSmtpTestEmail(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={sendSmtpTestEmail}
                            disabled={smtpTestLoading || !smtpTestEmail}
                            className="px-8 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                          >
                            {smtpTestLoading ? 'Enviando...' : 'Enviar'}
                          </button>
                        </div>
                        {smtpTestMsg && (
                          <p className={`text-[10px] font-black uppercase tracking-widest ${smtpTestMsg.includes('sucesso') ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {smtpTestMsg}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {emailSubTab === 'templates' && <AdminEmailTemplates />}
                  {emailSubTab === 'logs' && <AdminEmailLogs />}
                </div>
              )}

              {/* Tab: Payment */}
              {activeTab === 'payment' && (
                <div className="space-y-8">
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Ambiente</label>
                          <select
                            value={settings.mp_mode}
                            onChange={e => setSettings({ ...settings, mp_mode: e.target.value })}
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          >
                            <option value="production">Produção (Real)</option>
                            <option value="sandbox">Sandbox (Teste)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Application ID</label>
                          <input
                            type="text"
                            placeholder="Ex: 123456789"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.mp_application_id}
                            onChange={e => setSettings({ ...settings, mp_application_id: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Public Key</label>
                          <input
                            type="text"
                            placeholder="APP_USR-..."
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.mp_public_key}
                            onChange={e => setSettings({ ...settings, mp_public_key: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Access Token</label>
                          <div className="relative">
                            <input
                              type={showAccessToken ? 'text' : 'password'}
                              placeholder="APP_USR-..."
                              className="w-full px-5 py-3.5 pr-20 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                              value={settings.mp_access_token}
                              onChange={e => setSettings({ ...settings, mp_access_token: e.target.value })}
                            />
                            <button type="button" onClick={() => setShowAccessToken(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600 text-[10px] font-black uppercase tracking-widest">
                              {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Webhook Secret Key (Client Secret)</label>
                        <div className="relative">
                          <input
                            type={showWebhookSecret ? 'text' : 'password'}
                            placeholder="Opcional"
                            className="w-full px-5 py-3.5 pr-20 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.mp_webhook_secret}
                            onChange={e => setSettings({ ...settings, mp_webhook_secret: e.target.value })}
                          />
                          <button type="button" onClick={() => setShowWebhookSecret(prev => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600 text-[10px] font-black uppercase tracking-widest">
                            {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 items-center">
                        <button
                          type="button"
                          onClick={testMercadoPagoConnection}
                          disabled={testingConnection}
                          className="px-6 py-3 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50"
                        >
                          {testingConnection ? 'Testando...' : 'Testar Conexão'}
                        </button>
                        {connectionInfo && (
                          <div className="inline-flex items-center gap-2 text-emerald-600 text-xs font-black">
                            <CheckCircle2 className="w-4 h-4" />
                            Conectado com sucesso!
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={saving}
                          className="ml-auto px-6 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50"
                        >
                          Salvar Configuração
                        </button>
                      </div>

                      {connectionInfo && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Vendedor</p>
                            <p className="text-sm font-black text-emerald-900 mt-1">{connectionInfo.nickname || '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">ID da Conta</p>
                            <p className="text-sm font-black text-emerald-900 mt-1">{connectionInfo.account_id || '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">E-mail</p>
                            <p className="text-sm font-black text-emerald-900 mt-1 break-all">{connectionInfo.email || '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Site ID</p>
                            <p className="text-sm font-black text-emerald-900 mt-1">{connectionInfo.site_id || '-'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-4">
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight">Formas de Pagamento</h3>
                      <p className="text-xs text-slate-500 font-medium">Selecione quais métodos serão aceitos.</p>
                      {[
                        { key: 'mp_enable_pix', label: 'Pix' },
                        { key: 'mp_enable_credit_card', label: 'Cartão de Crédito' },
                        { key: 'mp_enable_debit_card', label: 'Cartão de Débito' },
                        { key: 'mp_enable_boleto', label: 'Boleto Bancário' },
                      ].map((method) => {
                        const enabled = settings[method.key as keyof typeof settings] === 'true';
                        return (
                          <button
                            key={method.key}
                            type="button"
                            onClick={() => setSettings({ ...settings, [method.key]: enabled ? 'false' : 'true' })}
                            className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${enabled ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                          >
                            <span className="text-base font-black">{method.label}</span>
                            <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${enabled ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'}`}>
                              {enabled && <Check className="w-4 h-4" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-5">
                      <h3 className="text-3xl font-black text-slate-800 tracking-tight">Webhook Receiver</h3>
                      <p className="text-xs text-slate-500 font-medium">Configure no painel do Mercado Pago.</p>
                      <div className="rounded-2xl bg-slate-900 text-emerald-400 p-4 flex items-center gap-3">
                        <LinkIcon className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold break-all flex-1">{webhookUrl}</span>
                        <button type="button" onClick={copyWebhookUrl} className="px-3 py-2 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest">
                          {copiedWebhook ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                        <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Instruções</p>
                        <ol className="text-xs text-amber-800 font-medium space-y-1 list-decimal pl-5">
                          <li>Acesse o Mercado Pago Developers.</li>
                          <li>Crie a aplicação e copie as credenciais.</li>
                          <li>Adicione a URL acima em Webhooks, ouvindo eventos de payment.</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  {/* ─── PayPal Section ─── */}
                  <div className="space-y-8 pt-6 border-t border-slate-100">
                    <div>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">PayPal Internacional</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Enable toggle */}
                        <div className="md:col-span-2">
                          <button
                            type="button"
                            onClick={() => setSettings({ ...settings, paypal_enabled: settings.paypal_enabled === 'true' ? 'false' : 'true' })}
                            className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                              settings.paypal_enabled === 'true' ? 'bg-[#0070ba]/10 border-[#0070ba]/30 text-[#0070ba]' : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}
                          >
                            <span className="text-base font-black">PayPal Internacional {settings.paypal_enabled === 'true' ? '✅ Ativo' : '⛔ Inativo'}</span>
                            <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                              settings.paypal_enabled === 'true' ? 'border-[#0070ba] bg-[#0070ba] text-white' : 'border-slate-300'
                            }`}>
                              {settings.paypal_enabled === 'true' && <Check className="w-4 h-4" />}
                            </span>
                          </button>
                        </div>

                        {/* Mode */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Ambiente</label>
                          <select
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.paypal_mode}
                            onChange={e => setSettings({ ...settings, paypal_mode: e.target.value })}
                          >
                            <option value="sandbox">Sandbox (Testes)</option>
                            <option value="production">Production (Real)</option>
                          </select>
                        </div>

                        {/* Currency + Rate */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Taxa BRL → USD</label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.paypal_brl_usd_rate}
                            onChange={e => setSettings({ ...settings, paypal_brl_usd_rate: e.target.value })}
                            placeholder="5.20"
                          />
                          <p className="text-[10px] font-bold text-slate-400 ml-1">Ex: 5.20 significa 1 USD = R$ 5,20</p>
                        </div>

                        {/* Sandbox credentials */}
                        <div className="md:col-span-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Credenciais Sandbox</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client ID Sandbox</label>
                              <input
                                type="text"
                                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                                value={settings.paypal_sandbox_client_id}
                                onChange={e => setSettings({ ...settings, paypal_sandbox_client_id: e.target.value })}
                                placeholder="AXxxxxxx"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Secret Sandbox</label>
                              <div className="relative">
                                <input
                                  type={showPayPalSandboxSecret ? 'text' : 'password'}
                                  className="w-full px-5 py-3.5 pr-12 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                                  value={settings.paypal_sandbox_client_secret}
                                  onChange={e => setSettings({ ...settings, paypal_sandbox_client_secret: e.target.value })}
                                  placeholder="EXxxxxxx"
                                />
                                <button type="button" onClick={() => setShowPayPalSandboxSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                  {showPayPalSandboxSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Production credentials */}
                        <div className="md:col-span-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Credenciais Production</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client ID Production</label>
                              <input
                                type="text"
                                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                                value={settings.paypal_production_client_id}
                                onChange={e => setSettings({ ...settings, paypal_production_client_id: e.target.value })}
                                placeholder="AXxxxxxx"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Secret Production</label>
                              <div className="relative">
                                <input
                                  type={showPayPalProdSecret ? 'text' : 'password'}
                                  className="w-full px-5 py-3.5 pr-12 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                                  value={settings.paypal_production_client_secret}
                                  onChange={e => setSettings({ ...settings, paypal_production_client_secret: e.target.value })}
                                  placeholder="EXxxxxxx"
                                />
                                <button type="button" onClick={() => setShowPayPalProdSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                  {showPayPalProdSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Webhook ID */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Webhook ID (opcional)</label>
                          <input
                            type="text"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.paypal_webhook_id}
                            onChange={e => setSettings({ ...settings, paypal_webhook_id: e.target.value })}
                            placeholder="WH-xxxxx"
                          />
                        </div>

                        {/* Webhook URL */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL do Webhook PayPal</label>
                          <div className="flex items-center gap-2 rounded-2xl bg-slate-900 text-emerald-400 px-4 py-3">
                            <span className="text-xs font-bold flex-1 break-all">{window.location.origin + '/api/webhooks/paypal'}</span>
                            <button type="button" onClick={copyPaypalWebhookUrl} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest shrink-0">
                              {copiedPaypalWebhook ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>

                        {/* Test button */}
                        <div className="md:col-span-2 flex flex-wrap items-center gap-4">
                          <button
                            type="button"
                            onClick={testPayPalConnection}
                            disabled={testingPayPal}
                            className="px-6 py-3 rounded-2xl bg-[#0070ba] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#005ea6] disabled:opacity-50"
                          >
                            {testingPayPal ? 'Testando...' : '🔗 Testar Credenciais PayPal'}
                          </button>
                          {paypalTestResult && (
                            <div className={`flex items-center gap-2 text-xs font-bold ${ paypalTestResult.ok ? 'text-emerald-600' : 'text-rose-600' }`}>
                              {paypalTestResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                              {paypalTestResult.msg}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              )}

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
