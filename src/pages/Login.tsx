import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import SocialLoginButtons from '../components/SocialLoginButtons';

const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  csrf_invalid: 'Sessão de login expirada. Por favor, tente novamente.',
  not_configured: 'Este método de login não está disponível no momento.',
  no_email: 'Não foi possível obter seu e-mail. Tente usar o login tradicional.',
  token_invalid: 'Resposta inválida do provedor. Tente novamente.',
  server_error: 'Erro no servidor ao processar login social. Tente novamente.',
  access_denied: 'Acesso negado. Você cancelou o login social.',
  no_code: 'Código de autorização não recebido. Tente novamente.',
};

export default function Login() {
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

  useEffect(() => {
    const socialError = searchParams.get('social_error');
    const socialLogin = searchParams.get('social_login');
    const emailRequired = searchParams.get('social_email_required');
    const redirectTo = searchParams.get('redirect') || '/minha-conta';

    if (socialLogin === 'success') {
      setSuccessMessage('Login realizado com sucesso!');
      setTimeout(() => navigate(redirectTo), 800);
      return;
    }
    if (socialError) {
      setError(SOCIAL_ERROR_MESSAGES[socialError] || `Erro no login social: ${socialError}`);
    }
    if (emailRequired) {
      setError('O Facebook não forneceu seu e-mail. Por favor, faça login com seu e-mail e senha ou use o Google.');
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
        navigate('/minha-conta');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
      // Detectar se o erro indica provedor social
      const match = (err.message || '').match(/via (google|facebook)/i);
      if (match) setSocialProvider(match[1].toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  const redirectTo = searchParams.get('redirect') || '/minha-conta';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-blue-50 shadow-2xl overflow-hidden">
        <div className="p-8 md:p-10">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-2">Login</h2>
            <p className="text-slate-500 font-medium">Bem-vindo de volta ao Digital Bordados</p>
          </div>

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-100 text-green-700 rounded-2xl flex items-center gap-3 text-sm font-bold">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex flex-col gap-2 text-sm font-bold animate-shake">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {socialProvider && (
                <a
                  href={`/api/auth/${socialProvider}?redirect=${encodeURIComponent(redirectTo)}`}
                  className="ml-8 inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                >
                  → Entrar com {socialProvider === 'google' ? 'Google' : 'Facebook'}
                </a>
              )}
            </div>
          )}

          {/* Botões sociais */}
          <SocialLoginButtons redirectTo={redirectTo} dividerText="ou entre com e-mail" />

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
              <div className="relative group">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                  placeholder="exemplo@email.com"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            {mfaRequired && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código MFA</label>
                <div className="relative group">
                  <input
                    type="text"
                    required={mfaRequired}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-4 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
                <Link to="/esqueci-senha" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Esqueceu?</Link>
              </div>
              <div className="relative group">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                  placeholder="••••••••"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? 'Aguarde...' : 'Entrar no Painel'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm font-bold text-slate-500">
              Não tem uma conta?{' '}
              <Link to="/cadastro" className="text-blue-600 hover:underline">Cadastre-se grátis!</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
