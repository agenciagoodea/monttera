import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        terms_accepted: termsAccepted,
        privacy_accepted: privacyAccepted,
        cookie_accepted: cookieAccepted,
        marketing_accepted: marketingAccepted,
      });
      const redirectTo = searchParams.get('redirect');
      if (redirectTo && redirectTo.startsWith('/')) {
        navigate(redirectTo);
      } else {
        navigate('/minha-conta');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-4 py-12 text-slate-800">
      <div className="max-w-xl w-full bg-white rounded-[2.5rem] border border-blue-50 shadow-2xl overflow-hidden">
        <div className="p-8 md:p-12">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-slate-800 uppercase tracking-tight mb-3">Criar Conta</h2>
            <p className="text-slate-500 font-medium">Junte-se à maior comunidade de bordadeiras do Brasil.</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-3xl flex items-center gap-3 text-sm font-bold animate-shake">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                    placeholder="Seu nome"
                  />
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sobrenome</label>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                    placeholder="Seu sobrenome"
                  />
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
              <div className="relative group">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                  placeholder="exemplo@email.com"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sua Senha</label>
              <div className="relative group">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-medium"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="pt-4">
              {requireConsent && (
                <div className="mb-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Li e concordo com os <a href={termsUrl} className="text-blue-600 underline">Termos de Uso</a>.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Li e concordo com a <a href={privacyUrl} className="text-blue-600 underline">Política de Privacidade</a>.
                    </span>
                  </label>
                  {requireCookies && (
                    <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={cookieAccepted}
                        onChange={(e) => setCookieAccepted(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Aceito a Política de Cookies.</span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={marketingAccepted}
                      onChange={(e) => setMarketingAccepted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Aceito receber ofertas e comunicações.</span>
                  </label>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-3"
              >
                {loading ? 'Processando...' : 'Criar minha conta agora'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>

          <p className="mt-10 text-center text-sm font-bold text-slate-500">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-blue-600 hover:underline">Entre agora!</Link>
          </p>

          <div className="mt-12 pt-8 border-t border-slate-50">
             <p className="text-[10px] text-slate-400 text-center leading-relaxed">
               Ao se cadastrar, você concorda com nossos <a href="#" className="underline">Termos de Uso</a> e <a href="#" className="underline">Política de Privacidade</a>. Seus dados estão protegidos.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
