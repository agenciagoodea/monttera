import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'pt' | 'en' | 'es';

interface I18nContextType {
  language: Language;
  t: (key: string) => string;
  changeLanguage: (lang: Language) => void;
  loading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Mapeamento de rotas equivalentes por idioma para redirecionamento correto
const routeMappings: Record<string, Record<Language, string>> = {
  '/': { pt: '/', en: '/en/', es: '/es/' },
  '/loja': { pt: '/loja', en: '/en/shop', es: '/es/tienda' },
  '/nossa-empresa': { pt: '/nossa-empresa', en: '/en/about-us', es: '/es/nuestra-empresa' },
  '/orcamento': { pt: '/orcamento', en: '/en/quote', es: '/es/presupuesto' },
  '/contato': { pt: '/contato', en: '/en/contact', es: '/es/contacto' },
  '/favoritos': { pt: '/favoritos', en: '/en/favorites', es: '/es/favoritos' },
  '/carrinho': { pt: '/carrinho', en: '/en/cart', es: '/es/carrito' },
  '/login': { pt: '/login', en: '/en/login', es: '/es/login' },
  '/cadastro': { pt: '/cadastro', en: '/en/register', es: '/es/cadastro' },
  '/ajuda': { pt: '/ajuda', en: '/en/help', es: '/es/ayuda' },
  '/politica': { pt: '/politica', en: '/en/policy', es: '/es/politica' },
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('pt');
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Detecta o idioma a partir da URL atual
  const detectLanguageFromPath = (path: string): Language => {
    if (path.startsWith('/en/') || path === '/en') return 'en';
    if (path.startsWith('/es/') || path === '/es') return 'es';
    return 'pt';
  };

  // Carrega as traduções estáticas assincronamente (Lazy Loading)
  const loadTranslations = async (lang: Language) => {
    setLoading(true);
    try {
      const res = await fetch(`/locales/${lang}.json`);
      if (!res.ok) throw new Error(`Could not load translations for ${lang}`);
      const data = await res.json();
      setTranslations(data);
    } catch (err) {
      console.error('[i18n] Failed to load translations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sincroniza o idioma baseado na URL na inicialização e em alterações do histórico
  useEffect(() => {
    const handleLocationChange = () => {
      const currentPath = window.location.pathname;
      const detected = detectLanguageFromPath(currentPath);
      if (detected !== language) {
        setLanguage(detected);
      }
    };

    handleLocationChange();

    // Ouvinte para navegação do navegador (botão voltar/avançar)
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Sempre que o idioma mudar, recarrega o dicionário correspondente
  useEffect(() => {
    loadTranslations(language);
    
    // Atualiza a tag HTML lang para acessibilidade
    const htmlLang = language === 'pt' ? 'pt-BR' : language;
    document.documentElement.setAttribute('lang', htmlLang);
  }, [language]);

  // Função de Tradução (t)
  const t = (key: string): string => {
    const keys = key.split('.');
    let result = translations;
    for (const k of keys) {
      if (result && result[k] !== undefined) {
        result = result[k];
      } else {
        return key; // Retorna a própria chave como fallback
      }
    }
    return typeof result === 'string' ? result : key;
  };

  // Função para Trocar Idioma (Manual)
  const changeLanguage = async (newLang: Language) => {
    if (newLang === language) return;

    // 1. Salvar preferência
    localStorage.setItem('lang_pref', newLang);
    // Configura o cookie lang_pref válido por 1 ano
    document.cookie = `lang_pref=${newLang};path=/;max-age=${60 * 60 * 24 * 365}`;

    // 2. Tentar salvar no perfil se o usuário estiver logado
    try {
      await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang }),
      });
    } catch (_) {}

    // 3. Enviar evento para Google Analytics se disponível
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'language_changed', {
        language: newLang,
        country: navigator.language,
        origin: 'selector'
      });
    }

    // 4. Redirecionar URL preservando rota se possível
    const currentPath = window.location.pathname;
    
    // Remove o prefixo de idioma atual da rota para análise
    let cleanPath = currentPath;
    if (cleanPath.startsWith('/en')) cleanPath = cleanPath.substring(3);
    else if (cleanPath.startsWith('/es')) cleanPath = cleanPath.substring(3);
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

    // Caso seja uma rota de produto (/produto/:slug ou /product/:slug ou /producto/:slug)
    const productMatch = currentPath.match(/^\/(?:en\/product|es\/producto|produto)\/([^/]+)/);
    if (productMatch) {
      const productSlug = productMatch[1];
      // Para produtos, buscamos a rota correspondente no backend (slug traduzido)
      try {
        const res = await fetch(`/api/products/slug-translation?slug=${productSlug}&targetLang=${newLang}`);
        const data = await res.json();
        if (data && data.translatedSlug) {
          const prefix = newLang === 'pt' ? '' : `/${newLang}`;
          const routeWord = newLang === 'en' ? 'product' : newLang === 'es' ? 'producto' : 'produto';
          window.location.href = `${prefix}/${routeWord}/${data.translatedSlug}${window.location.search}`;
          return;
        }
      } catch (e) {
        console.warn('[i18n] Failed to fetch product slug translation:', e);
      }
      
      // Fallback genérico para produto se a API de tradução falhar
      const prefix = newLang === 'pt' ? '' : `/${newLang}`;
      const routeWord = newLang === 'en' ? 'product' : newLang === 'es' ? 'producto' : 'produto';
      window.location.href = `${prefix}/${routeWord}/${productSlug}${window.location.search}`;
      return;
    }

    // Caso seja uma rota mapeada
    const mappedRoute = routeMappings[cleanPath];
    if (mappedRoute) {
      window.location.href = mappedRoute[newLang] + window.location.search;
      return;
    }

    // Fallback genérico para rotas não mapeadas
    const prefix = newLang === 'pt' ? '' : `/${newLang}`;
    window.location.href = `${prefix}${cleanPath}${window.location.search}`;
  };

  return (
    <I18nContext.Provider value={{ language, t, changeLanguage, loading }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
