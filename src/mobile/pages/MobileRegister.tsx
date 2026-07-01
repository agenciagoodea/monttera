import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck, Phone, CreditCard } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import SocialLoginButtons from '../../components/SocialLoginButtons';

export default function MobileRegister() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [cookieAccepted, setCookieAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { settings } = useAppData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isMobile = window.location.search.includes('mobile=true');
  const rawRedirect = searchParams.get('redirect') || '/minha-conta';
  const redirectTo = isMobile && !rawRedirect.includes('mobile=true')
    ? `${rawRedirect}${rawRedirect.includes('?') ? '&' : '?'}mobile=true`
    : rawRedirect;

  const requireConsent = String(settings.lgpd_enabled || 'true') === 'true' && String(settings.lgpd_require_consent_register || 'true') === 'true';
  const requireTerms = requireConsent && String(settings.lgpd_require_terms_acceptance || 'true') === 'true';
  const requireCookies = requireConsent && String(settings.lgpd_require_cookie_consent || 'true') === 'true';
  const privacyUrl = settings.lgpd_privacy_url || '/politica';
  const termsUrl = settings.lgpd_terms_url || '/politica';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (requireConsent) {
      if (requireTerms && !termsAccepted) {
        setError('Você precisa aceitar os Termos de Uso para continuar.');
        return;
      }
      if (!privacyAccepted) {
        setError('Você precisa aceitar a Política de Privacidade para continuar.');
        return;
      }
      if (requireCookies && !cookieAccepted) {
        setError('Você precisa aceitar a Política de Cookies para continuar.');
        return;
      }
    }
    
    setLoading(true);
    try {
      await register({
        firstName,
        lastName,
        email,
        password,
        phone,
        cpf: isForeign ? '' : cpf,
        country: isForeign ? 'Estrangeiro' : 'Brasil',
        terms_accepted: termsAccepted,
        privacy_accepted: privacyAccepted,
        cookie_accepted: cookieAccepted,
        marketing_accepted: marketingAccepted,
      });
      const searchParamsObj = new URLSearchParams(window.location.search);
      const isMobile = searchParamsObj.get('mobile') === 'true';
      const redirectTo = searchParams.get('redirect');
      if (redirectTo && redirectTo.startsWith('/')) {
        const separator = redirectTo.includes('?') ? '&' : '?';
        navigate(isMobile && !redirectTo.includes('mobile=') ? `${redirectTo}${separator}mobile=true` : redirectTo);
      } else {
        navigate(isMobile ? '/minha-conta?mobile=true' : '/minha-conta');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Verifique seus dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-4 justify-center min-h-[80vh]">
      <div className="text-center flex flex-col items-center gap-2">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-md">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mt-2">Criar Conta</h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cadastre-se na maior vitrine de matrizes do Brasil</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center gap-3 text-xs font-bold animate-shake">
          <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Login social — opção rápida */}
      <SocialLoginButtons redirectTo={redirectTo} dividerText="ou preencha o formulário" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
            <div className="relative">
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full pl-10 pr-3 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
                placeholder="Nome"
              />
              <User className="absolute left-3.5 top-4.5 w-4 h-4 text-slate-300" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Sobrenome</label>
            <div className="relative">
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full pl-10 pr-3 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
                placeholder="Sobrenome"
              />
              <User className="absolute left-3.5 top-4.5 w-4 h-4 text-slate-300" />
            </div>
          </div>
        </div>

        {/* Checkbox Estrangeiro */}
        <div className="flex items-center gap-2.5 bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
          <input
            type="checkbox"
            id="isForeignMobile"
            checked={isForeign}
            onChange={(e) => {
              setIsForeign(e.target.checked);
              if (e.target.checked) setCpf('');
            }}
            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="isForeignMobile" className="text-[10px] font-bold text-slate-700 select-none cursor-pointer">
            Sou estrangeiro(a) / Resido fora do Brasil (Não possuo CPF)
          </label>
        </div>

        {/* Telefone e CPF */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
            <div className="relative">
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
                placeholder={isForeign ? "Código do país + número (ex: +1 555-0199)" : "(00) 00000-0000"}
              />
              <Phone className="absolute left-4 top-4.5 w-4.5 h-4.5 text-slate-300" />
            </div>
          </div>
          {!isForeign && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF</label>
              <div className="relative">
                <input
                  type="text"
                  required={!isForeign}
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
                  placeholder="000.000.000-00"
                />
                <CreditCard className="absolute left-4 top-4.5 w-4.5 h-4.5 text-slate-300" />
              </div>
            </div>
          )}
        </div>

        {/* Email Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Seu E-mail</label>
          <div className="relative">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
              placeholder="exemplo@email.com"
            />
            <Mail className="absolute left-4 top-4.5 w-4.5 h-4.5 text-slate-300" />
          </div>
        </div>

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 font-bold">Escolha uma Senha</label>
          <div className="relative">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
            />
            <Lock className="absolute left-4 top-4.5 w-4.5 h-4.5 text-slate-300" />
          </div>
        </div>

        {/* Consent/LGPD checkboxes for mobile */}
        {requireConsent && (
          <div className="mt-2 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <label className="flex items-start gap-2.5 text-[10px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Li e aceito os <a href={termsUrl} className="text-blue-600 underline">Termos de Uso</a>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-[10px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Li e aceito a <a href={privacyUrl} className="text-blue-600 underline">Política de Privacidade</a>
              </span>
            </label>
            {requireCookies && (
              <label className="flex items-start gap-2.5 text-[10px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={cookieAccepted}
                  onChange={(e) => setCookieAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Aceito a Política de Cookies</span>
              </label>
            )}
            <label className="flex items-start gap-2.5 text-[10px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={marketingAccepted}
                onChange={(e) => setMarketingAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>Aceito receber novidades e ofertas</span>
            </label>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-2"
        >
          {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="text-center mt-4">
        <p className="text-xs font-bold text-slate-500">
          Já tem uma conta?{' '}
          <Link 
            to={searchParams.get('redirect') ? `/login?redirect=${encodeURIComponent(searchParams.get('redirect')!)}${window.location.search.includes('mobile=true') ? '&mobile=true' : ''}` : `/login${window.location.search.includes('mobile=true') ? '?mobile=true' : ''}`} 
            className="text-blue-600 hover:underline"
          >
            Faça login
          </Link>
        </p>
      </div>
    </div>
  );
}
