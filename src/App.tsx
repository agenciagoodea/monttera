import { useEffect, useState, lazy, Suspense } from 'react';
import MobileLayout from './mobile/layout/MobileLayout';
import MobileHome from './mobile/pages/MobileHome';
import MobileCategories from './mobile/pages/MobileCategories';
import MobileSearch from './mobile/pages/MobileSearch';
import MobileLogin from './mobile/pages/MobileLogin';
import MobileRegister from './mobile/pages/MobileRegister';
import MobileCart from './mobile/pages/MobileCart';
import MobileMyAccount from './mobile/pages/MobileMyAccount';
import MobileProductDetail from './mobile/pages/MobileProductDetail';
import { formatCurrency } from './lib/utils';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import CookieConsentBanner from './components/CookieConsentBanner';
import MobileRedirectBanner from './components/MobileRedirectBanner';
import WhatsAppWidget from './components/WhatsAppWidget';
import SocialProofNotification from './components/SocialProofNotification';

// Lazy load pages
const Home = lazy(() => import('./pages/Home'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const CartPage = lazy(() => import('./pages/CartPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const MyAccount = lazy(() => import('./pages/MyAccount'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PayPalSuccess = lazy(() => import('./pages/PayPalSuccess'));
const PayPalCancel = lazy(() => import('./pages/PayPalCancel'));
const ThankYouPage = lazy(() => import('./pages/ThankYouPage'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const DataDeletion = lazy(() => import('./pages/DataDeletion'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));

// Admin Pages (Lazy)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProductList = lazy(() => import('./pages/admin/AdminProductList'));
const AdminProductForm = lazy(() => import('./pages/admin/AdminProductForm'));
const AdminCategoryList = lazy(() => import('./pages/admin/AdminCategoryList'));
const AdminTagList = lazy(() => import('./pages/admin/AdminTagList'));
const AdminOrderList = lazy(() => import('./pages/admin/AdminOrderList'));
const AdminUserList = lazy(() => import('./pages/admin/AdminUserList'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminFiles = lazy(() => import('./pages/admin/AdminFiles'));
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminSeoDashboard = lazy(() => import('./pages/admin/AdminSeoDashboard'));
const AdminFaqList = lazy(() => import('./pages/admin/AdminFaqList'));
const AdminBlogList = lazy(() => import('./pages/admin/AdminBlogList'));

import AdminLayout from './layouts/AdminLayout';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { AppDataProvider } from './contexts/AppDataContext';
import { useAuth } from './contexts/AuthContext';
import { useAppData } from './contexts/AppDataContext';
import { applySeo } from './lib/seo';
import { I18nProvider, useI18n } from './contexts/I18nContext';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white/50 backdrop-blur-sm fixed inset-0 z-50">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-lg shadow-blue-600/20"></div>
  </div>
);

function RequireRegisteredUser({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) {
    const isMobile = location.search.includes('mobile=true') || window.location.hostname === 'm.digitalbordados.com.br';
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    const target = isMobile 
      ? `/cadastro?redirect=${redirect}&mobile=true` 
      : `/cadastro?redirect=${redirect}`;
    return <Navigate to={target} replace />;
  }
  return children;
}

function RouteSeoDefaults() {
  const location = useLocation();
  const { settings } = useAppData();
  const { language, t } = useI18n();

  useEffect(() => {
    // Carregar configurações localizadas do banco se existirem
    const suffix = language === 'pt' ? '' : `_${language}`;
    const siteNameKey = `site_name${suffix}`;
    const siteDescKey = `site_description${suffix}`;
    const seoTitleKey = `seo_meta_title${suffix}`;
    const seoDescKey = `seo_meta_description${suffix}`;
    const seoKeywordsKey = `seo_keywords${suffix}`;

    const siteName = String(settings[siteNameKey] || settings.site_name || 'Digital Bordados').trim();
    const appUrl = String(settings.app_url || window.location.origin).replace(/\/+$/, '');
    
    const baseDescription = String(
      settings[seoDescKey] || settings[siteDescKey] || settings.site_description || 'Matrizes de bordado digitais para produção profissional.'
    ).trim();

    const path = location.pathname;
    
    // Expressões regulares para mapear SEO multilíngue
    const seoByRoute: Array<{ match: RegExp; title: string; description: string; robots?: string }> = [
      { match: /^\/(?:en|es)?\/?$/, title: `${siteName} | ${t('common.home')}`, description: baseDescription },
      { match: /^\/(?:en\/shop|es\/tienda|loja)/, title: `${t('common.shop')} | ${siteName}`, description: t('common.search_placeholder') },
      { match: /^\/(?:en\/quote|es\/presupuesto|orcamento)/, title: `${t('common.quote')} | ${siteName}`, description: t('help_page.subtitle') },
      { match: /^\/(?:en\/contact|es\/contacto|contato)/, title: `${t('common.contact')} | ${siteName}`, description: t('help_page.subtitle') },
      { match: /^\/(?:en\/about-us|es\/nuestra-empresa|nossa-empresa)/, title: `${t('common.about_us')} | ${siteName}`, description: t('footer.intro_text') },
      { match: /^\/(?:en\/product|es\/producto|produto)\//, title: `${siteName} | ${t('common.shop')}`, description: baseDescription },
      { match: /^\/(?:en\/favorites|es\/favoritos|favoritos)/, title: `${t('common.favorites')} | ${siteName}`, description: 'Favorites list', robots: 'noindex,follow' },
      { match: /^\/(?:en\/cart|es\/carrito|carrinho)/, title: `${t('common.cart')} | ${siteName}`, description: 'Shopping cart', robots: 'noindex,follow' },
      { match: /^\/(?:en\/checkout|es\/checkout|checkout)/, title: `${t('checkout_page.title')} | ${siteName}`, description: 'Checkout', robots: 'noindex,follow' },
      { match: /^\/(?:en\/thank-you|es\/obrigado-compra|obrigado-compra)/, title: `${t('common.my_account')} | ${siteName}`, description: 'Order confirmation', robots: 'noindex,follow' },
      { match: /^\/(?:en\/login|es\/login|login)/, title: `${t('common.login')} | ${siteName}`, description: 'Login', robots: 'noindex,follow' },
      { match: /^\/(?:en\/register|es\/cadastro|cadastro)/, title: `${t('common.register')} | ${siteName}`, description: 'Register', robots: 'noindex,follow' },
      { match: /^\/(?:en\/forgot-password|es\/esqueci-senha|esqueci-senha)/, title: `${t('common.login')} | ${siteName}`, description: 'Forgot password', robots: 'noindex,follow' },
      { match: /^\/(?:en\/reset-password|es\/redefinir-senha|redefinir-senha)/, title: `${t('common.login')} | ${siteName}`, description: 'Reset password', robots: 'noindex,follow' },
      { match: /^\/(?:en\/my-account|es\/mi-cuenta|minha-conta)/, title: `${t('common.my_account')} | ${siteName}`, description: 'My account', robots: 'noindex,follow' },
      { match: /^\/admin/, title: `Admin | ${siteName}`, description: 'Admin panel', robots: 'noindex,follow' },
    ];

    const selected = seoByRoute.find((entry) => entry.match.test(path));

    const shouldRenderOrganizationSchema = String(settings.seo_enable_organization_schema || 'true').toLowerCase() === 'true';
    const organizationName = String(settings.seo_organization_name || siteName).trim();
    const organizationLogo = String(settings.seo_organization_logo || settings.logo_url || settings.seo_og_image || '/uploads/seo-default-share.jpg').trim();
    const organizationSchema = shouldRenderOrganizationSchema
      ? {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: organizationName,
          url: appUrl,
          logo: organizationLogo.startsWith('http')
            ? organizationLogo
            : `${appUrl}${organizationLogo.startsWith('/') ? '' : '/'}${organizationLogo}`,
          sameAs: [settings.seo_facebook_url, settings.seo_instagram_url, settings.seo_twitter_url].filter(Boolean),
        }
      : undefined;

    applySeo({
      title: selected?.title || `${siteName} | Página`,
      description: selected?.description || baseDescription,
      robots: selected?.robots || 'index,follow',
      canonical: path,
      siteName,
      image: String(settings.seo_og_image || settings.logo_url || '/uploads/seo-default-share.jpg'),
      favicon: String((settings as any).favicon_url || '/favicon.ico'),
      twitterCard: String(settings.seo_twitter_card || 'summary_large_image'),
      keywords: String(settings[seoKeywordsKey] || settings.seo_keywords || ''),
      jsonLd: organizationSchema,
    });
  }, [location.pathname, location.search, settings, language]);

  return null;
}

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    // Ignorar rotas do admin ou APIs
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      return;
    }

    // Pequeno timeout para garantir que o título da página foi atualizado
    const timer = setTimeout(() => {
      fetch('/api/analytics/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          full_url: window.location.href,
          page_title: document.title || 'Digital Bordados',
          referrer: document.referrer || '',
        }),
      }).catch((err) => {
        console.warn('[Analytics] Falha ao registrar visita:', err);
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [location.pathname, location.search]);

  return null;
}

function GlobalFaviconSync() {
  const { settings } = useAppData();

  useEffect(() => {
    const raw = String((settings as any).favicon_url || '/favicon.ico').trim();
    if (!raw) return;
    const href = raw.startsWith('http') ? raw : `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
    let node = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!node) {
      node = document.createElement('link');
      node.setAttribute('rel', 'icon');
      document.head.appendChild(node);
    }
    node.setAttribute('href', href);
  }, [settings]);

  return null;
}

import { Link } from 'react-router-dom';

function LinkToCategories() {
  const { categories } = useAppData();
  return (
    <>
      {categories.map((cat) => (
        <Link
          key={cat.id}
          to={`/?category=${cat.slug}&page=1&mobile=true`}
          className="p-4 bg-white border border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center active:scale-95 transition-transform"
        >
          <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">{cat.name}</span>
        </Link>
      ))}
    </>
  );
}

import { Search, Loader2 } from 'lucide-react';

function MobileSearchBox() {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.trim().length >= 2) {
        setIsSearching(true);
        try {
          const response = await fetch(`/api/products/search?q=${encodeURIComponent(search.trim())}`);
          const data = await response.json();
          setSearchResults(Array.isArray(data) ? data : (data.products || []));
        } catch (error) {
          console.error('Erro na busca:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Pesquisar matrizes (ex: flores, infantil, times)..."
          className="w-full pl-5 pr-12 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="absolute right-3 top-2.5 p-2 bg-blue-600 text-white rounded-xl shadow-md">
          {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </div>
      </div>

      {search.trim().length >= 2 && (
        <div className="flex flex-col gap-2">
          {searchResults.length > 0 ? (
            searchResults.map((prod) => (
              <Link
                key={prod.id}
                to={`/produto/${prod.slug}?mobile=true`}
                onClick={() => setSearch('')}
                className="flex items-center gap-3 p-2 bg-white border border-slate-50 rounded-xl active:scale-[0.99] transition-transform"
              >
                <img src={prod.image} alt={prod.name} className="w-12 h-12 rounded-lg object-cover bg-slate-50" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{prod.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{prod.category_name}</p>
                </div>
                <span className="text-xs font-black text-slate-900">{formatCurrency(Number(prod.sale_price || prod.price))}</span>
              </Link>
            ))
          ) : !isSearching ? (
            <p className="text-center py-6 text-xs text-slate-400 font-bold">Nenhum resultado encontrado.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isMobileHost = window.location.hostname === 'm.digitalbordados.com.br' || window.location.search.includes('mobile=true');

  if (isMobileHost) {
    return (
      <Router>
        <AuthProvider>
          <AppDataProvider>
            <I18nProvider>
              <FavoritesProvider>
                <CartProvider>
                  <GlobalFaviconSync />
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/*" element={
                        <MobileLayout>
                          <RouteSeoDefaults />
                          <AnalyticsTracker />
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              {/* PT Routes */}
                              <Route path="/" element={<MobileHome />} />
                              <Route path="/categorias" element={<MobileCategories />} />
                              <Route path="/busca" element={<MobileSearch />} />
                              <Route path="/login" element={<MobileLogin />} />
                              <Route path="/cadastro" element={<MobileRegister />} />
                              <Route path="/esqueci-senha" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
                              <Route path="/redefinir-senha" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
                              <Route path="/carrinho" element={<RequireRegisteredUser><MobileCart /></RequireRegisteredUser>} />
                              <Route path="/favoritos" element={<Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>} />
                              <Route path="/minha-conta/*" element={<RequireRegisteredUser><MobileMyAccount /></RequireRegisteredUser>} />
                              <Route path="/produto/:slug" element={<MobileProductDetail />} />
                              <Route path="/politica" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
                              <Route path="/exclusao-dados" element={<Suspense fallback={<PageLoader />}><DataDeletion /></Suspense>} />
                              <Route path="/ajuda" element={<Suspense fallback={<PageLoader />}><HelpPage /></Suspense>} />
                              <Route path="/nossa-empresa" element={<Suspense fallback={<PageLoader />}><CompanyPage /></Suspense>} />
                              <Route path="/orcamento" element={<Suspense fallback={<PageLoader />}><BudgetPage /></Suspense>} />
                              <Route path="/contato" element={<Suspense fallback={<PageLoader />}><ContactPage /></Suspense>} />
                              <Route path="/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/obrigado-compra" element={<ThankYouPage />} />

                              {/* EN Routes */}
                              <Route path="/en" element={<MobileHome />} />
                              <Route path="/en/categories" element={<MobileCategories />} />
                              <Route path="/en/search" element={<MobileSearch />} />
                              <Route path="/en/login" element={<MobileLogin />} />
                              <Route path="/en/register" element={<MobileRegister />} />
                              <Route path="/en/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
                              <Route path="/en/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
                              <Route path="/en/cart" element={<RequireRegisteredUser><MobileCart /></RequireRegisteredUser>} />
                              <Route path="/en/favorites" element={<Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>} />
                              <Route path="/en/my-account/*" element={<RequireRegisteredUser><MobileMyAccount /></RequireRegisteredUser>} />
                              <Route path="/en/product/:slug" element={<MobileProductDetail />} />
                              <Route path="/en/policy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
                              <Route path="/en/data-deletion" element={<Suspense fallback={<PageLoader />}><DataDeletion /></Suspense>} />
                              <Route path="/en/help" element={<Suspense fallback={<PageLoader />}><HelpPage /></Suspense>} />
                              <Route path="/en/about-us" element={<Suspense fallback={<PageLoader />}><CompanyPage /></Suspense>} />
                              <Route path="/en/quote" element={<Suspense fallback={<PageLoader />}><BudgetPage /></Suspense>} />
                              <Route path="/en/contact" element={<Suspense fallback={<PageLoader />}><ContactPage /></Suspense>} />
                              <Route path="/en/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/en/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/en/thank-you" element={<ThankYouPage />} />

                              {/* ES Routes */}
                              <Route path="/es" element={<MobileHome />} />
                              <Route path="/es/categorias" element={<MobileCategories />} />
                              <Route path="/es/busca" element={<MobileSearch />} />
                              <Route path="/es/login" element={<MobileLogin />} />
                              <Route path="/es/cadastro" element={<MobileRegister />} />
                              <Route path="/es/esqueci-senha" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
                              <Route path="/es/redefinir-senha" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
                              <Route path="/es/carrito" element={<RequireRegisteredUser><MobileCart /></RequireRegisteredUser>} />
                              <Route path="/es/favoritos" element={<Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>} />
                              <Route path="/es/mi-cuenta/*" element={<RequireRegisteredUser><MobileMyAccount /></RequireRegisteredUser>} />
                              <Route path="/es/producto/:slug" element={<MobileProductDetail />} />
                              <Route path="/es/politica" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
                              <Route path="/es/exclusao-dados" element={<Suspense fallback={<PageLoader />}><DataDeletion /></Suspense>} />
                              <Route path="/es/ayuda" element={<Suspense fallback={<PageLoader />}><HelpPage /></Suspense>} />
                              <Route path="/es/nuestra-empresa" element={<Suspense fallback={<PageLoader />}><CompanyPage /></Suspense>} />
                              <Route path="/es/presupuesto" element={<Suspense fallback={<PageLoader />}><BudgetPage /></Suspense>} />
                              <Route path="/es/contacto" element={<Suspense fallback={<PageLoader />}><ContactPage /></Suspense>} />
                              <Route path="/es/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/es/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/es/obrigado-compra" element={<ThankYouPage />} />

                              <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                          </Suspense>
                          <WhatsAppWidget />
                          <SocialProofNotification />
                        </MobileLayout>
                      } />
                    </Routes>
                  </Suspense>
                </CartProvider>
              </FavoritesProvider>
            </I18nProvider>
          </AppDataProvider>
        </AuthProvider>
      </Router>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <AppDataProvider>
          <I18nProvider>
            <FavoritesProvider>
              <CartProvider>
                <GlobalFaviconSync />
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Admin Routes */}
                    <Route path="/admin/*" element={
                      <AdminLayout>
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/" element={<AdminDashboard />} />
                            <Route path="/produtos" element={<AdminProductList />} />
                            <Route path="/produtos/novo" element={<AdminProductForm />} />
                            <Route path="/produtos/editar/:id" element={<AdminProductForm />} />
                            <Route path="/categorias" element={<AdminCategoryList />} />
                            <Route path="/faq" element={<AdminFaqList />} />
                            <Route path="/blog" element={<AdminBlogList />} />
                            <Route path="/tags" element={<AdminTagList />} />
                            <Route path="/pedidos" element={<AdminOrderList />} />
                            <Route path="/clientes" element={<AdminUserList />} />
                            <Route path="/avaliacoes" element={<AdminReviews />} />
                            <Route path="/estatisticas" element={<AdminAnalytics />} />
                            <Route path="/seo" element={<AdminSeoDashboard />} />
                            <Route path="/relatorios" element={<AdminReports />} />
                            <Route path="/arquivos" element={<AdminFiles />} />
                            <Route path="/configuracoes" element={<AdminSettings />} />
                          </Routes>
                        </Suspense>
                      </AdminLayout>
                    } />

                    {/* Public Routes */}
                    <Route path="/*" element={
                      <div className="min-h-screen bg-white font-sans text-gray-900 scroll-smooth flex flex-col">
                        <RouteSeoDefaults />
                        <AnalyticsTracker />
                        <Header />
                        <div className="flex-1">
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              {/* PT Routes */}
                              <Route path="/" element={<Home />} />
                              <Route path="/loja" element={<ShopPage />} />
                              <Route path="/orcamento" element={<BudgetPage />} />
                              <Route path="/contato" element={<ContactPage />} />
                              <Route path="/nossa-empresa" element={<CompanyPage />} />
                              <Route path="/produto/:slug" element={<ProductDetail />} />
                              <Route path="/carrinho" element={<RequireRegisteredUser><CartPage /></RequireRegisteredUser>} />
                              <Route path="/favoritos" element={<FavoritesPage />} />
                              <Route path="/minha-conta" element={<MyAccount />} />
                              <Route path="/minha-conta/pedidos" element={<MyAccount />} />
                              <Route path="/minha-conta/downloads" element={<MyAccount />} />
                              <Route path="/minha-conta/enderecos" element={<MyAccount />} />
                              <Route path="/minha-conta/perfil" element={<MyAccount />} />
                              <Route path="/minha-conta/privacidade" element={<MyAccount />} />
                              <Route path="/minha-conta/lista-de-desejos" element={<MyAccount />} />
                              <Route path="/login" element={<Login />} />
                              <Route path="/cadastro" element={<Register />} />
                              <Route path="/esqueci-senha" element={<ForgotPassword />} />
                              <Route path="/redefinir-senha" element={<ResetPassword />} />
                              <Route path="/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/obrigado-compra" element={<ThankYouPage />} />
                              <Route path="/politica" element={<PrivacyPolicy />} />
                              <Route path="/exclusao-dados" element={<DataDeletion />} />
                              <Route path="/ajuda" element={<HelpPage />} />

                              {/* EN Routes */}
                              <Route path="/en" element={<Home />} />
                              <Route path="/en/shop" element={<ShopPage />} />
                              <Route path="/en/quote" element={<BudgetPage />} />
                              <Route path="/en/contact" element={<ContactPage />} />
                              <Route path="/en/about-us" element={<CompanyPage />} />
                              <Route path="/en/product/:slug" element={<ProductDetail />} />
                              <Route path="/en/cart" element={<RequireRegisteredUser><CartPage /></RequireRegisteredUser>} />
                              <Route path="/en/favorites" element={<FavoritesPage />} />
                              <Route path="/en/my-account" element={<MyAccount />} />
                              <Route path="/en/my-account/pedidos" element={<MyAccount />} />
                              <Route path="/en/my-account/downloads" element={<MyAccount />} />
                              <Route path="/en/my-account/enderecos" element={<MyAccount />} />
                              <Route path="/en/my-account/perfil" element={<MyAccount />} />
                              <Route path="/en/my-account/privacidade" element={<MyAccount />} />
                              <Route path="/en/my-account/lista-de-desejos" element={<MyAccount />} />
                              <Route path="/en/login" element={<Login />} />
                              <Route path="/en/register" element={<Register />} />
                              <Route path="/en/forgot-password" element={<ForgotPassword />} />
                              <Route path="/en/reset-password" element={<ResetPassword />} />
                              <Route path="/en/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/en/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/en/thank-you" element={<ThankYouPage />} />
                              <Route path="/en/policy" element={<PrivacyPolicy />} />
                              <Route path="/en/data-deletion" element={<DataDeletion />} />
                              <Route path="/en/help" element={<HelpPage />} />

                              {/* ES Routes */}
                              <Route path="/es" element={<Home />} />
                              <Route path="/es/tienda" element={<ShopPage />} />
                              <Route path="/es/presupuesto" element={<BudgetPage />} />
                              <Route path="/es/contacto" element={<ContactPage />} />
                              <Route path="/es/nuestra-empresa" element={<CompanyPage />} />
                              <Route path="/es/producto/:slug" element={<ProductDetail />} />
                              <Route path="/es/carrito" element={<RequireRegisteredUser><CartPage /></RequireRegisteredUser>} />
                              <Route path="/es/favoritos" element={<FavoritesPage />} />
                              <Route path="/es/mi-cuenta" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/pedidos" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/downloads" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/enderecos" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/perfil" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/privacidade" element={<MyAccount />} />
                              <Route path="/es/mi-cuenta/lista-de-desejos" element={<MyAccount />} />
                              <Route path="/es/login" element={<Login />} />
                              <Route path="/es/cadastro" element={<Register />} />
                              <Route path="/es/esqueci-senha" element={<ForgotPassword />} />
                              <Route path="/es/redefinir-senha" element={<ResetPassword />} />
                              <Route path="/es/checkout/paypal/success" element={<PayPalSuccess />} />
                              <Route path="/es/checkout/paypal/cancel" element={<PayPalCancel />} />
                              <Route path="/es/obrigado-compra" element={<ThankYouPage />} />
                              <Route path="/es/politica" element={<PrivacyPolicy />} />
                              <Route path="/es/exclusao-dados" element={<DataDeletion />} />
                              <Route path="/es/ayuda" element={<HelpPage />} />
                              
                              <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                          </Suspense>
                        </div>
                        <CookieConsentBanner />
                        <MobileRedirectBanner />
                        <WhatsAppWidget />
                        <SocialProofNotification />
                        <Footer />
                      </div>
                    } />
                  </Routes>
                </Suspense>
              </CartProvider>
            </FavoritesProvider>
          </I18nProvider>
        </AppDataProvider>
      </AuthProvider>
    </Router>
  );
}

