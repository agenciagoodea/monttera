import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Lock, Mail, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import SocialLoginButtons from '../../components/SocialLoginButtons';

const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  csrf_invalid: 'Sessão de login expirada. Por favor, tente novamente.',
  not_configured: 'Este método de login não está disponível no momento.',
  no_email: 'Não foi possível obter seu e-mail. Tente usar o login tradicional.',
  token_invalid: 'Resposta inválida do provedor. Tente novamente.',
  server_error: 'Erro no servidor ao processar login social. Tente novamente.',
  access_denied: 'Acesso negado. Você cancelou o login social.',
  no_code: 'Código de autorização não recebido. Tente novamente.',
};

export default function MobileLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialProvider, setSocialProvider] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isMobile = window.location.search.includes('mobile=true');
  const rawRedirect = searchParams.get('redirect') || '/minha-conta';
  const redirectTo = isMobile && !rawRedirect.includes('mobile=true')
    ? `${rawRedirect}${rawRedirect.includes('?') ? '&' : '?'}mobile=true`
    : rawRedirect;

  useEffect(() => {
    const socialError = searchParams.get('social_error');
    const socialLogin = searchParams.get('social_login');
    const emailRequired = searchParams.get('social_email_required');

    if (socialLogin === 'success') {
      setSuccessMessage('Login realizado com sucesso!');
      setTimeout(() => navigate(redirectTo), 800);
      return;
    }
    if (socialError) {
      setError(SOCIAL_ERROR_MESSAGES[socialError] || `Erro no login social: ${socialError}`);
    }
    if (emailRequired) {
      setError('O Facebook não forneceu seu e-mail. Por favor, faça login com seu e-mail ou use o Google.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSocialProvider(null);
    setLoading(true);
    try {
      const payload: any = mfaRequired
        ? { email, password, mfa_code: mfaCode, mfa_challenge_id: mfaChallengeId }
        : { email, password };
      const user: any = await login(payload);
      if (user?.mfa_required) {
        setMfaRequired(true);
        setMfaChallengeId(Number(user?.mfa_challenge_id || 0) || null);
        setError(user?.message || 'Confirme o código MFA enviado por e-mail.');
        return;
      }
      
      if (user.type === 'user') {
        navigate('/admin');
      } else {
        navigate(redirectTo);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login. Verifique seus dados.');
      // Detectar se o erro indica provedor social
      const match = (err.message || '').match(/via (google|facebook)/i);
      if (match) setSocialProvider(match[1].toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-4 justify-center min-h-[70vh]">
      <div className="text-center flex flex-col items-center gap-2">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-md">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mt-2">Identificação</h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Acesse sua conta para baixar e comprar matrizes</p>
      </div>

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-100 text-green-700 rounded-2xl flex items-center gap-3 text-xs font-bold">
          <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex flex-col gap-2 text-xs font-bold animate-shake">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {socialProvider && (
            <a
              href={`/api/auth/${socialProvider}?redirect=${encodeURIComponent(redirectTo)}`}
              className="ml-7.5 inline-flex items-center gap-1 text-blue-600 hover:underline text-[10px]"
            >
              → Entrar com {socialProvider === 'google' ? 'Google' : 'Facebook'}
            </a>
          )}
        </div>
      )}

      {/* Botões sociais */}
      <SocialLoginButtons redirectTo={redirectTo} dividerText="ou entre com e-mail" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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

        {/* MFA Code if Required */}
        {mfaRequired && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 font-bold">Código de Segurança</label>
            <input
              type="text"
              required={mfaRequired}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl text-center text-lg font-black tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
        )}

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center ml-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sua Senha</label>
            <Link to="/esqueci-senha" className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">Esqueceu?</Link>
          </div>
          <div className="relative">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold"
              placeholder="••••••••"
            />
            <Lock className="absolute left-4 top-4.5 w-4.5 h-4.5 text-slate-300" />
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-2"
        >
          {loading ? 'Entrando...' : 'Entrar na minha conta'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="text-center mt-6">
        <p className="text-xs font-bold text-slate-500">
          Ainda não tem uma conta?{' '}
          <Link 
            to={searchParams.get('redirect') ? `/cadastro?redirect=${encodeURIComponent(searchParams.get('redirect')!)}${window.location.search.includes('mobile=true') ? '&mobile=true' : ''}` : `/cadastro${window.location.search.includes('mobile=true') ? '?mobile=true' : ''}`}
            className="text-blue-600 hover:underline"
          >
            Cadastre-se grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
