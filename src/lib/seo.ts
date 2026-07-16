type SeoInput = {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  robots?: string;
  keywords?: string;
  siteName?: string;
  twitterCard?: string;
  ogType?: string;
  favicon?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const DEFAULT_SITE_URL = 'https://monttera.com.br';

function upsertMetaByName(name: string, content: string) {
  let node = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertMetaByProperty(property: string, content: string) {
  let node = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('property', property);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertCanonical(url: string) {
  let node = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', url);
}

function upsertAlternate(url: string | null) {
  let node = document.querySelector('link[rel="alternate"]') as HTMLLinkElement | null;
  if (!url) {
    if (node) node.remove();
    return;
  }
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'alternate');
    node.setAttribute('media', 'only screen and (max-width: 640px)');
    document.head.appendChild(node);
  }
  node.setAttribute('href', url);
}

function upsertFavicon(url: string) {
  let node = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'icon');
    document.head.appendChild(node);
  }
  node.setAttribute('href', url);
}

function upsertJsonLd(payload: Record<string, unknown> | Record<string, unknown>[]) {
  let node = document.querySelector('script[data-seo-jsonld="true"]') as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement('script');
    node.type = 'application/ld+json';
    node.setAttribute('data-seo-jsonld', 'true');
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(payload);
}

export function buildAbsoluteUrl(pathOrUrl?: string | null): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return DEFAULT_SITE_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${DEFAULT_SITE_URL}${raw}`;
  return `${DEFAULT_SITE_URL}/${raw}`;
}

export function applySeo(input: SeoInput) {
  const siteName = String(input.siteName || 'Monttera').trim();
  const title = String(input.title || siteName).trim();
  const description = String(input.description || 'Sua loja online completa com os melhores produtos e serviços.').trim();
  const image = buildAbsoluteUrl(input.image || '/uploads/seo-default-share.jpg');
  const keywords = String(input.keywords || '').trim();
  const twitterCard = String(input.twitterCard || 'summary_large_image').trim();
  const ogType = String(input.ogType || 'website').trim();
  const favicon = buildAbsoluteUrl(input.favicon || '/favicon.ico');

  // 1. Limpeza da URL canonical no frontend
  // Apenas preserva o parâmetro legítimo de categoria ('category') se ele estiver presente
  const urlParams = new URLSearchParams(window.location.search);
  let cleanSearch = '';
  if (urlParams.has('category')) {
    cleanSearch = `?category=${encodeURIComponent(urlParams.get('category') || '')}`;
  }

  let rawCanonical = input.canonical || window.location.pathname;
  let canonical = buildAbsoluteUrl(rawCanonical);

  try {
    const canonicalUrlObj = new URL(canonical);
    canonicalUrlObj.search = cleanSearch;
    canonical = canonicalUrlObj.toString();
  } catch (e) {
    console.warn('[SEO] Erro ao processar URL canonical:', e);
  }

  // Forçar canônico para o domínio desktop principal
  const desktopCanonical = canonical
    .replace('https://m.monttera.com.br', 'https://monttera.com.br')
    .replace('http://m.monttera.com.br', 'https://monttera.com.br');

  // 2. Determinação dinâmica do robots noindex
  let robots = String(input.robots || 'index,follow').trim();

  const pathLower = window.location.pathname.toLowerCase();
  const noindexPaths = [
    '/carrinho',
    '/checkout',
    '/cadastro',
    '/login',
    '/favoritos',
    '/minha-conta',
    '/admin',
    '/esqueci-senha',
    '/redefinir-senha',
    '/obrigado-compra'
  ];
  const isNoindexPath = noindexPaths.some(p => pathLower.startsWith(p));

  const noindexParams = ['nocache', 'add-to-cart', 'remove_item', 'redirect', 'pagenum'];
  const hasNoindexParam = noindexParams.some(param => urlParams.has(param));

  if (isNoindexPath || hasNoindexParam) {
    robots = 'noindex,follow';
  }

  document.title = title;
  upsertMetaByName('description', description);
  upsertMetaByName('robots', robots);
  if (keywords) upsertMetaByName('keywords', keywords);

  upsertMetaByProperty('og:type', ogType);
  upsertMetaByProperty('og:site_name', siteName);
  upsertMetaByProperty('og:title', title);
  upsertMetaByProperty('og:description', description);
  upsertMetaByProperty('og:url', desktopCanonical);
  upsertMetaByProperty('og:image', image);

  upsertMetaByName('twitter:card', twitterCard);
  upsertMetaByName('twitter:title', title);
  upsertMetaByName('twitter:description', description);
  upsertMetaByName('twitter:image', image);

  upsertCanonical(desktopCanonical);
  
  // Se for o host desktop, adiciona alternate apontando para o mobile
  const isMobileHost = window.location.hostname.startsWith('m.');
  if (!isMobileHost) {
    const mobileUrl = desktopCanonical.replace('https://monttera.com.br', 'https://m.monttera.com.br');
    upsertAlternate(mobileUrl);
  } else {
    upsertAlternate(null); // Remove alternate se for o mobile
  }

  upsertFavicon(favicon);
  if (input.jsonLd) upsertJsonLd(input.jsonLd);
}
