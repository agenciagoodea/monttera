import React, { useEffect, useState } from 'react';
import { Cookie, ShieldCheck } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

type CookiePreferences = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
};

const defaultPreferences: CookiePreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

function parseBool(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export default function CookieConsentBanner() {
  const { settings } = useAppData();
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);
  const [customizing, setCustomizing] = useState(false);
  const [versionKey, setVersionKey] = useState('v1');

  const enabled = parseBool(settings.lgpd_enabled, true);
  const requireCookieConsent = parseBool(settings.lgpd_require_cookie_consent, true);
  const cookiePolicyUrl = settings.lgpd_cookie_policy_url || '/politica';

  useEffect(() => {
    let active = true;
    async function loadPolicyVersion() {
      try {
        const res = await fetch('/api/lgpd/policies/active');
        const data = await res.json().catch(() => ({}));
        const version = data?.versions?.cookies || settings.lgpd_policy_version_cookies || '1.0';
        if (!active) return;
        const key = `cookie_consent_${version}`;
        setVersionKey(key);
        setOpen(enabled && requireCookieConsent && !localStorage.getItem(key));
      } catch {
        const fallbackVersion = settings.lgpd_policy_version_cookies || '1.0';
        const key = `cookie_consent_${fallbackVersion}`;
        if (!active) return;
        setVersionKey(key);
        setOpen(enabled && requireCookieConsent && !localStorage.getItem(key));
      }
    }
    loadPolicyVersion();
    return () => {
      active = false;
    };
  }, [enabled, requireCookieConsent, settings.lgpd_policy_version_cookies]);

  async function persistConsent(next: CookiePreferences) {
    localStorage.setItem(versionKey, JSON.stringify(next));
    localStorage.setItem('cookie_preferences', JSON.stringify(next));
    setOpen(false);
    try {
      await fetch('/api/lgpd/cookies/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: {
            necessary: true,
            statistics: next.analytics,
            marketing: next.marketing,
            preferences: next.preferences,
          },
        }),
      });
    } catch {
      // Não bloqueia UX se gravação de log falhar
    }
  }

  if (!open || !enabled || !requireCookieConsent) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-blue-100 p-2 text-blue-700">
            <Cookie className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Preferências de cookies</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Utilizamos cookies necessários e opcionais para melhorar sua experiência. Você pode personalizar as permissões.
            </p>
            <a href={cookiePolicyUrl} className="mt-1 inline-flex text-xs font-black text-blue-600 underline">
              Ver política de cookies
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCustomizing((prev) => !prev)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600"
          >
            {customizing ? 'Ocultar opções' : 'Personalizar'}
          </button>
          <button
            type="button"
            onClick={() => persistConsent({ ...defaultPreferences, analytics: false, marketing: false, preferences: false })}
            className="rounded-xl border border-slate-300 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600"
          >
            Rejeitar opcionais
          </button>
          <button
            type="button"
            onClick={() => persistConsent({ ...defaultPreferences, analytics: true, marketing: true, preferences: true })}
            className="rounded-xl bg-blue-600 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white"
          >
            Aceitar todos
          </button>
        </div>
      </div>

      {customizing && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <CookieToggle label="Estatísticos" value={preferences.analytics} onChange={(v) => setPreferences((prev) => ({ ...prev, analytics: v }))} />
          <CookieToggle label="Marketing" value={preferences.marketing} onChange={(v) => setPreferences((prev) => ({ ...prev, marketing: v }))} />
          <CookieToggle label="Preferências" value={preferences.preferences} onChange={(v) => setPreferences((prev) => ({ ...prev, preferences: v }))} />
          <button
            type="button"
            onClick={() => persistConsent({ ...preferences, necessary: true })}
            className="md:col-span-3 mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white"
          >
            <ShieldCheck className="h-4 w-4" />
            Salvar preferências
          </button>
        </div>
      )}
    </div>
  );
}

function CookieToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-xs font-black text-slate-700">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
