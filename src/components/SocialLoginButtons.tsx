import React, { useState, useEffect } from 'react';

interface SocialLoginButtonsProps {
  /** Rota para redirecionar após login social. Ex: '/minha-conta', '/carrinho' */
  redirectTo?: string;
  /** Texto do divisor entre social e formulário tradicional */
  dividerText?: string;
  /** Classe CSS adicional para o wrapper */
  className?: string;
}

/**
 * Botões de login social reutilizáveis (Google + Facebook).
 * Redireciona o usuário para as rotas OAuth do backend.
 * Carrega dinamicamente a ativação de cada provedor a partir do banco de dados.
 */
export default function SocialLoginButtons({
  redirectTo = '/minha-conta',
  dividerText = 'ou continue com',
  className = '',
}: SocialLoginButtonsProps) {
  const [loading, setLoading] = useState<'google' | 'facebook' | null>(null);
  const [config, setConfig] = useState<{ google_enabled: boolean; facebook_enabled: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/auth/social/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => {
        console.error('Erro ao carregar configurações de login social:', err);
        // Fallback em caso de erro de rede
        setConfig({ google_enabled: false, facebook_enabled: false });
      });
  }, []);

  const handleSocialLogin = (provider: 'google' | 'facebook') => {
    setLoading(provider);
    const params = new URLSearchParams({ redirect: redirectTo });
    // Redireciona para o backend que inicia o fluxo OAuth
    window.location.href = `/api/auth/${provider}?${params.toString()}`;
  };

  // Se ainda estiver carregando a configuração, exibe um skeleton sutil
  if (config === null) {
    return (
      <div className={`w-full animate-pulse space-y-3 ${className}`}>
        <div className="h-12 bg-slate-100 rounded-2xl w-full" />
        <div className="h-12 bg-slate-100 rounded-2xl w-full" />
      </div>
    );
  }

  const { google_enabled, facebook_enabled } = config;

  // Se nenhum dos provedores estiver ativado no painel admin, não renderiza nada
  if (!google_enabled && !facebook_enabled) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Botão Google */}
      {google_enabled && (
        <button
          id={`btn-social-login-google`}
          type="button"
          disabled={loading !== null}
          onClick={() => handleSocialLogin('google')}
          className="
            w-full flex items-center justify-center gap-3
            bg-white border border-slate-200
            text-slate-700 font-bold text-sm
            py-3.5 px-4 rounded-2xl
            shadow-sm hover:shadow-md
            hover:border-slate-300 hover:bg-slate-50
            active:scale-[0.98]
            transition-all duration-200
            disabled:opacity-60 disabled:pointer-events-none
            mb-3
          "
          aria-label="Continuar com Google"
        >
          {loading === 'google' ? (
            <svg className="w-5 h-5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          <span>{loading === 'google' ? 'Aguarde...' : 'Continuar com Google'}</span>
        </button>
      )}

      {/* Botão Facebook */}
      {facebook_enabled && (
        <button
          id={`btn-social-login-facebook`}
          type="button"
          disabled={loading !== null}
          onClick={() => handleSocialLogin('facebook')}
          className="
            w-full flex items-center justify-center gap-3
            bg-[#1877F2] border border-[#1877F2]
            text-white font-bold text-sm
            py-3.5 px-4 rounded-2xl
            shadow-sm hover:shadow-md
            hover:bg-[#166FE5]
            active:scale-[0.98]
            transition-all duration-200
            disabled:opacity-60 disabled:pointer-events-none
          "
          aria-label="Continuar com Facebook"
        >
          {loading === 'facebook' ? (
            <svg className="w-5 h-5 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          )}
          <span>{loading === 'facebook' ? 'Aguarde...' : 'Continuar com Facebook'}</span>
        </button>
      )}

      {/* Divisor */}
      {(google_enabled || facebook_enabled) && (
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
            {dividerText}
          </span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
      )}
    </div>
  );
}
