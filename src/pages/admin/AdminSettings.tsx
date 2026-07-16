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
  Globe2,
  Shield,
  ArrowUp,
  ArrowDown,
  Smartphone,
  Monitor,
  MessageSquare,
} from 'lucide-react';
import AdminEmailTemplates from './AdminEmailTemplates';
import AdminEmailLogs from './AdminEmailLogs';
import AdminBudgetEmailLogs from './AdminBudgetEmailLogs';

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
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showFacebookSecret, setShowFacebookSecret] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [copiedGoogleCallback, setCopiedGoogleCallback] = useState(false);
  const [copiedFacebookCallback, setCopiedFacebookCallback] = useState(false);
  const [copiedAppleCallback, setCopiedAppleCallback] = useState(false);
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
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupMode, setBackupMode] = useState<'full' | 'incremental'>('full');
  const [backupActionId, setBackupActionId] = useState<number | null>(null);

  const [settings, setSettings] = useState({
    social_proof_enabled: 'true',
    social_proof_delay: '10',
    // Home/Info
    site_name: 'Monttera',
    site_description: 'Sua Loja de Produtos Online',
    logo_url: '/logo.png',
    primary_color: '#3b82f6',
    secondary_color: '#1e293b',
    phone: '',
    email_contact: 'contato@monttera.com',
    address: '',
    contact_hours: 'Seg a Sex, 8h às 18h',
    contact_whatsapp: '',
    new_badge_days: '10',
    redirect_to_checkout_after_add_to_cart: 'false',
    top_bar_enabled: 'true',
    top_bar_message: 'Cadastre-se e aproveite todas as vantagens da nossa loja!',
    home_company_enabled: 'true',
    home_company_title: 'Nossa Empresa',
    home_company_subtitle: 'Qualidade e confiança em produtos e serviços',
    home_company_text: 'Criamos soluções consistentes e atendimento especializado para sua melhor experiência.',
    home_company_mission: 'Entregar produtos com excelência, agilidade e excelente suporte.',
    home_company_vision: 'Ser referência nacional em qualidade e e-commerce.',
    home_company_values: 'Qualidade, Transparência, Agilidade, Inovação e Respeito ao cliente.',
    home_company_image_main: '',
    home_company_image_secondary: '',
    home_company_cta_text: 'Conheça nossa coleção',
    home_company_cta_link: '/loja',
    home_company_bg_color: '#0f172a',
    home_company_text_color: '#f8fafc',
    home_company_icons: '["shield","sparkles","award"]',
    seo_meta_title: 'Monttera',
    seo_meta_description: 'Sua loja online com os melhores produtos e serviços.',
    seo_keywords: 'loja online, produtos digitais, monttera, e-commerce',
    seo_robots_index: 'true',
    seo_robots_follow: 'true',
    seo_og_image: '/uploads/seo-default-share.jpg',
    favicon_url: '/favicon.ico',
    seo_twitter_card: 'summary_large_image',
    seo_facebook_url: '',
    seo_instagram_url: '',
    seo_twitter_url: '',
    seo_organization_name: 'Monttera',
    seo_organization_logo: '',
    seo_enable_product_schema: 'true',
    seo_enable_organization_schema: 'true',
    seo_enable_breadcrumb_schema: 'true',
    seo_sitemap_enabled: 'true',
    seo_robots_custom_rules: '',
    gemini_api_key: '',
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
    paypal_brl_eur_rate: '6.00',
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
    email_requests: '',
    brand_logos: '[]',
    home_sliders: '[]',
    side_sliders: '[]',
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
    backup_auto_enabled: 'false',
    backup_auto_frequency: 'daily',
    backup_auto_hour: '3',
    backup_auto_mode: 'full',
    backup_last_run: '',
    google_enabled: 'false',
    google_client_id: '',
    google_client_secret: '',
    facebook_enabled: 'false',
    facebook_app_id: '',
    facebook_app_secret: '',
    apple_enabled: 'false',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'backup') {
      fetchBackups();
    }
  }, [activeTab]);

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
          paypal_default_currency: data.paypal_default_currency ?? prev.paypal_default_currency,
          paypal_brl_usd_rate: data.paypal_brl_usd_rate ?? prev.paypal_brl_usd_rate,
          paypal_brl_eur_rate: data.paypal_brl_eur_rate ?? prev.paypal_brl_eur_rate,
          paypal_webhook_id: data.paypal_webhook_id ?? prev.paypal_webhook_id,
          backup_auto_enabled: data.backup_auto_enabled ?? prev.backup_auto_enabled,
          backup_auto_frequency: data.backup_auto_frequency ?? prev.backup_auto_frequency,
          backup_auto_hour: data.backup_auto_hour ?? prev.backup_auto_hour,
          backup_auto_mode: data.backup_auto_mode ?? prev.backup_auto_mode,
          backup_last_run: data.backup_last_run ?? prev.backup_last_run,
          google_enabled: data.google_enabled ?? prev.google_enabled,
          google_client_id: data.google_client_id ?? prev.google_client_id,
          google_client_secret: data.google_client_secret ?? prev.google_client_secret,
          facebook_enabled: data.facebook_enabled ?? prev.facebook_enabled,
          facebook_app_id: data.facebook_app_id ?? prev.facebook_app_id,
          facebook_app_secret: data.facebook_app_secret ?? prev.facebook_app_secret,
          apple_enabled: data.apple_enabled ?? prev.apple_enabled,
          home_sliders: data.home_sliders || prev.home_sliders || '[]',
          side_sliders: data.side_sliders || prev.side_sliders || '[]',
          gemini_api_key: data.gemini_api_key ?? prev.gemini_api_key,
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

    if (settings.email_requests) {
      const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(settings.email_requests).trim());
      if (!emailIsValid) {
        setMessage({ text: 'Por favor, digite um e-mail válido para receber solicitações.', type: 'error' });
        setSaving(false);
        return;
      }
    }

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

  const uploadCompanyImage = async (file: File, target: 'home_company_image_main' | 'home_company_image_secondary') => {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) throw new Error(data?.error || 'Erro ao fazer upload da imagem');
    setSettings(prev => ({ ...prev, [target]: data.url }));
  };

  const uploadSeoAsset = async (file: File, target: 'seo_og_image' | 'favicon_url') => {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await fetch('/api/admin/upload-logo', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) throw new Error(data?.error || 'Erro ao fazer upload do arquivo');
    setSettings(prev => ({ ...prev, [target]: data.url }));
    return String(data.url);
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await fetch('/api/admin/backups');
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'Erro ao carregar backups');
      setBackups(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Erro ao carregar backups.' });
    } finally {
      setLoadingBackups(false);
    }
  };

  const createBackup = async () => {
    setCreatingBackup(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: backupMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao criar backup');
      setMessage({ type: 'success', text: 'Backup gerado com sucesso.' });
      fetchBackups();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Falha ao criar backup.' });
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadBackup = (id: number) => {
    window.open('/api/admin/backups/download/' + id, '_blank');
  };

  const restoreBackup = async (id: number) => {
    if (!window.confirm('Confirma restaurar este backup? Esta operação substitui dados atuais do sistema.')) return;
    setBackupActionId(id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/backups/restore/' + id, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao restaurar backup');
      setMessage({ type: 'success', text: 'Restauração concluída com sucesso.' });
      fetchBackups();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Falha ao restaurar backup.' });
    } finally {
      setBackupActionId(null);
    }
  };

  const deleteBackup = async (id: number) => {
    if (!window.confirm('Confirma excluir este backup?')) return;
    setBackupActionId(id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/backups/' + id, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao excluir backup');
      setMessage({ type: 'success', text: 'Backup excluído com sucesso.' });
      fetchBackups();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Falha ao excluir backup.' });
    } finally {
      setBackupActionId(null);
    }
  };

  const tabs = [
    { id: 'home', label: 'Aparência & Home', icon: Layout },
    { id: 'email', label: 'Configuração de E-mail', icon: Mail },
    { id: 'seo', label: 'SEO', icon: Globe2 },
    { id: 'payment', label: 'Meios de Pagamento', icon: CreditCard },
    { id: 'social', label: 'Login Social', icon: Users },
    { id: 'backup', label: 'Backup', icon: Database },
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

  const copyGoogleCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/auth/google/callback`);
      setCopiedGoogleCallback(true);
      setTimeout(() => setCopiedGoogleCallback(false), 1500);
    } catch { /* noop */ }
  };

  const copyFacebookCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/auth/facebook/callback`);
      setCopiedFacebookCallback(true);
      setTimeout(() => setCopiedFacebookCallback(false), 1500);
    } catch { /* noop */ }
  };

  const copyAppleCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/auth/apple/callback`);
      setCopiedAppleCallback(true);
      setTimeout(() => setCopiedAppleCallback(false), 1500);
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
                    
                    <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, top_bar_enabled: settings.top_bar_enabled === 'true' ? 'false' : 'true' })}
                          className={`w-12 h-6 rounded-full transition-colors relative ${settings.top_bar_enabled === 'true' ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${settings.top_bar_enabled === 'true' ? 'left-7' : 'left-1'}`} />
                        </button>
                        <div>
                          <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest block cursor-pointer" onClick={() => setSettings({ ...settings, top_bar_enabled: settings.top_bar_enabled === 'true' ? 'false' : 'true' })}>Exibir Barra Superior</label>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">Ativa ou desativa a barra de avisos no topo do site.</p>
                        </div>
                      </div>
                      
                      <div className={`space-y-2 transition-all ${settings.top_bar_enabled === 'true' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mensagem da Barra Superior</label>
                        <input 
                          type="text" 
                          className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.top_bar_message}
                          onChange={e => setSettings({...settings, top_bar_message: e.target.value})}
                          placeholder="Ex: Faça seu cadastro e baixe suas matrizes..."
                        />
                      </div>
                    </div>

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
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail para receber solicitações</label>
                        <input 
                          type="email" 
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.email_requests || ''}
                          onChange={e => setSettings({...settings, email_requests: e.target.value})}
                        />
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5">Este e-mail receberá as mensagens enviadas pelos formulários de Solicitação Personalizada e Orçamento.</p>
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

                  {/* Slideshow da Home (1080x500) */}
                  {(() => {
                    let slidersList: any[] = [];
                    try {
                      slidersList = JSON.parse(settings.home_sliders || '[]');
                    } catch (e) {
                      slidersList = [];
                    }
                    if (!Array.isArray(slidersList)) slidersList = [];

                    const getSlideVisibility = (slide: any) => {
                      const show_mobile = slide.show_mobile ?? (slide.visibility === 'all' || slide.visibility === 'mobile' || !slide.visibility);
                      const show_desktop = slide.show_desktop ?? (slide.visibility === 'all' || slide.visibility === 'desktop' || !slide.visibility);
                      return { show_mobile, show_desktop };
                    };

                    const activeDesktopCount = slidersList.filter(s => s.active !== false && getSlideVisibility(s).show_desktop).length;
                    const activeMobileCount = slidersList.filter(s => s.active !== false && getSlideVisibility(s).show_mobile).length;

                    return (
                      <div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Slideshow da Home (1080x500)</h3>
                        <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Gerencie os banners exibidos no topo da página inicial do site. Formato ideal: 1080x500 pixels.
                            </p>
                            <div className="flex gap-3 text-[9px] font-black uppercase tracking-wider text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                              <span>Desktop: <span className={activeDesktopCount >= 6 ? 'text-amber-500 font-black' : 'text-blue-600 font-black'}>{activeDesktopCount}/6</span></span>
                              <span className="text-slate-300">|</span>
                              <span>Celular: <span className={activeMobileCount >= 6 ? 'text-amber-500 font-black' : 'text-blue-600 font-black'}>{activeMobileCount}/6</span></span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {slidersList.map((slider, idx) => {
                              const { show_desktop, show_mobile } = getSlideVisibility(slider);
                              return (
                                <div key={slider.id || idx} className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                  <div className="w-32 h-16 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                                    {slider.image_url ? (
                                      <img src={slider.image_url} alt="Slide Preview" className="w-full h-full object-cover" />
                                    ) : (
                                      <ImageIcon className="w-6 h-6 text-slate-300" />
                                    )}
                                  </div>
                                  
                                  <div className="flex-1 w-full space-y-3">
                                    <div>
                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Link do Banner (Opcional)</label>
                                      <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                                        placeholder="Ex: /categoria/animais ou https://link.com"
                                        value={slider.link || ''}
                                        onChange={(e) => {
                                          const updated = [...slidersList];
                                          updated[idx] = { ...updated[idx], link: e.target.value };
                                          setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                        }}
                                      />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...slidersList];
                                            const isActivating = updated[idx].active === false;
                                            if (isActivating) {
                                              if (show_desktop && activeDesktopCount >= 6) {
                                                setMessage({ text: 'Não é possível ativar este slide. O limite de 6 slides ativos para Desktop foi atingido.', type: 'error' });
                                                return;
                                              }
                                              if (show_mobile && activeMobileCount >= 6) {
                                                setMessage({ text: 'Não é possível ativar este slide. O limite de 6 slides ativos para Celular foi atingido.', type: 'error' });
                                                return;
                                              }
                                            }
                                            updated[idx] = { ...updated[idx], active: updated[idx].active === false ? true : false };
                                            setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                          }}
                                          className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${slider.active !== false ? 'bg-blue-600' : 'bg-slate-300'}`}
                                        >
                                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${slider.active !== false ? 'left-6' : 'left-0.5'}`} />
                                        </button>
                                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                          {slider.active !== false ? 'Ativado' : 'Desativado'}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Exibir em:</span>
                                        <div className="flex gap-2">
                                          {/* Botão Celular */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...slidersList];
                                              const isActivatingMobile = !show_mobile;
                                              const isSlideActive = updated[idx].active !== false;

                                              if (isSlideActive && isActivatingMobile && activeMobileCount >= 6) {
                                                setMessage({ text: 'Não é possível exibir no Celular. O limite de 6 slides ativos para Celular foi atingido.', type: 'error' });
                                                return;
                                              }

                                              updated[idx] = {
                                                ...updated[idx],
                                                visibility: undefined,
                                                show_mobile: !show_mobile,
                                                show_desktop: show_desktop
                                              };
                                              setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                            }}
                                            className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                                              show_mobile
                                                ? 'bg-blue-50 border-blue-600 text-blue-600 font-bold'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                            }`}
                                            title="Celular"
                                          >
                                            <Smartphone className="w-4 h-4" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">Celular</span>
                                          </button>
                                          
                                          {/* Botão Desktop */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...slidersList];
                                              const isActivatingDesktop = !show_desktop;
                                              const isSlideActive = updated[idx].active !== false;

                                              if (isSlideActive && isActivatingDesktop && activeDesktopCount >= 6) {
                                                setMessage({ text: 'Não é possível exibir no Desktop. O limite de 6 slides ativos para Desktop foi atingido.', type: 'error' });
                                                return;
                                              }

                                              updated[idx] = {
                                                ...updated[idx],
                                                visibility: undefined,
                                                show_mobile: show_mobile,
                                                show_desktop: !show_desktop
                                              };
                                              setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                            }}
                                            className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                                              show_desktop
                                                ? 'bg-blue-50 border-blue-600 text-blue-600 font-bold'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                            }`}
                                            title="Desktop"
                                          >
                                            <Monitor className="w-4 h-4" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">Desktop</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => {
                                        if (idx === 0) return;
                                        const updated = [...slidersList];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx - 1];
                                        updated[idx - 1] = temp;
                                        setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                      }}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      title="Mover para Cima"
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === slidersList.length - 1}
                                      onClick={() => {
                                        if (idx === slidersList.length - 1) return;
                                        const updated = [...slidersList];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx + 1];
                                        updated[idx + 1] = temp;
                                        setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                      }}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      title="Mover para Baixo"
                                    >
                                      <ArrowDown className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = slidersList.filter((_, i) => i !== idx);
                                        setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                        setMessage({ text: 'Slide removido. Lembre-se de salvar as alterações.', type: 'success' });
                                      }}
                                      className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                      title="Remover Slide"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {slidersList.length === 0 && (
                              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                                <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nenhum slide configurado</p>
                                <p className="text-[9px] font-semibold text-slate-400 mt-1">O banner azul original será exibido como fallback na Home.</p>
                              </div>
                            )}

                            {activeDesktopCount < 6 || activeMobileCount < 6 ? (
                              <label className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 text-blue-600 rounded-2xl cursor-pointer transition-all active:scale-[0.99]">
                                <Plus className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Novo Slide</span>
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
                                        setMessage({ text: data?.error || 'Erro ao subir imagem do slide.', type: 'error' });
                                        return;
                                      }

                                      if (data.url) {
                                        const wantDesktop = activeDesktopCount < 6;
                                        const wantMobile = activeMobileCount < 6;
                                        const newSlide = {
                                          id: Date.now().toString(),
                                          image_url: data.url,
                                          link: '',
                                          active: wantDesktop || wantMobile,
                                          show_mobile: wantMobile,
                                          show_desktop: wantDesktop
                                        };
                                        const updated = [...slidersList, newSlide];
                                        setSettings({ ...settings, home_sliders: JSON.stringify(updated) });
                                        
                                        if (!wantDesktop) {
                                          setMessage({ text: 'Slide adicionado para Celular. O limite de Desktop foi atingido.', type: 'success' });
                                        } else if (!wantMobile) {
                                          setMessage({ text: 'Slide adicionado para Desktop. O limite de Celular foi atingido.', type: 'success' });
                                        } else {
                                          setMessage({ text: 'Slide adicionado com sucesso! Salve para aplicar.', type: 'success' });
                                        }
                                      }
                                    } catch (err) {
                                      setMessage({ text: 'Erro ao subir imagem do slide.', type: 'error' });
                                    } finally {
                                      e.currentTarget.value = '';
                                    }
                                  }}
                                />
                              </label>
                            ) : null}

                            <div className="space-y-1 text-center">
                              {activeDesktopCount >= 6 && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                                  Limite máximo de 6 slides ativos atingido para Desktop.
                                </p>
                              )}
                              {activeMobileCount >= 6 && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                                  Limite máximo de 6 slides ativos atingido para Celular.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Slideshow Lateral (Banners na Lateral da Home) */}
                  {(() => {
                    let sideSlidersList: any[] = [];
                    try {
                      sideSlidersList = JSON.parse(settings.side_sliders || '[]');
                    } catch (e) {
                      sideSlidersList = [];
                    }
                    if (!Array.isArray(sideSlidersList)) sideSlidersList = [];

                    const getSlideVisibility = (slide: any) => {
                      const show_mobile = slide.show_mobile ?? (slide.visibility === 'all' || slide.visibility === 'mobile' || !slide.visibility);
                      const show_desktop = slide.show_desktop ?? (slide.visibility === 'all' || slide.visibility === 'desktop' || !slide.visibility);
                      return { show_mobile, show_desktop };
                    };

                    const activeDesktopCount = sideSlidersList.filter(s => s.active !== false && getSlideVisibility(s).show_desktop).length;
                    const activeMobileCount = sideSlidersList.filter(s => s.active !== false && getSlideVisibility(s).show_mobile).length;

                    return (
                      <div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Slideshow Lateral (Banners na Lateral da Home)</h3>
                        <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Gerencie os banners exibidos na lateral direita da página inicial. Formato ideal: 400x400 pixels.
                            </p>
                            <div className="flex gap-3 text-[9px] font-black uppercase tracking-wider text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                              <span>Desktop: <span className={activeDesktopCount >= 6 ? 'text-amber-500 font-black' : 'text-blue-600 font-black'}>{activeDesktopCount}/6</span></span>
                              <span className="text-slate-300">|</span>
                              <span>Celular: <span className={activeMobileCount >= 6 ? 'text-amber-500 font-black' : 'text-blue-600 font-black'}>{activeMobileCount}/6</span></span>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {sideSlidersList.map((slider, idx) => {
                              const { show_desktop, show_mobile } = getSlideVisibility(slider);
                              return (
                                <div key={slider.id || idx} className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                  <div className="w-32 h-16 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                                    {slider.image_url ? (
                                      <img src={slider.image_url} alt="Slide Preview" className="w-full h-full object-cover" />
                                    ) : (
                                      <ImageIcon className="w-6 h-6 text-slate-300" />
                                    )}
                                  </div>
                                  
                                  <div className="flex-1 w-full space-y-3">
                                    <div>
                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Link do Banner (Opcional)</label>
                                      <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                                        placeholder="Ex: /categoria/celulares ou https://link.com"
                                        value={slider.link || ''}
                                        onChange={(e) => {
                                          const updated = [...sideSlidersList];
                                          updated[idx] = { ...updated[idx], link: e.target.value };
                                          setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                        }}
                                      />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...sideSlidersList];
                                            const isActivating = updated[idx].active === false;
                                            if (isActivating) {
                                              if (show_desktop && activeDesktopCount >= 6) {
                                                setMessage({ text: 'Não é possível ativar este slide. O limite de 6 banners ativos para Desktop foi atingido.', type: 'error' });
                                                return;
                                              }
                                              if (show_mobile && activeMobileCount >= 6) {
                                                setMessage({ text: 'Não é possível ativar este slide. O limite de 6 banners ativos para Celular foi atingido.', type: 'error' });
                                                return;
                                              }
                                            }
                                            updated[idx] = { ...updated[idx], active: updated[idx].active === false ? true : false };
                                            setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                          }}
                                          className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${slider.active !== false ? 'bg-blue-600' : 'bg-slate-300'}`}
                                        >
                                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${slider.active !== false ? 'left-6' : 'left-0.5'}`} />
                                        </button>
                                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                          {slider.active !== false ? 'Ativado' : 'Desativado'}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Exibir em:</span>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...sideSlidersList];
                                              const isActivatingMobile = !show_mobile;
                                              const isSlideActive = updated[idx].active !== false;

                                              if (isSlideActive && isActivatingMobile && activeMobileCount >= 6) {
                                                setMessage({ text: 'Não é possível exibir no Celular. O limite de 6 banners ativos foi atingido.', type: 'error' });
                                                return;
                                              }

                                              updated[idx] = {
                                                ...updated[idx],
                                                visibility: undefined,
                                                show_mobile: !show_mobile,
                                                show_desktop: show_desktop
                                              };
                                              setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                            }}
                                            className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                                              show_mobile
                                                ? 'bg-blue-50 border-blue-600 text-blue-600 font-bold'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                            }`}
                                            title="Celular"
                                          >
                                            <Smartphone className="w-4 h-4" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">Celular</span>
                                          </button>
                                          
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...sideSlidersList];
                                              const isActivatingDesktop = !show_desktop;
                                              const isSlideActive = updated[idx].active !== false;

                                              if (isSlideActive && isActivatingDesktop && activeDesktopCount >= 6) {
                                                setMessage({ text: 'Não é possível exibir no Desktop. O limite de 6 banners ativos foi atingido.', type: 'error' });
                                                return;
                                              }

                                              updated[idx] = {
                                                ...updated[idx],
                                                visibility: undefined,
                                                show_mobile: show_mobile,
                                                show_desktop: !show_desktop
                                              };
                                              setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                            }}
                                            className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                                              show_desktop
                                                ? 'bg-blue-50 border-blue-600 text-blue-600 font-bold'
                                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                                            }`}
                                            title="Desktop"
                                          >
                                            <Monitor className="w-4 h-4" />
                                            <span className="text-[9px] font-black uppercase tracking-wider">Desktop</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => {
                                        if (idx === 0) return;
                                        const updated = [...sideSlidersList];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx - 1];
                                        updated[idx - 1] = temp;
                                        setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                      }}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      title="Mover para Cima"
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === sideSlidersList.length - 1}
                                      onClick={() => {
                                        if (idx === sideSlidersList.length - 1) return;
                                        const updated = [...sideSlidersList];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx + 1];
                                        updated[idx + 1] = temp;
                                        setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                      }}
                                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      title="Mover para Baixo"
                                    >
                                      <ArrowDown className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = sideSlidersList.filter((_, i) => i !== idx);
                                        setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                        setMessage({ text: 'Banner removido. Lembre-se de salvar as alterações.', type: 'success' });
                                      }}
                                      className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                      title="Remover Banner"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {sideSlidersList.length === 0 && (
                              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                                <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nenhum banner lateral configurado</p>
                                <p className="text-[9px] font-semibold text-slate-400 mt-1">A lateral ficará oculta e o banner principal ocupará todo o espaço.</p>
                              </div>
                            )}

                            {activeDesktopCount < 6 || activeMobileCount < 6 ? (
                              <label className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 text-blue-600 rounded-2xl cursor-pointer transition-all active:scale-[0.99]">
                                <Plus className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Novo Banner Lateral</span>
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
                                        setMessage({ text: data?.error || 'Erro ao subir imagem do banner.', type: 'error' });
                                        return;
                                      }

                                      if (data.url) {
                                        const wantDesktop = activeDesktopCount < 6;
                                        const wantMobile = activeMobileCount < 6;
                                        const newSlide = {
                                          id: Date.now().toString(),
                                          image_url: data.url,
                                          link: '',
                                          active: wantDesktop || wantMobile,
                                          show_mobile: wantMobile,
                                          show_desktop: wantDesktop
                                        };
                                        const updated = [...sideSlidersList, newSlide];
                                        setSettings({ ...settings, side_sliders: JSON.stringify(updated) });
                                        
                                        if (!wantDesktop) {
                                          setMessage({ text: 'Banner adicionado para Celular. O limite de Desktop foi atingido.', type: 'success' });
                                        } else if (!wantMobile) {
                                          setMessage({ text: 'Banner adicionado para Desktop. O limite de Celular foi atingido.', type: 'success' });
                                        } else {
                                          setMessage({ text: 'Banner adicionado com sucesso! Salve para aplicar.', type: 'success' });
                                        }
                                      }
                                    } catch (err) {
                                      setMessage({ text: 'Erro ao subir imagem do banner.', type: 'error' });
                                    } finally {
                                      e.currentTarget.value = '';
                                    }
                                  }}
                                />
                              </label>
                            ) : null}

                            <div className="space-y-1 text-center">
                              {activeDesktopCount >= 6 && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                                  Limite máximo de 6 banners ativos atingido para Desktop.
                                </p>
                              )}
                              {activeMobileCount >= 6 && (
                                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                                  Limite máximo de 6 banners ativos atingido para Celular.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-50">Seção Nossa Empresa</h3>
                    <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 space-y-6">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, home_company_enabled: settings.home_company_enabled === 'true' ? 'false' : 'true' })}
                          className={`w-12 h-6 rounded-full transition-colors relative ${settings.home_company_enabled === 'true' ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${settings.home_company_enabled === 'true' ? 'left-7' : 'left-1'}`} />
                        </button>
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Exibir seção na Home</span>
                      </div>

                      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${settings.home_company_enabled === 'true' ? '' : 'opacity-50 pointer-events-none'}`}>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Título</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold" value={settings.home_company_title} onChange={e => setSettings({ ...settings, home_company_title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Subtítulo</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold" value={settings.home_company_subtitle} onChange={e => setSettings({ ...settings, home_company_subtitle: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Texto institucional</label>
                          <textarea rows={4} className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold" value={settings.home_company_text} onChange={e => setSettings({ ...settings, home_company_text: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Missão</label>
                          <textarea rows={3} className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold" value={settings.home_company_mission} onChange={e => setSettings({ ...settings, home_company_mission: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Visão</label>
                          <textarea rows={3} className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold" value={settings.home_company_vision} onChange={e => setSettings({ ...settings, home_company_vision: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Valores</label>
                          <textarea rows={3} className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold" value={settings.home_company_values} onChange={e => setSettings({ ...settings, home_company_values: e.target.value })} />
                        </div>

                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Imagem principal</label>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                            {settings.home_company_image_main ? <img src={settings.home_company_image_main} className="w-full h-28 object-cover rounded-xl" /> : <div className="w-full h-28 rounded-xl bg-slate-100" />}
                            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer">
                              Upload
                              <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                try {
                                  await uploadCompanyImage(f, 'home_company_image_main');
                                  setMessage({ text: 'Imagem principal carregada. Salve para aplicar.', type: 'success' });
                                } catch (err: any) {
                                  setMessage({ text: err?.message || 'Erro no upload da imagem principal.', type: 'error' });
                                } finally {
                                  e.currentTarget.value = '';
                                }
                              }} />
                            </label>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Imagem secundária</label>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                            {settings.home_company_image_secondary ? <img src={settings.home_company_image_secondary} className="w-full h-28 object-cover rounded-xl" /> : <div className="w-full h-28 rounded-xl bg-slate-100" />}
                            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer">
                              Upload
                              <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                try {
                                  await uploadCompanyImage(f, 'home_company_image_secondary');
                                  setMessage({ text: 'Imagem secundária carregada. Salve para aplicar.', type: 'success' });
                                } catch (err: any) {
                                  setMessage({ text: err?.message || 'Erro no upload da imagem secundária.', type: 'error' });
                                } finally {
                                  e.currentTarget.value = '';
                                }
                              }} />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Botão CTA</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold" value={settings.home_company_cta_text} onChange={e => setSettings({ ...settings, home_company_cta_text: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Link CTA</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold" value={settings.home_company_cta_link} onChange={e => setSettings({ ...settings, home_company_cta_link: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cor do fundo</label>
                          <input type="color" className="w-full h-12 rounded-xl bg-white border border-slate-200 p-1" value={settings.home_company_bg_color} onChange={e => setSettings({ ...settings, home_company_bg_color: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cor do texto</label>
                          <input type="color" className="w-full h-12 rounded-xl bg-white border border-slate-200 p-1" value={settings.home_company_text_color} onChange={e => setSettings({ ...settings, home_company_text_color: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Ícones (JSON)</label>
                          <input type="text" className="w-full px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-xs font-bold" value={settings.home_company_icons} onChange={e => setSettings({ ...settings, home_company_icons: e.target.value })} placeholder='["shield","sparkles","award"]' />
                        </div>
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
                            placeholder="Suporte Monttera"
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
                  {emailSubTab === 'logs' && (
                    <div className="space-y-6">
                      <AdminEmailLogs />
                      <AdminBudgetEmailLogs />
                    </div>
                  )}
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
                                    {c.user_name || 'Usuário removido'} <span className="text-slate-500">({c.user_email || (c.user_id ? `ID: ${c.user_id}` : 'sem e-mail')})</span>
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
                              <p className="text-sm font-black text-slate-800 mt-1">{l.user_name || (l.user_id ? 'Usuário Excluído' : 'Sistema')} <span className="text-slate-500 font-bold">({l.user_email || (l.user_id ? `ID: ${l.user_id}` : 'sem e-mail')})</span></p>
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

              {/* Tab: SEO */}
              {activeTab === 'seo' && (
                <div className="space-y-6">
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configurações Globais de SEO</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Meta Title Global</label>
                        <input value={settings.seo_meta_title || ''} onChange={e => setSettings({ ...settings, seo_meta_title: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Meta Description Global</label>
                        <textarea rows={3} value={settings.seo_meta_description || ''} onChange={e => setSettings({ ...settings, seo_meta_description: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold resize-none" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Keywords</label>
                        <input value={settings.seo_keywords || ''} onChange={e => setSettings({ ...settings, seo_keywords: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Indexação</label>
                        <select value={settings.seo_robots_index || 'true'} onChange={e => setSettings({ ...settings, seo_robots_index: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold">
                          <option value="true">index</option>
                          <option value="false">noindex</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Follow</label>
                        <select value={settings.seo_robots_follow || 'true'} onChange={e => setSettings({ ...settings, seo_robots_follow: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold">
                          <option value="true">follow</option>
                          <option value="false">nofollow</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Sitemap XML</label>
                        <select value={settings.seo_sitemap_enabled || 'true'} onChange={e => setSettings({ ...settings, seo_sitemap_enabled: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold">
                          <option value="true">Ativo</option>
                          <option value="false">Desativado</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Twitter Card</label>
                        <select value={settings.seo_twitter_card || 'summary_large_image'} onChange={e => setSettings({ ...settings, seo_twitter_card: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold">
                          <option value="summary_large_image">summary_large_image</option>
                          <option value="summary">summary</option>
                        </select>
                      </div>
                      <div className="space-y-3 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Open Graph Image</label>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Imagem usada quando seu link Ã© compartilhado no WhatsApp, Facebook, Instagram, LinkedIn e X.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                          <div className="space-y-2">
                            <input value={settings.seo_og_image || ''} onChange={e => setSettings({ ...settings, seo_og_image: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                              Formatos: JPG, JPEG, PNG, WEBP | Recomendado: 1200x630 px
                            </p>
                            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-100 transition-colors">
                              <Plus className="w-3.5 h-3.5" /> Enviar imagem Open Graph
                              <input
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  try {
                                    setSaving(true);
                                    await uploadSeoAsset(f, 'seo_og_image');
                                    setMessage({ text: 'Open Graph Image enviada! Salve para aplicar.', type: 'success' });
                                  } catch (err: any) {
                                    setMessage({ text: err?.message || 'Erro ao enviar Open Graph Image.', type: 'error' });
                                  } finally {
                                    setSaving(false);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Miniatura</p>
                            <div className="aspect-[1200/630] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                              {settings.seo_og_image ? (
                                <img src={String(settings.seo_og_image)} alt="Preview Open Graph" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">Sem imagem</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Favicon</label>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
                          <div className="space-y-2">
                            <input value={(settings as any).favicon_url || ''} onChange={e => setSettings({ ...settings, favicon_url: e.target.value } as any)} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                              Formatos: ICO, PNG, SVG | Recomendado: 32x32 ou 48x48 px
                            </p>
                            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-100 transition-colors">
                              <Plus className="w-3.5 h-3.5" /> Enviar favicon
                              <input
                                type="file"
                                className="hidden"
                                accept=".ico,image/png,image/svg+xml"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  try {
                                    setSaving(true);
                                    await uploadSeoAsset(f, 'favicon_url');
                                    setMessage({ text: 'Favicon enviado! Salve para aplicar.', type: 'success' });
                                  } catch (err: any) {
                                    setMessage({ text: err?.message || 'Erro ao enviar favicon.', type: 'error' });
                                  } finally {
                                    setSaving(false);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Miniatura</p>
                            <div className="h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                              {(settings as any).favicon_url ? (
                                <img src={String((settings as any).favicon_url)} alt="Preview favicon" className="w-8 h-8 object-contain" />
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">Sem Ã­cone</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Schema Produto</label>
                        <select value={settings.seo_enable_product_schema || 'true'} onChange={e => setSettings({ ...settings, seo_enable_product_schema: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"><option value="true">Ativo</option><option value="false">Desativado</option></select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Schema Organização</label>
                        <select value={settings.seo_enable_organization_schema || 'true'} onChange={e => setSettings({ ...settings, seo_enable_organization_schema: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"><option value="true">Ativo</option><option value="false">Desativado</option></select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Schema Breadcrumb</label>
                        <select value={settings.seo_enable_breadcrumb_schema || 'true'} onChange={e => setSettings({ ...settings, seo_enable_breadcrumb_schema: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"><option value="true">Ativo</option><option value="false">Desativado</option></select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome da Organização</label>
                        <input value={settings.seo_organization_name || ''} onChange={e => setSettings({ ...settings, seo_organization_name: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Regras customizadas de robots.txt</label>
                        <textarea rows={4} value={settings.seo_robots_custom_rules || ''} onChange={e => setSettings({ ...settings, seo_robots_custom_rules: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold resize-y" placeholder="Ex.: Disallow: /admin" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ferramentas de SEO</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Sitemap */}
                        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                              <Globe2 className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800">Sitemap XML</p>
                              <p className="text-[10px] font-bold text-slate-500">Indexação para motores de busca</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            Gerado dinamicamente com todos os produtos, categorias e páginas estáticas do site.
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <a
                              href="/sitemap.xml"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
                            >
                              <Globe2 className="w-3 h-3" />
                              Ver sitemap.xml
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/sitemap.xml`);
                                setMessage({ text: 'URL do sitemap copiada!', type: 'success' });
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest hover:bg-blue-200 transition-colors"
                            >
                              Copiar URL
                            </button>
                          </div>
                          <p className="text-[9px] font-bold text-blue-400 font-mono">/sitemap.xml</p>
                        </div>

                        {/* Robots.txt */}
                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-5 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center shadow-sm">
                              <Shield className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800">Robots.txt</p>
                              <p className="text-[10px] font-bold text-slate-500">Diretivas para rastreadores</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            Gerado a partir das configurações de indexação, follow e regras customizadas acima.
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <a
                              href="/robots.txt"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
                            >
                              <Shield className="w-3 h-3" />
                              Ver robots.txt
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/robots.txt`);
                                setMessage({ text: 'URL do robots.txt copiada!', type: 'success' });
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-colors"
                            >
                              Copiar URL
                            </button>
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 font-mono">/robots.txt</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-[11px] text-blue-800 font-semibold">
                        💡 Salve as configurações SEO antes de visualizar para garantir que as últimas alterações estejam refletidas nos arquivos gerados.
                      </div>
                    </div>

                    {/* Google Gemini Card */}
                    <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 bg-gradient-to-br from-indigo-50/20 to-purple-50/20 space-y-6 mt-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                          <Globe2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Google Gemini API</h3>
                          <p className="text-[10px] font-bold text-slate-400">Configuração de Inteligência Artificial para Tradução</p>
                        </div>
                      </div>
                      
                      <div className="rounded-2xl border border-slate-100 bg-white/85 backdrop-blur-sm p-6 space-y-5">
                        <p className="text-[11px] text-slate-600 font-bold leading-relaxed">
                          A chave de API configurada abaixo é utilizada para realizar traduções automáticas instantâneas de produtos, categorias, perguntas do FAQ e posts do blog nos formulários do painel administrativo.
                        </p>
                        
                        <div className="space-y-2 max-w-2xl">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">GEMINI API KEY</label>
                          <div className="relative flex items-center">
                            <input
                              type={showGeminiKey ? 'text' : 'password'}
                              placeholder="Insira sua chave de API (AIzaSy...)"
                              value={settings.gemini_api_key || ''}
                              onChange={e => setSettings({ ...settings, gemini_api_key: e.target.value })}
                              className="w-full px-5 py-3.5 pr-12 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowGeminiKey(!showGeminiKey)}
                              className="absolute right-4 text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                              {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                            ⚠️ Deixe em branco para usar a chave padrão configurada na variável de ambiente do servidor (.env).
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}


              {activeTab === 'backup' && (
                <div className="space-y-6">
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Backup do Sistema</h3>
                      <div className="md:ml-auto flex items-center gap-2">
                        <select
                          value={backupMode}
                          onChange={(e) => setBackupMode(e.target.value as 'full' | 'incremental')}
                          className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest"
                        >
                          <option value="full">Completo</option>
                          <option value="incremental">Incremental</option>
                        </select>
                        <button
                          type="button"
                          onClick={createBackup}
                          disabled={creatingBackup}
                          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {creatingBackup ? 'Gerando...' : 'Gerar Backup'}
                        </button>
                        <button
                          type="button"
                          onClick={fetchBackups}
                          disabled={loadingBackups}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          Atualizar
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-[11px] text-blue-800 font-semibold">
                      O backup inclui snapshot de banco de dados e pasta <code>public/uploads</code>. Utilize restauração apenas em ambiente controlado.
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[10px]">
                          <tr>
                            <th className="px-4 py-3 text-left">Data</th>
                            <th className="px-4 py-3 text-left">Chave</th>
                            <th className="px-4 py-3 text-left">Modo</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Tamanho</th>
                            <th className="px-4 py-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingBackups ? (
                            <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Carregando backups...</td></tr>
                          ) : backups.length === 0 ? (
                            <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>Nenhum backup encontrado.</td></tr>
                          ) : backups.map((backup) => (
                            <tr key={backup.id} className="border-t border-slate-100">
                              <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{new Date(backup.created_at).toLocaleString('pt-BR')}</td>
                              <td className="px-4 py-3 font-bold text-slate-900">{backup.backup_key}</td>
                              <td className="px-4 py-3 font-bold text-slate-700 uppercase">{backup.mode}</td>
                              <td className="px-4 py-3 font-bold">
                                <span className={"px-2 py-1 rounded-lg text-[10px] uppercase " + (backup.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                                  {backup.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-700">{Number(backup.size_bytes || 0).toLocaleString('pt-BR')} bytes</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => downloadBackup(Number(backup.id))} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase">Download</button>
                                  <button type="button" onClick={() => restoreBackup(Number(backup.id))} disabled={backupActionId === Number(backup.id)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase disabled:opacity-50">Restaurar</button>
                                  <button type="button" onClick={() => deleteBackup(Number(backup.id))} disabled={backupActionId === Number(backup.id)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-[10px] font-black uppercase disabled:opacity-50">Excluir</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Card: Agendamento de Backup Automático */}
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agendamento de Backup</h3>
                      <p className="text-[11px] text-slate-500 font-medium">Programe a frequência e horário das cópias de segurança automáticas do sistema.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Backup Automático</label>
                        <select
                          value={settings.backup_auto_enabled}
                          onChange={e => setSettings({ ...settings, backup_auto_enabled: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                        >
                          <option value="false">Desativado</option>
                          <option value="true">Habilitado</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Frequência</label>
                        <select
                          value={settings.backup_auto_frequency}
                          disabled={settings.backup_auto_enabled !== 'true'}
                          onChange={e => setSettings({ ...settings, backup_auto_frequency: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-bold disabled:opacity-50"
                        >
                          <option value="daily">Diário</option>
                          <option value="weekly">Semanal (A cada 7 dias)</option>
                          <option value="monthly">Mensal (A cada 30 dias)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Horário Preferencial</label>
                        <select
                          value={settings.backup_auto_hour}
                          disabled={settings.backup_auto_enabled !== 'true'}
                          onChange={e => setSettings({ ...settings, backup_auto_hour: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-bold disabled:opacity-50"
                        >
                          {Array.from({ length: 24 }).map((_, i) => (
                            <option key={i} value={String(i)}>
                              {String(i).padStart(2, '0')}:00h {i >= 1 && i <= 5 ? '(Recomendado)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Backup</label>
                        <select
                          value={settings.backup_auto_mode}
                          disabled={settings.backup_auto_enabled !== 'true'}
                          onChange={e => setSettings({ ...settings, backup_auto_mode: e.target.value as 'full' | 'incremental' })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs font-bold disabled:opacity-50"
                        >
                          <option value="full">Completo</option>
                          <option value="incremental">Incremental</option>
                        </select>
                      </div>
                    </div>

                    {settings.backup_auto_enabled === 'true' && settings.backup_last_run && (
                      <div className="text-[10px] text-slate-500 font-semibold bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        Último backup automático executado em: <strong className="text-slate-800">{new Date(settings.backup_last_run).toLocaleString('pt-BR')}</strong>
                      </div>
                    )}
                  </div>
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

                        {/* Currency + Rates */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Moeda padr?o do recebimento</label>
                          <select
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.paypal_default_currency}
                            onChange={e => setSettings({ ...settings, paypal_default_currency: e.target.value })}
                          >
                            <option value="BRL">BRL (Real)</option>
                            <option value="USD">USD (D?lar)</option>
                            <option value="EUR">EUR (Euro)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Taxa BRL ? USD</label>
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
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Taxa BRL ? EUR</label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.paypal_brl_eur_rate}
                            onChange={e => setSettings({ ...settings, paypal_brl_eur_rate: e.target.value })}
                            placeholder="6.00"
                          />
                          <p className="text-[10px] font-bold text-slate-400 ml-1">Ex: 6.00 significa 1 EUR = R$ 6,00</p>
                        </div>
                        <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold text-blue-800">
                          Contas PayPal pessoais podem receber pagamentos internacionais desde que a moeda esteja habilitada na conta PayPal.
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

              {/* Tab: Social Login */}
              {activeTab === 'social' && (
                <div className="space-y-8">
                  
                  {/* Google OAuth Config Card */}
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          Autenticação com Google
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Permita que os usuários se cadastrem e entrem com suas contas Google.</p>
                      </div>
                      
                      {/* Enable Switch */}
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, google_enabled: settings.google_enabled === 'true' ? 'false' : 'true' })}
                        className={`px-5 py-2.5 rounded-2xl border flex items-center gap-3 transition-all ${
                          settings.google_enabled === 'true' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold text-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 font-bold text-xs'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          settings.google_enabled === 'true' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {settings.google_enabled === 'true' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        Google {settings.google_enabled === 'true' ? 'Ativado' : 'Desativado'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client ID Google</label>
                        <input
                          type="text"
                          placeholder="Ex: 123456789-xxxxxxxxxxxxxx.apps.googleusercontent.com"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.google_client_id}
                          onChange={e => setSettings({ ...settings, google_client_id: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Secret Google</label>
                        <div className="relative">
                          <input
                            type={showGoogleSecret ? 'text' : 'password'}
                            placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-5 py-3.5 pr-12 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.google_client_secret}
                            onChange={e => setSettings({ ...settings, google_client_secret: e.target.value })}
                          />
                          <button type="button" onClick={() => setShowGoogleSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            {showGoogleSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Callback URL */}
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URI de redirecionamento autorizada</label>
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-900 text-emerald-400 px-4 py-3.5">
                          <LinkIcon className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold flex-1 break-all">{`${window.location.origin}/api/auth/google/callback`}</span>
                          <button type="button" onClick={copyGoogleCallbackUrl} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest shrink-0 hover:bg-white/20">
                            {copiedGoogleCallback ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Google Instructions Box */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
                      <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Instruções para obter as credenciais do Google</p>
                      <ol className="text-xs text-slate-600 font-semibold space-y-2 list-decimal pl-5">
                        <li>Acesse o <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a>.</li>
                        <li>Crie um projeto ou selecione um existente.</li>
                        <li>No menu, vá em <strong>APIs e Serviços &gt; Tela de consentimento OAuth</strong>. Configure-a como <strong>Externo</strong> e defina as permissões básicas (<code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">email</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">profile</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">openid</code>).</li>
                        <li>Vá para a guia <strong>Credenciais</strong>, clique em <strong>Criar Credenciais</strong> e escolha <strong>ID do cliente OAuth</strong>.</li>
                        <li>Selecione o Tipo de aplicativo como <strong>Aplicativo da Web</strong>.</li>
                        <li>Em <strong>Origens JavaScript autorizadas</strong>, adicione a URL base do site: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{window.location.origin}</code></li>
                        <li>Em <strong>URIs de redirecionamento autorizados</strong>, adicione o endereço copiado acima: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{`${window.location.origin}/api/auth/google/callback`}</code></li>
                        <li>Clique em <strong>Criar</strong> e copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> nos campos acima.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Facebook OAuth Config Card */}
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true" className="shrink-0">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                          Autenticação com Facebook
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Permita que os usuários se cadastrem e entrem com suas contas do Facebook.</p>
                      </div>
                      
                      {/* Enable Switch */}
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, facebook_enabled: settings.facebook_enabled === 'true' ? 'false' : 'true' })}
                        className={`px-5 py-2.5 rounded-2xl border flex items-center gap-3 transition-all ${
                          settings.facebook_enabled === 'true' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold text-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 font-bold text-xs'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          settings.facebook_enabled === 'true' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {settings.facebook_enabled === 'true' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        Facebook {settings.facebook_enabled === 'true' ? 'Ativado' : 'Desativado'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">App ID Facebook</label>
                        <input
                          type="text"
                          placeholder="Ex: 123456789012345"
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                          value={settings.facebook_app_id}
                          onChange={e => setSettings({ ...settings, facebook_app_id: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">App Secret Facebook</label>
                        <div className="relative">
                          <input
                            type={showFacebookSecret ? 'text' : 'password'}
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-5 py-3.5 pr-12 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            value={settings.facebook_app_secret}
                            onChange={e => setSettings({ ...settings, facebook_app_secret: e.target.value })}
                          />
                          <button type="button" onClick={() => setShowFacebookSecret(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            {showFacebookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Callback URL */}
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URI de redirecionamento OAuth válida</label>
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-900 text-emerald-400 px-4 py-3.5">
                          <LinkIcon className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold flex-1 break-all">{`${window.location.origin}/api/auth/facebook/callback`}</span>
                          <button type="button" onClick={copyFacebookCallbackUrl} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest shrink-0 hover:bg-white/20">
                            {copiedFacebookCallback ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Facebook Instructions Box */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
                      <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Instruções para obter as credenciais do Facebook</p>
                      <ol className="text-xs text-slate-600 font-semibold space-y-2 list-decimal pl-5">
                        <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Meta for Developers</a>.</li>
                        <li>Crie uma conta de desenvolvedor, clique em <strong>Meus Aplicativos</strong> e depois em <strong>Criar aplicativo</strong>.</li>
                        <li>Selecione o tipo de aplicativo <strong>Consumidor</strong> ou <strong>Empresa</strong> e finalize a criação.</li>
                        <li>No painel do aplicativo, vá em <strong>Configurações &gt; Básico</strong> e adicione o <strong>Domínio do aplicativo</strong> (ex: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">digitalbordados.com.br</code>) e a <strong>URL da Política de Privacidade</strong>.</li>
                        <li>No menu lateral, clique no botão <strong>Adicionar Produto</strong> (ou procure por produtos) e adicione o produto <strong>Login do Facebook</strong>.</li>
                        <li>Acesse <strong>Login do Facebook &gt; Configurações</strong>.</li>
                        <li>No campo <strong>URIs de redirecionamento OAuth válidos</strong>, cole a URL copiada acima: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{`${window.location.origin}/api/auth/facebook/callback`}</code></li>
                        <li>Clique em <strong>Salvar alterações</strong> no rodapé.</li>
                        <li>Volte para <strong>Configurações &gt; Básico</strong> para copiar o <strong>ID do aplicativo</strong> e a <strong>Chave secreta do aplicativo</strong> nos campos acima.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Apple Sign In Config Card */}
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="black" aria-hidden="true" className="shrink-0">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.1.09 2.23-.58 2.95-1.39z" />
                          </svg>
                          Autenticação com Apple (iCloud)
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Permita que os usuários se cadastrem e entrem com suas contas da Apple.</p>
                      </div>
                      
                      {/* Enable Switch */}
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, apple_enabled: settings.apple_enabled === 'true' ? 'false' : 'true' })}
                        className={`px-5 py-2.5 rounded-2xl border flex items-center gap-3 transition-all ${
                          settings.apple_enabled === 'true' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold text-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 font-bold text-xs'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          settings.apple_enabled === 'true' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {settings.apple_enabled === 'true' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        Apple {settings.apple_enabled === 'true' ? 'Ativado' : 'Desativado'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      {/* Note about credentials */}
                      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                        <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                          Por motivos de segurança cibernética, as credenciais da Apple (Team ID, Key ID, Private Key .p8) devem ser inseridas exclusivamente no arquivo <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">.env</code> do seu servidor. O switch acima apenas ativa ou desativa o botão na interface do usuário.
                        </p>
                      </div>

                      {/* Callback URL */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URI de redirecionamento OAuth válida (Sign in with Apple)</label>
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-900 text-emerald-400 px-4 py-3.5">
                          <LinkIcon className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold flex-1 break-all">{`${window.location.origin}/api/auth/apple/callback`}</span>
                          <button type="button" onClick={copyAppleCallbackUrl} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest shrink-0 hover:bg-white/20">
                            {copiedAppleCallback ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Apple Instructions Box */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
                      <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Instruções para configurar o login com a Apple</p>
                      <ol className="text-xs text-slate-600 font-semibold space-y-2 list-decimal pl-5">
                        <li>Acesse o portal do <a href="https://developer.apple.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Apple Developer</a> (requer conta paga de desenvolvedor Apple).</li>
                        <li>Vá em <strong>Certificates, Identifiers & Profiles &gt; Identifiers</strong>.</li>
                        <li>Crie ou edite o <strong>App ID</strong> principal do seu aplicativo. Certifique-se de ativar a funcionalidade <strong>Sign In with Apple</strong> nas capacidades.</li>
                        <li>Crie um novo identificador do tipo <strong>Services ID</strong>. Defina um Identificador único (ex: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">br.com.digitalbordados.service</code>).</li>
                        <li>Habilite o <strong>Sign In with Apple</strong> no Services ID e clique em <strong>Configure</strong>.</li>
                        <li>Selecione seu App ID primário. Em <strong>Domains and Subdomains</strong>, coloque o seu domínio principal (ex: <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">digitalbordados.com.br</code>). Em <strong>Return URLs</strong>, adicione o endereço de callback copiado acima: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{`${window.location.origin}/api/auth/apple/callback`}</code>. Salve.</li>
                        <li>Vá para a guia <strong>Keys</strong>, adicione uma nova chave, dê um nome e habilite <strong>Sign in with Apple</strong>. Clique em <strong>Configure</strong>, escolha seu App ID primário e salve.</li>
                        <li>Baixe o arquivo de chave privada (<code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">.p8</code>) gerado e copie o <strong>Key ID</strong>.</li>
                        <li>Adicione as variáveis correspondentes no arquivo <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">.env</code> no servidor:
                          <pre className="bg-slate-900 text-slate-300 p-3 rounded-xl text-[10px] font-mono mt-2 overflow-x-auto leading-normal">
{`APPLE_CLIENT_ID="seu.services.id"
APPLE_TEAM_ID="seu.team.id"
APPLE_KEY_ID="seu.key.id"
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIG...\\n-----END PRIVATE KEY-----"
APPLE_CALLBACK_URL="${window.location.origin}/api/auth/apple/callback"`}
                          </pre>
                        </li>
                      </ol>
                    </div>
                  </div>

                  {/* Prova Social Config Card */}
                  <div className="rounded-[2rem] border border-slate-200 p-6 md:p-8 space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 shrink-0 text-blue-500" />
                          Prova Social de Compra
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Exiba notificações flutuantes simulando compras recentes de matrizes para incentivar vendas.</p>
                      </div>
                      
                      {/* Enable Switch */}
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, social_proof_enabled: settings.social_proof_enabled === 'true' ? 'false' : 'true' })}
                        className={`px-5 py-2.5 rounded-2xl border flex items-center gap-3 transition-all ${
                          settings.social_proof_enabled === 'true' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold text-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 font-bold text-xs'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          settings.social_proof_enabled === 'true' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {settings.social_proof_enabled === 'true' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        Notificações {settings.social_proof_enabled === 'true' ? 'Ativadas' : 'Desativadas'}
                      </button>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 space-y-4">
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                        Ao ativar este recurso, um widget discreto e moderno aparecerá no canto inferior esquerdo da tela pública, exibindo notificações periódicas de forma aleatória com base nos novos produtos adicionados à loja.
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Tempo de Alternância (segundos)</label>
                          <input
                            type="number"
                            min="5"
                            max="300"
                            placeholder="Padrão: 10"
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs font-bold"
                            value={settings.social_proof_delay || '10'}
                            onChange={e => setSettings({ ...settings, social_proof_delay: e.target.value })}
                          />
                          <p className="text-[9px] text-slate-400 font-semibold">Define o intervalo entre as notificações (mínimo 5s).</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider pt-2 border-t border-slate-200/30">
                        <span className={`w-2 h-2 rounded-full ${settings.social_proof_enabled === 'true' ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></span>
                        Status atual: {settings.social_proof_enabled === 'true' ? 'Visível para os clientes' : 'Oculto na loja'}
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




