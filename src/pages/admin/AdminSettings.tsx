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
  Activity,
  Plus,
  Trash2,
  Pencil,
  X,
  ShieldCheck,
  Scale,
  Cookie,
  FileClock,
  Database,
  Users,
  FileCheck2,
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
  const [lgpdSubTab, setLgpdSubTab] = useState<'general' | 'consents' | 'policies' | 'cookies' | 'requests' | 'logs' | 'security' | 'export' | 'terms'>('general');
  const [lgpdPolicies, setLgpdPolicies] = useState<any[]>([]);
  const [lgpdConsents, setLgpdConsents] = useState<any[]>([]);
  const [lgpdRequests, setLgpdRequests] = useState<any[]>([]);
  const [lgpdLogs, setLgpdLogs] = useState<any[]>([]);
  const [loadingLgpdData, setLoadingLgpdData] = useState(false);
  const [loadingPolicyDiff, setLoadingPolicyDiff] = useState(false);
  const [updatingConsentId, setUpdatingConsentId] = useState<number | null>(null);
  const [lgpdPagination, setLgpdPagination] = useState({
    consents: { page: 1, limit: 50, total: 0, totalPages: 1 },
    requests: { page: 1, limit: 50, total: 0, totalPages: 1 },
    logs: { page: 1, limit: 100, total: 0, totalPages: 1 },
  });
  const [lgpdFilters, setLgpdFilters] = useState({
    q: '',
    from: '',
    to: '',
    ip: '',
    consent_key: '',
    granted: '',
    request_status: '',
    request_type: '',
    event_type: '',
    action: '',
  });
  const [newPolicy, setNewPolicy] = useState({
    policy_type: 'privacy',
    version: '',
    title: '',
    content: '',
    is_active: true,
    force_reaccept: false,
  });
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [policyDiffSelection, setPolicyDiffSelection] = useState({ leftId: '', rightId: '' });
  const [policyDiffResult, setPolicyDiffResult] = useState<any | null>(null);
  const [lgpdExportUserId, setLgpdExportUserId] = useState('');
  const [lgpdExportFormat, setLgpdExportFormat] = useState<'json' | 'csv' | 'pdf'>('json');
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
    contact_hours: 'Seg a Sex, 8h às 18h',
    contact_whatsapp: '',
    new_badge_days: '10',
    redirect_to_checkout_after_add_to_cart: 'false',
    // Suporte ao Cliente
    support_whatsapp: '',
    support_email: '',
    order_notifications_email: '',

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
    brand_logos: '[]',
    lgpd_enabled: 'true',
    lgpd_require_consent_register: 'true',
    lgpd_require_checkout_consent: 'true',
    lgpd_require_marketing_optin: 'false',
    lgpd_require_cookie_consent: 'true',
    lgpd_require_policy_acceptance: 'true',
    lgpd_require_terms_acceptance: 'true',
    lgpd_require_reaccept_on_policy_update: 'true',
    lgpd_dpo_name: '',
    lgpd_dpo_email: '',
    lgpd_dpo_phone: '',
    lgpd_privacy_url: '/politica',
    lgpd_terms_url: '/politica',
    lgpd_cookie_policy_url: '/politica',
    lgpd_policy_version_privacy: '1.0',
    lgpd_policy_version_terms: '1.0',
    lgpd_policy_version_cookies: '1.0',
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

  const normalizePagedPayload = (payload: any, fallbackPage: number, fallbackLimit: number) => {
    if (Array.isArray(payload)) {
      return {
        rows: payload,
        pagination: {
          page: fallbackPage,
          limit: fallbackLimit,
          total: payload.length,
          totalPages: 1,
        },
      };
    }
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const pagination = payload?.pagination || {};
    return {
      rows,
      pagination: {
        page: Number(pagination.page || fallbackPage),
        limit: Number(pagination.limit || fallbackLimit),
        total: Number(pagination.total || rows.length),
        totalPages: Math.max(1, Number(pagination.totalPages || 1)),
      },
    };
  };

  const loadLgpdData = async (pageOverride?: Partial<{ consents: number; requests: number; logs: number }>) => {
    setLoadingLgpdData(true);
    try {
      const consentsPage = pageOverride?.consents || lgpdPagination.consents.page;
      const requestsPage = pageOverride?.requests || lgpdPagination.requests.page;
      const logsPage = pageOverride?.logs || lgpdPagination.logs.page;

      const consentsParams = new URLSearchParams({
        page: String(consentsPage),
        limit: String(lgpdPagination.consents.limit),
      });
      const requestsParams = new URLSearchParams({
        page: String(requestsPage),
        limit: String(lgpdPagination.requests.limit),
      });
      const logsParams = new URLSearchParams({
        page: String(logsPage),
        limit: String(lgpdPagination.logs.limit),
      });

      if (lgpdFilters.q.trim()) {
        consentsParams.set('q', lgpdFilters.q.trim());
        requestsParams.set('q', lgpdFilters.q.trim());
        logsParams.set('q', lgpdFilters.q.trim());
      }
      if (lgpdFilters.from) {
        consentsParams.set('from', lgpdFilters.from);
        requestsParams.set('from', lgpdFilters.from);
        logsParams.set('from', lgpdFilters.from);
      }
      if (lgpdFilters.to) {
        consentsParams.set('to', lgpdFilters.to);
        requestsParams.set('to', lgpdFilters.to);
        logsParams.set('to', lgpdFilters.to);
      }
      if (lgpdFilters.ip.trim()) {
        consentsParams.set('ip', lgpdFilters.ip.trim());
        logsParams.set('ip', lgpdFilters.ip.trim());
      }
      if (lgpdFilters.consent_key.trim()) {
        consentsParams.set('consent_key', lgpdFilters.consent_key.trim());
      }
      if (lgpdFilters.granted.trim()) {
        consentsParams.set('granted', lgpdFilters.granted.trim());
      }
      if (lgpdFilters.request_status.trim()) {
        requestsParams.set('status', lgpdFilters.request_status.trim());
      }
      if (lgpdFilters.request_type.trim()) {
        requestsParams.set('request_type', lgpdFilters.request_type.trim());
      }
      if (lgpdFilters.event_type.trim()) {
        logsParams.set('event_type', lgpdFilters.event_type.trim());
      }
      if (lgpdFilters.action.trim()) {
        logsParams.set('action', lgpdFilters.action.trim());
      }

      const [policiesRes, consentsRes, requestsRes, logsRes] = await Promise.all([
        fetch('/api/admin/lgpd/policies'),
        fetch(`/api/admin/lgpd/consents?${consentsParams.toString()}`),
        fetch(`/api/admin/lgpd/requests?${requestsParams.toString()}`),
        fetch(`/api/admin/lgpd/logs?${logsParams.toString()}`),
      ]);

      const responses = [policiesRes, consentsRes, requestsRes, logsRes];
      const firstFailure = responses.find((response) => !response.ok);
      if (firstFailure) {
        if (firstFailure.status === 404) {
          setMessage({
            type: 'error',
            text: 'Módulo LGPD não encontrado no backend atual. Reinicie o servidor e gere novo build.',
          });
        } else if (firstFailure.status === 401 || firstFailure.status === 403) {
          setMessage({
            type: 'error',
            text: 'Sua sessão não possui permissão para carregar o módulo LGPD.',
          });
        } else {
          const err = await firstFailure.json().catch(() => ({}));
          setMessage({
            type: 'error',
            text: err?.error || 'Erro ao carregar dados LGPD.',
          });
        }
        return;
      }

      const [policiesData, consentsData, requestsData, logsData] = await Promise.all([
        policiesRes.json().catch(() => []),
        consentsRes.json().catch(() => []),
        requestsRes.json().catch(() => []),
        logsRes.json().catch(() => []),
      ]);

      const consentsNormalized = normalizePagedPayload(consentsData, consentsPage, lgpdPagination.consents.limit);
      const requestsNormalized = normalizePagedPayload(requestsData, requestsPage, lgpdPagination.requests.limit);
      const logsNormalized = normalizePagedPayload(logsData, logsPage, lgpdPagination.logs.limit);

      setLgpdPolicies(Array.isArray(policiesData) ? policiesData : []);
      setLgpdConsents(consentsNormalized.rows);
      setLgpdRequests(requestsNormalized.rows);
      setLgpdLogs(logsNormalized.rows);
      setLgpdPagination((prev) => ({
        consents: { ...prev.consents, ...consentsNormalized.pagination },
        requests: { ...prev.requests, ...requestsNormalized.pagination },
        logs: { ...prev.logs, ...logsNormalized.pagination },
      }));
    } catch (error) {
      console.error('Failed to load LGPD data:', error);
    } finally {
      setLoadingLgpdData(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'lgpd') {
      loadLgpdData();
    }
  }, [activeTab]);

  const resetLgpdFilters = () => {
    setLgpdFilters({
      q: '',
      from: '',
      to: '',
      ip: '',
      consent_key: '',
      granted: '',
      request_status: '',
      request_type: '',
      event_type: '',
      action: '',
    });
    setLgpdPagination((prev) => ({
      consents: { ...prev.consents, page: 1 },
      requests: { ...prev.requests, page: 1 },
      logs: { ...prev.logs, page: 1 },
    }));
  };

  const applyLgpdFilters = () => {
    const pages = { consents: 1, requests: 1, logs: 1 };
    setLgpdPagination((prev) => ({
      consents: { ...prev.consents, page: 1 },
      requests: { ...prev.requests, page: 1 },
      logs: { ...prev.logs, page: 1 },
    }));
    loadLgpdData(pages);
  };

  const changeLgpdPage = (tab: 'consents' | 'requests' | 'logs', nextPage: number) => {
    const safePage = Math.max(1, nextPage);
    setLgpdPagination((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], page: safePage },
    }));
    loadLgpdData({ [tab]: safePage });
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
    { id: 'lgpd', label: 'LGPD', icon: ShieldCheck },
  ];

  const lgpdRequestStatusLabel = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    const labels: Record<string, string> = {
      pending: 'Pendente',
      in_review: 'Em análise',
      completed: 'Concluída',
      refused: 'Recusada',
    };
    return labels[normalized] || status || '-';
  };

  const lgpdRequestTypeLabel = (requestType?: string) => {
    const normalized = String(requestType || '').toLowerCase();
    const labels: Record<string, string> = {
      export: 'Exportação',
      delete: 'Exclusão',
      correction: 'Correção',
      revoke: 'Revogação',
    };
    return labels[normalized] || requestType || '-';
  };

  const lgpdLogEventLabel = (eventType?: string) => {
    const normalized = String(eventType || '').toLowerCase();
    const labels: Record<string, string> = {
      consent: 'Consentimento',
      policy: 'Política',
      request: 'Solicitação',
      export: 'Exportação',
      account: 'Conta',
      auth: 'Autenticação',
      cookie: 'Cookies',
    };
    return labels[normalized] || eventType || '-';
  };

  const lgpdLogActionLabel = (action?: string) => {
    const normalized = String(action || '').toLowerCase();
    const labels: Record<string, string> = {
      create: 'Criação',
      update: 'Atualização',
      delete: 'Exclusão',
      revoke: 'Revogação',
      accept: 'Aceite',
      submit: 'Envio',
      download: 'Download',
      approve: 'Aprovação',
      reject: 'Recusa',
      login: 'Login',
      logout: 'Logout',
    };
    return labels[normalized] || action || '-';
  };

  const lgpdConsentKeyLabel = (consentKey?: string) => {
    const normalized = String(consentKey || '').toLowerCase();
    const labels: Record<string, string> = {
      marketing_communications: 'Comunicações de marketing',
      privacy_policy: 'Política de privacidade',
      terms_of_use: 'Termos de uso',
      cookie_policy: 'Política de cookies',
      checkout_data_processing: 'Processamento de dados no checkout',
    };
    return labels[normalized] || consentKey || '-';
  };

  const lgpdConsentSourceLabel = (source?: string) => {
    const normalized = String(source || '').toLowerCase();
    const labels: Record<string, string> = {
      web: 'Site',
      my_account: 'Minha Conta',
      admin_panel: 'Painel Admin',
      checkout: 'Checkout',
      register: 'Cadastro',
    };
    return labels[normalized] || source || '-';
  };

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

  const resetPolicyForm = () => {
    setEditingPolicyId(null);
    setNewPolicy({ policy_type: 'privacy', version: '', title: '', content: '', is_active: true, force_reaccept: false });
  };

  const upsertLgpdPolicy = async () => {
    if (!newPolicy.version || !newPolicy.title || !newPolicy.content) {
      setMessage({ text: 'Preencha versão, título e conteúdo da política.', type: 'error' });
      return;
    }
    try {
      const isEditing = editingPolicyId !== null;
      const endpoint = isEditing ? `/api/admin/lgpd/policies/${editingPolicyId}` : '/api/admin/lgpd/policies';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPolicy),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          setMessage({ text: 'Endpoint LGPD não encontrado no backend. Reinicie o servidor e publique o build atualizado.', type: 'error' });
          return;
        }
        setMessage({ text: data?.error || 'Erro ao criar política LGPD.', type: 'error' });
        return;
      }
      setMessage({ text: isEditing ? 'Política LGPD atualizada com sucesso.' : 'Política LGPD criada com sucesso.', type: 'success' });
      resetPolicyForm();
      loadLgpdData();
    } catch {
      setMessage({ text: editingPolicyId ? 'Erro de rede ao atualizar política LGPD.' : 'Erro de rede ao criar política LGPD.', type: 'error' });
    }
  };

  const startEditLgpdPolicy = (policy: any) => {
    setEditingPolicyId(Number(policy.id));
    setNewPolicy({
      policy_type: String(policy.policy_type || 'privacy'),
      version: String(policy.version || ''),
      title: String(policy.title || ''),
      content: String(policy.content || ''),
      is_active: Number(policy.is_active) === 1 || Boolean(policy.is_active),
      force_reaccept: Number(policy.force_reaccept) === 1 || Boolean(policy.force_reaccept),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activateLgpdPolicy = async (policyId: number) => {
    try {
      const res = await fetch(`/api/admin/lgpd/policies/${policyId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_reaccept: settings.lgpd_require_reaccept_on_policy_update }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.error || 'Erro ao ativar política.', type: 'error' });
        return;
      }
      setMessage({ text: 'Política ativada com sucesso.', type: 'success' });
      loadLgpdData();
      fetchSettings();
    } catch {
      setMessage({ text: 'Erro de rede ao ativar política.', type: 'error' });
    }
  };

  const deleteLgpdPolicy = async (policy: any) => {
    const label = `${policy?.title || 'Política'} v${policy?.version || '-'}`;
    const confirmed = window.confirm(`Deseja realmente excluir ${label}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/lgpd/policies/${policy.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.error || 'Erro ao excluir política.', type: 'error' });
        return;
      }

      if (editingPolicyId === Number(policy.id)) {
        resetPolicyForm();
      }
      setMessage({ text: 'Política excluída com sucesso.', type: 'success' });
      loadLgpdData();
      fetchSettings();
    } catch {
      setMessage({ text: 'Erro de rede ao excluir política.', type: 'error' });
    }
  };

  const updateLgpdRequestStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/admin/lgpd/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.error || 'Erro ao atualizar solicitação.', type: 'error' });
        return;
      }
      setMessage({ text: `Solicitação #${id} atualizada para ${lgpdRequestStatusLabel(status)}.`, type: 'success' });
      loadLgpdData();
    } catch {
      setMessage({ text: 'Erro de rede ao atualizar solicitação.', type: 'error' });
    }
  };

  const updateLgpdConsentStatus = async (id: number, granted: boolean) => {
    try {
      setUpdatingConsentId(id);
      const res = await fetch(`/api/admin/lgpd/consents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.error || 'Erro ao atualizar consentimento.', type: 'error' });
        return;
      }
      setMessage({ text: `Consentimento atualizado para ${granted ? 'concedido' : 'revogado'}.`, type: 'success' });
      loadLgpdData();
    } catch {
      setMessage({ text: 'Erro de rede ao atualizar consentimento.', type: 'error' });
    } finally {
      setUpdatingConsentId(null);
    }
  };

  const runPolicyDiff = async () => {
    if (!policyDiffSelection.leftId || !policyDiffSelection.rightId) {
      setMessage({ text: 'Selecione as duas versões para comparar.', type: 'error' });
      return;
    }
    setLoadingPolicyDiff(true);
    setPolicyDiffResult(null);
    try {
      const params = new URLSearchParams({
        left: policyDiffSelection.leftId,
        right: policyDiffSelection.rightId,
      });
      const res = await fetch(`/api/admin/lgpd/policies/diff?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ text: data?.error || 'Erro ao comparar versões.', type: 'error' });
        return;
      }
      setPolicyDiffResult(data);
    } catch {
      setMessage({ text: 'Erro de rede ao comparar versões.', type: 'error' });
    } finally {
      setLoadingPolicyDiff(false);
    }
  };

  const downloadAdminLgpdExport = async () => {
    const userId = Number(lgpdExportUserId);
    if (!Number.isFinite(userId) || userId <= 0) {
      setMessage({ text: 'Informe um ID de usuário válido.', type: 'error' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/lgpd/export/user/${userId}?format=${lgpdExportFormat}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ text: err?.error || 'Erro ao exportar dados do usuário.', type: 'error' });
        return;
      }

      const blob = await res.blob();
      const extension = lgpdExportFormat === 'pdf' ? 'pdf' : lgpdExportFormat === 'csv' ? 'csv' : 'json';
      const fileName = `dados-lgpd-usuário-${userId}.${extension}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ text: `Exportação do usuário #${userId} iniciada.`, type: 'success' });
    } catch {
      setMessage({ text: 'Erro de rede ao exportar usuário.', type: 'error' });
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
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Telefone de Contato</label>
                        <input
                          type="text"
                          placeholder="(11) 99999-9999"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.phone}
                          onChange={e => setSettings({ ...settings, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp dos Canais Oficiais</label>
                        <input
                          type="text"
                          placeholder="+55 11 99999-9999"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-green-500 text-xs font-bold"
                          value={settings.contact_whatsapp}
                          onChange={e => setSettings({ ...settings, contact_whatsapp: e.target.value })}
                        />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Usado na página de Contato (bloco Canais Oficiais).</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Área de Atendimento</label>
                        <input
                          type="text"
                          placeholder="Atendimento online em todo o Brasil"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.address}
                          onChange={e => setSettings({ ...settings, address: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Horário de Atendimento</label>
                        <input
                          type="text"
                          placeholder="Seg a Sex, 8h às 18h"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.contact_hours}
                          onChange={e => setSettings({ ...settings, contact_hours: e.target.value })}
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Exibido na Área "Minha Conta" do cliente.</p>
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Exibido na Área "Minha Conta" do cliente.</p>
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
                            setSettings({ ...settings, new_badge_days: onlyDigits || '10' });
                          }}
                        />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Produtos cadastrados nos últimos X dias exibirão o badge "Novo".
                        </p>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                          Redirecionar para checkout ao adicionar no carrinho
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              redirect_to_checkout_after_add_to_cart:
                                settings.redirect_to_checkout_after_add_to_cart === 'true' ? 'false' : 'true',
                            })
                          }
                          className={`w-full px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
                            settings.redirect_to_checkout_after_add_to_cart === 'true'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          {settings.redirect_to_checkout_after_add_to_cart === 'true' ? 'Ativado' : 'Desativado'}
                        </button>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Quando ativado, o cliente será enviado direto para o checkout ao clicar em comprar.
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

                      <div className="space-y-6 pt-6 border-t border-slate-50">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Redes Sociais</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Facebook URL</label>
                            <input 
                              type="text" 
                              placeholder="https://facebook.com/..."
                              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                              value={settings.facebook_url}
                              onChange={e => setSettings({...settings, facebook_url: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Instagram URL</label>
                            <input 
                              type="text" 
                              placeholder="https://instagram.com/..."
                              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-pink-500 text-xs font-bold"
                              value={settings.instagram_url}
                              onChange={e => setSettings({...settings, instagram_url: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">YouTube URL</label>
                            <input 
                              type="text" 
                              placeholder="https://youtube.com/..."
                              className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-red-500 text-xs font-bold"
                              value={settings.youtube_url}
                              onChange={e => setSettings({...settings, youtube_url: e.target.value})}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Carrossel de Marcas */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Carrossel de Marcas Parceiras</h3>
                    <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm space-y-6">
                      <div className="space-y-4 pt-4 border-t border-slate-50">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Carrossel de Marcas Parceiras</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {(() => {
                            try {
                              const logos = JSON.parse(settings.brand_logos || '[]');
                              return logos.map((url: string, idx: number) => (
                                <div key={idx} className="group relative aspect-video bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center p-4 overflow-hidden hover:border-blue-200 transition-all">
                                  <img src={url} alt={`Brand ${idx}`} className="max-w-full max-h-full object-contain grayscale group-hover:grayscale-0 transition-all" />
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const newLogos = [...logos];
                                      newLogos.splice(idx, 1);
                                      setSettings({ ...settings, brand_logos: JSON.stringify(newLogos) });
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-white text-red-500 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 active:scale-95"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ));
                            } catch (e) {
                              return null;
                            }
                          })()}
                          
                          <label className="aspect-video bg-white border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-all">
                              <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600">Adicionar</span>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []) as File[];
                                if (files.length === 0) return;

                                try {
                                  setSaving(true);
                                  const uploadedUrls: string[] = [];
                                  
                                  for (const file of files) {
                                    const formData = new FormData();
                                    formData.append('logo', file);

                                    const res = await fetch('/api/admin/upload-logo', {
                                      method: 'POST',
                                      body: formData,
                                    });

                                    const data = await res.json().catch(() => ({} as any));
                                    if (res.ok && data?.url) {
                                      uploadedUrls.push(String(data.url));
                                    }
                                  }

                                  if (uploadedUrls.length > 0) {
                                    const currentLogos = JSON.parse(settings.brand_logos || '[]');
                                    const newLogos = [...currentLogos, ...uploadedUrls];
                                    setSettings({ ...settings, brand_logos: JSON.stringify(newLogos) });
                                    setMessage({ text: `${uploadedUrls.length} logo(s) carregada(s)! Salve para aplicar.`, type: 'success' });
                                  }
                                } catch (err) {
                                  setMessage({ text: 'Erro ao subir logos.', type: 'error' });
                                } finally {
                                  setSaving(false);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Estes logos aparecerão no rodapé da página inicial em um carrossel. Recomendado: PNG com fundo transparente.
                        </p>
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
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail para Pedidos (Solicitado/Confirmado)</label>
                          <input
                            type="email"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.order_notifications_email}
                            onChange={e => setSettings({ ...settings, order_notifications_email: e.target.value })}
                            placeholder="pedidos@seusite.com"
                          />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                            Recebe notificação quando um pedido é criado e quando é confirmado (pago).
                          </p>
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

              {/* Tab: LGPD */}
              {activeTab === 'lgpd' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
                    {[
                      { id: 'general', label: 'Configurações Gerais', icon: ShieldCheck },
                      { id: 'consents', label: 'Consentimentos', icon: Users },
                      { id: 'policies', label: 'Políticas', icon: FileText },
                      { id: 'cookies', label: 'Cookies', icon: Cookie },
                      { id: 'requests', label: 'Solicitações', icon: FileClock },
                      { id: 'logs', label: 'Logs LGPD', icon: Activity },
                      { id: 'security', label: 'Segurança', icon: Database },
                      { id: 'export', label: 'Exportação e Exclusão', icon: Scale },
                      { id: 'terms', label: 'Termos e Contratos', icon: FileCheck2 },
                    ].map((st) => {
                      const Icon = st.icon;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setLgpdSubTab(st.id as any)}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            lgpdSubTab === st.id
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

                  {(lgpdSubTab === 'consents' || lgpdSubTab === 'requests' || lgpdSubTab === 'logs') && (
                    <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/60 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <input
                          type="text"
                          placeholder="Buscar por usuário/e-mail"
                          value={lgpdFilters.q}
                          onChange={(e) => setLgpdFilters((prev) => ({ ...prev, q: e.target.value }))}
                          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                        />
                        <input
                          type="date"
                          value={lgpdFilters.from}
                          onChange={(e) => setLgpdFilters((prev) => ({ ...prev, from: e.target.value }))}
                          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                        />
                        <input
                          type="date"
                          value={lgpdFilters.to}
                          onChange={(e) => setLgpdFilters((prev) => ({ ...prev, to: e.target.value }))}
                          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                        />

                        {(lgpdSubTab === 'consents' || lgpdSubTab === 'logs') && (
                          <input
                            type="text"
                            placeholder="IP"
                            value={lgpdFilters.ip}
                            onChange={(e) => setLgpdFilters((prev) => ({ ...prev, ip: e.target.value }))}
                            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                          />
                        )}

                        {lgpdSubTab === 'consents' && (
                          <>
                            <input
                              type="text"
                              placeholder="Chave do consentimento"
                              value={lgpdFilters.consent_key}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, consent_key: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            />
                            <select
                              value={lgpdFilters.granted}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, granted: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            >
                              <option value="">Status (todos)</option>
                              <option value="true">Concedido</option>
                              <option value="false">Revogado</option>
                            </select>
                          </>
                        )}

                        {lgpdSubTab === 'requests' && (
                          <>
                            <select
                              value={lgpdFilters.request_status}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, request_status: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            >
                              <option value="">Status (todos)</option>
                              <option value="pending">Pendente</option>
                              <option value="in_review">Em análise</option>
                              <option value="completed">Concluída</option>
                              <option value="refused">Recusada</option>
                            </select>
                            <select
                              value={lgpdFilters.request_type}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, request_type: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            >
                              <option value="">Tipo (todos)</option>
                              <option value="export">Exportação</option>
                              <option value="delete">Exclusão</option>
                              <option value="correction">Correção</option>
                              <option value="revoke">Revogação</option>
                            </select>
                          </>
                        )}

                        {lgpdSubTab === 'logs' && (
                          <>
                            <input
                              type="text"
                              placeholder="Tipo de evento"
                              value={lgpdFilters.event_type}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, event_type: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            />
                            <input
                              type="text"
                              placeholder="Ação"
                              value={lgpdFilters.action}
                              onChange={(e) => setLgpdFilters((prev) => ({ ...prev, action: e.target.value }))}
                              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold"
                            />
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={resetLgpdFilters}
                          className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600"
                        >
                          Limpar filtros
                        </button>
                        <button
                          type="button"
                          onClick={applyLgpdFilters}
                          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          Aplicar filtros
                        </button>
                      </div>
                    </div>
                  )}

                  {lgpdSubTab === 'general' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          ['lgpd_enabled', 'Ativar LGPD'],
                          ['lgpd_require_consent_register', 'Exigir consentimento no cadastro'],
                          ['lgpd_require_checkout_consent', 'Exigir consentimento no checkout'],
                          ['lgpd_require_marketing_optin', 'Exigir opt-in marketing'],
                          ['lgpd_require_cookie_consent', 'Exigir consentimento de cookies'],
                          ['lgpd_require_policy_acceptance', 'Exigir aceite política'],
                          ['lgpd_require_terms_acceptance', 'Exigir aceite termos'],
                          ['lgpd_require_reaccept_on_policy_update', 'Forçar reaceite ao atualizar política'],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSettings({ ...settings, [key]: settings[key as keyof typeof settings] === 'true' ? 'false' : 'true' })}
                            className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                              settings[key as keyof typeof settings] === 'true'
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}
                          >
                            <span className="text-sm font-black">{label}</span>
                            <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                              settings[key as keyof typeof settings] === 'true'
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-slate-300'
                            }`}>
                              {settings[key as keyof typeof settings] === 'true' && <Check className="w-4 h-4" />}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do DPO</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_dpo_name} onChange={(e) => setSettings({ ...settings, lgpd_dpo_name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail do DPO</label>
                          <input type="email" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_dpo_email} onChange={(e) => setSettings({ ...settings, lgpd_dpo_email: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Telefone do DPO</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_dpo_phone} onChange={(e) => setSettings({ ...settings, lgpd_dpo_phone: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL Política Privacidade</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_privacy_url} onChange={(e) => setSettings({ ...settings, lgpd_privacy_url: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL Termos de Uso</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_terms_url} onChange={(e) => setSettings({ ...settings, lgpd_terms_url: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL Política Cookies</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" value={settings.lgpd_cookie_policy_url} onChange={(e) => setSettings({ ...settings, lgpd_cookie_policy_url: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}

                  {lgpdSubTab === 'consents' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50/60">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Consentimentos Registrados</h4>
                        <p className="text-xs text-slate-500 font-semibold mt-2">
                          Registros de aceite e revogação com usuário, IP, origem e versão de política.
                        </p>
                      </div>
                      {loadingLgpdData ? (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando consentimentos...</p>
                      ) : lgpdConsents.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-500">Nenhum consentimento LGPD encontrado.</p>
                      ) : (
                        <div className="space-y-3">
                          {lgpdConsents.map((c) => (
                            <div key={c.id} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <div className="flex-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {lgpdConsentKeyLabel(c.consent_key)}
                                  </p>
                                  <p className="text-sm font-black text-slate-800 mt-1">
                                    {c.user_name || 'Usuário removido'} <span className="text-slate-500">({c.user_email || 'sem e-mail'})</span>
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    Versão: {c.policy_version || '-'} • Origem: {lgpdConsentSourceLabel(c.source)} • Atualizado: {c.updated_at}
                                  </p>
                                  <p className="text-xs text-slate-500">IP: {c.ip || '-'} • Base legal: {c.legal_basis || '-'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${Number(c.granted) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {Number(c.granted) ? 'Concedido' : 'Revogado'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => updateLgpdConsentStatus(Number(c.id), !Boolean(Number(c.granted)))}
                                    disabled={updatingConsentId === Number(c.id)}
                                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                  >
                                    {updatingConsentId === Number(c.id)
                                      ? 'Atualizando...'
                                      : Number(c.granted) ? 'Revogar' : 'Conceder'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {lgpdPagination.consents.total} registro(s) • página {lgpdPagination.consents.page} de {lgpdPagination.consents.totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={lgpdPagination.consents.page <= 1}
                                onClick={() => changeLgpdPage('consents', lgpdPagination.consents.page - 1)}
                                className="px-3 py-2 rounded-xl bg-slate-100 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Anterior
                              </button>
                              <button
                                type="button"
                                disabled={lgpdPagination.consents.page >= lgpdPagination.consents.totalPages}
                                onClick={() => changeLgpdPage('consents', lgpdPagination.consents.page + 1)}
                                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Próxima
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {lgpdSubTab === 'policies' && (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                          {editingPolicyId ? `Editar Política #${editingPolicyId}` : 'Nova Versão de Política'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <select className="px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold" value={newPolicy.policy_type} onChange={(e) => setNewPolicy({ ...newPolicy, policy_type: e.target.value })}>
                            <option value="privacy">Privacidade</option>
                            <option value="terms">Termos de Uso</option>
                            <option value="cookies">Cookies</option>
                          </select>
                          <input className="px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold" placeholder="Versão (ex: 1.1)" value={newPolicy.version} onChange={(e) => setNewPolicy({ ...newPolicy, version: e.target.value })} />
                          <input className="px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold md:col-span-2" placeholder="Título" value={newPolicy.title} onChange={(e) => setNewPolicy({ ...newPolicy, title: e.target.value })} />
                        </div>
                        <textarea className="w-full min-h-[160px] px-4 py-3 rounded-xl bg-slate-50 text-xs font-semibold" placeholder="Conteúdo completo da política..." value={newPolicy.content} onChange={(e) => setNewPolicy({ ...newPolicy, content: e.target.value })} />
                        <div className="flex flex-wrap gap-3">
                          <button type="button" onClick={() => setNewPolicy({ ...newPolicy, is_active: !newPolicy.is_active })} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${newPolicy.is_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {newPolicy.is_active ? 'Ativa ao salvar' : 'Salvar inativa'}
                          </button>
                          <button type="button" onClick={() => setNewPolicy({ ...newPolicy, force_reaccept: !newPolicy.force_reaccept })} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${newPolicy.force_reaccept ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                            {newPolicy.force_reaccept ? 'Forçar reaceite ligado' : 'Forçar reaceite desligado'}
                          </button>
                          {editingPolicyId && (
                            <button type="button" onClick={resetPolicyForm} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                              <X className="w-3.5 h-3.5" />
                              Cancelar edição
                            </button>
                          )}
                          <button type="button" onClick={upsertLgpdPolicy} className="ml-auto px-5 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">
                            {editingPolicyId ? 'Salvar edição' : 'Criar política'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {loadingLgpdData ? (
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando políticas...</p>
                        ) : lgpdPolicies.length === 0 ? (
                          <p className="text-sm font-semibold text-slate-500">Nenhuma política cadastrada.</p>
                        ) : lgpdPolicies.map((p) => (
                          <div key={p.id} className="rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{p.policy_type}</p>
                              <h5 className="text-sm font-black text-slate-800">{p.title} <span className="text-slate-500">v{p.version}</span></h5>
                              <p className="text-xs text-slate-500 mt-1">{p.is_active ? 'Ativa' : 'Inativa'} • {p.force_reaccept ? 'Força reaceite' : 'Sem reaceite'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => startEditLgpdPolicy(p)}
                              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLgpdPolicy(p)}
                              className="px-4 py-2 rounded-xl bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                            {!p.is_active && (
                              <button type="button" onClick={() => activateLgpdPolicy(Number(p.id))} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">
                                Ativar
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Comparador de Versões</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <select
                            value={policyDiffSelection.leftId}
                            onChange={(e) => setPolicyDiffSelection((prev) => ({ ...prev, leftId: e.target.value }))}
                            className="px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold"
                          >
                            <option value="">Versão A</option>
                            {lgpdPolicies.map((p) => (
                              <option key={`left-${p.id}`} value={String(p.id)}>
                                {p.policy_type} • v{p.version}
                              </option>
                            ))}
                          </select>
                          <select
                            value={policyDiffSelection.rightId}
                            onChange={(e) => setPolicyDiffSelection((prev) => ({ ...prev, rightId: e.target.value }))}
                            className="px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold"
                          >
                            <option value="">Versão B</option>
                            {lgpdPolicies.map((p) => (
                              <option key={`right-${p.id}`} value={String(p.id)}>
                                {p.policy_type} • v{p.version}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={runPolicyDiff}
                            className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                          >
                            {loadingPolicyDiff ? 'Comparando...' : 'Comparar'}
                          </button>
                        </div>

                        {policyDiffResult && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                Linhas adicionadas ({policyDiffResult?.diff?.content?.added_count || 0})
                              </p>
                              <div className="max-h-48 overflow-auto space-y-1">
                                {(policyDiffResult?.diff?.content?.added || []).slice(0, 100).map((line: string, idx: number) => (
                                  <p key={`add-${idx}`} className="text-xs font-semibold text-emerald-800">+ {line}</p>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">
                                Linhas removidas ({policyDiffResult?.diff?.content?.removed_count || 0})
                              </p>
                              <div className="max-h-48 overflow-auto space-y-1">
                                {(policyDiffResult?.diff?.content?.removed || []).slice(0, 100).map((line: string, idx: number) => (
                                  <p key={`rm-${idx}`} className="text-xs font-semibold text-rose-800">- {line}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {lgpdSubTab === 'cookies' && (
                    <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Política de Cookies e Banner</h4>
                      <p className="text-sm text-slate-600 font-semibold">
                        O banner de cookies usa estas chaves de configuração e grava os consentimentos em banco de dados.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                          <p className="font-black text-blue-800 uppercase tracking-widest">Necessários</p>
                          <p className="text-blue-700 mt-1 font-semibold">Sempre ativos para autenticação e sessão segura.</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="font-black text-slate-700 uppercase tracking-widest">Estatísticos</p>
                          <p className="text-slate-600 mt-1 font-semibold">Controlados pelo usuário via banner.</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="font-black text-slate-700 uppercase tracking-widest">Marketing</p>
                          <p className="text-slate-600 mt-1 font-semibold">Só ativados após consentimento explícito.</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="font-black text-slate-700 uppercase tracking-widest">Preferências</p>
                          <p className="text-slate-600 mt-1 font-semibold">Memória de escolhas e personalização.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {lgpdSubTab === 'requests' && (
                    <div className="space-y-3">
                      {loadingLgpdData ? (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando solicitações...</p>
                      ) : lgpdRequests.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-500">Nenhuma solicitação LGPD encontrada.</p>
                      ) : (
                        <>
                          {lgpdRequests.map((r) => (
                            <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex flex-col md:flex-row md:items-center gap-2">
                                <div className="flex-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">#{r.id} • {lgpdRequestTypeLabel(r.request_type)}</p>
                                  <h5 className="text-sm font-black text-slate-800">{r.user_name} <span className="text-slate-500 font-bold">({r.user_email})</span></h5>
                                  <p className="text-xs text-slate-500 mt-1">Status atual: <strong>{lgpdRequestStatusLabel(r.status)}</strong></p>
                                </div>
                                <div className="flex gap-2">
                                  {['pending', 'in_review', 'completed', 'refused'].map((st) => (
                                    <button key={st} type="button" onClick={() => updateLgpdRequestStatus(Number(r.id), st)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${r.status === st ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                      {lgpdRequestStatusLabel(st)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {lgpdPagination.requests.total} registro(s) • página {lgpdPagination.requests.page} de {lgpdPagination.requests.totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={lgpdPagination.requests.page <= 1}
                                onClick={() => changeLgpdPage('requests', lgpdPagination.requests.page - 1)}
                                className="px-3 py-2 rounded-xl bg-slate-100 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Anterior
                              </button>
                              <button
                                type="button"
                                disabled={lgpdPagination.requests.page >= lgpdPagination.requests.totalPages}
                                onClick={() => changeLgpdPage('requests', lgpdPagination.requests.page + 1)}
                                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Próxima
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {lgpdSubTab === 'logs' && (
                    <div className="space-y-3">
                      {loadingLgpdData ? (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando logs...</p>
                      ) : lgpdLogs.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-500">Nenhum log LGPD encontrado.</p>
                      ) : (
                        <>
                          {lgpdLogs.map((l) => (
                            <div key={l.id} className="rounded-2xl border border-slate-200 p-4">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{lgpdLogEventLabel(l.event_type)} • {lgpdLogActionLabel(l.action)}</p>
                              <p className="text-sm font-black text-slate-800 mt-1">{l.user_name || 'Sistema'} <span className="text-slate-500 font-bold">({l.user_email || 'sem e-mail'})</span></p>
                              <p className="text-xs text-slate-500 mt-1">IP: {l.ip || '-'} • {l.created_at}</p>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {lgpdPagination.logs.total} registro(s) • página {lgpdPagination.logs.page} de {lgpdPagination.logs.totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={lgpdPagination.logs.page <= 1}
                                onClick={() => changeLgpdPage('logs', lgpdPagination.logs.page - 1)}
                                className="px-3 py-2 rounded-xl bg-slate-100 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Anterior
                              </button>
                              <button
                                type="button"
                                disabled={lgpdPagination.logs.page >= lgpdPagination.logs.totalPages}
                                onClick={() => changeLgpdPage('logs', lgpdPagination.logs.page + 1)}
                                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                              >
                                Próxima
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {lgpdSubTab === 'security' && (
                    <div className="rounded-2xl border border-slate-200 p-6">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">Segurança de Dados e Conformidade</h4>
                      <ul className="space-y-2 text-sm text-slate-600 font-semibold">
                        <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Cookies de sessão HTTPOnly e SameSite ativos.</li>
                        <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Hash de senha com bcrypt, proteção de brute force e logs.</li>
                        <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Registro de consentimentos, políticas e solicitações do titular.</li>
                        <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Fluxo de exportação e anonimização de dados disponível via API LGPD.</li>
                      </ul>
                    </div>
                  )}

                  {lgpdSubTab === 'export' && (
                    <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Exportação e Exclusão</h4>
                      <p className="text-sm text-slate-600 font-semibold">
                        O titular pode solicitar exportação (JSON/CSV/PDF) e exclusão/anonimização via Minha Conta.
                      </p>
                      <ul className="space-y-2 text-sm text-slate-600 font-semibold">
                        <li>• Exportação protegida por autenticação e vínculo com o usuário logado.</li>
                        <li>• Solicitações com fluxo: pendente, em análise, concluída e recusada.</li>
                        <li>• Conclusão de exclusão executa anonimização e revoga consentimentos.</li>
                      </ul>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exportar dados de um usuário (admin)</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="number"
                            min={1}
                            placeholder="ID do usuário"
                            value={lgpdExportUserId}
                            onChange={(e) => setLgpdExportUserId(e.target.value)}
                            className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                          />
                          <select
                            value={lgpdExportFormat}
                            onChange={(e) => setLgpdExportFormat(e.target.value as 'json' | 'csv' | 'pdf')}
                            className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                          >
                            <option value="json">JSON</option>
                            <option value="csv">CSV</option>
                            <option value="pdf">PDF</option>
                          </select>
                          <button
                            type="button"
                            onClick={downloadAdminLgpdExport}
                            className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                          >
                            Baixar exportação
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {lgpdSubTab === 'terms' && (
                    <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Termos e Contratos</h4>
                      <p className="text-sm text-slate-600 font-semibold">
                        Utilize a aba <strong>Políticas</strong> para versionar e ativar documentos de Privacidade, Termos de Uso e Cookies.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Versão ativa Privacidade</p>
                          <p className="text-lg font-black text-slate-900 mt-1">{settings.lgpd_policy_version_privacy || '-'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Versão ativa Termos</p>
                          <p className="text-lg font-black text-slate-900 mt-1">{settings.lgpd_policy_version_terms || '-'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Versão ativa Cookies</p>
                          <p className="text-lg font-black text-slate-900 mt-1">{settings.lgpd_policy_version_cookies || '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
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

                  {/* --- PayPal Section --- */}
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
                            <span className="text-base font-black">PayPal Internacional {settings.paypal_enabled === 'true' ? '• Ativo' : '• Inativo'}</span>
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
                            {testingPayPal ? 'Testando...' : 'Testar Credenciais PayPal'}
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




