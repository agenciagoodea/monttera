import React, { useEffect, useState } from 'react';
import { Laptop, Smartphone, X } from 'lucide-react';

function getCookie(name: string): string {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || '';
  return '';
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  const domain = window.location.hostname.endsWith('monttera.com.br') 
    ? '; domain=.monttera.com.br' 
    : (window.location.hostname.includes('.') ? `; domain=.${window.location.hostname.split('.').slice(-2).join('.')}` : '');
  document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/${domain}`;
}

function removeCookie(name: string) {
  const domain = window.location.hostname.endsWith('monttera.com.br') 
    ? '; domain=.monttera.com.br' 
    : (window.location.hostname.includes('.') ? `; domain=.${window.location.hostname.split('.').slice(-2).join('.')}` : '');
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domain}`;
}

export default function MobileRedirectBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [mode, setMode] = useState<'desktop' | 'mobile' | null>(null);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isMobileHost = hostname.startsWith('m.');
    const preferDesktop = getCookie('prefer_desktop') === 'true';
    const userAgent = navigator.userAgent || '';
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Mobi/i.test(userAgent);

    if (isMobileHost) {
      // Estamos na versão mobile. Oferecer opção de ir para o desktop.
      setMode('desktop');
      setShowBanner(true);
    } else if (!isMobileHost && isMobileDevice && preferDesktop) {
      // Estamos na versão desktop, mas o dispositivo é celular e prefer_desktop está ativo.
      // Oferecer opção de voltar para a versão mobile.
      setMode('mobile');
      setShowBanner(true);
    }
  }, []);

  const handleSwitchMode = () => {
    const currentPath = window.location.pathname + window.location.search;
    
    if (mode === 'desktop') {
      // Usuário está no celular (versão mobile) e deseja forçar o desktop
      const baseHostname = window.location.hostname.replace(/^m\./, '');
      setCookie('prefer_desktop', 'true', 30);
      window.location.href = `https://${baseHostname}${currentPath}`;
    } else if (mode === 'mobile') {
      // Usuário está no celular (versão desktop) e deseja retornar para o mobile
      const baseHostname = window.location.hostname.replace(/^m\./, '');
      removeCookie('prefer_desktop');
      window.location.href = `https://m.${baseHostname}${currentPath}`;
    }
  };

  if (!showBanner || !mode) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md animate-in fade-in slide-in-from-bottom duration-500">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-slate-800 text-blue-400 flex-shrink-0">
            {mode === 'desktop' ? <Laptop className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Preferência de Tela</span>
            <p className="text-[11px] font-bold text-slate-100 mt-0.5 truncate">
              {mode === 'desktop' 
                ? 'Deseja visualizar a versão para computador?' 
                : 'Deseja retornar para a versão otimizada mobile?'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSwitchMode}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest transition-colors flex-shrink-0"
          >
            {mode === 'desktop' ? 'Versão PC' : 'Versão Mobile'}
          </button>
          <button
            onClick={() => setShowBanner(false)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
