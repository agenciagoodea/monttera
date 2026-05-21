import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import CookieConsentBanner from './components/CookieConsentBanner';

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
const HelpPage = lazy(() => import('./pages/HelpPage'));

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

import AdminLayout from './layouts/AdminLayout';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { AppDataProvider } from './contexts/AppDataContext';
import { useAuth } from './contexts/AuthContext';
import { useAppData } from './contexts/AppDataContext';
import { applySeo } from './lib/seo';

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
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/cadastro?redirect=${redirect}`} replace />;
  }
  return children;
}

function RouteSeoDefaults() {
  const location = useLocation();
  const { settings } = useAppData();

  useEffect(() => {
    const siteName = String(settings.site_name || 'Digital Bordados').trim();
    const appUrl = String(settings.app_url || window.location.origin).replace(/\/+$/, '');
    const baseDescription = String(
      settings.site_description || 'Matrizes de bordado digitais para produção profissional.',
    ).trim();

    const path = location.pathname;
    const seoByRoute: Array<{ match: RegExp; title: string; description: string; robots?: string }> = [
      { match: /^\/$/, title: `${siteName} | Início`, description: baseDescription },
      { match: /^\/loja/, title: `Loja | ${siteName}`, description: 'Explore nossa vitrine de matrizes de bordado digitais.' },
      { match: /^\/orcamento/, title: `Orçamento | ${siteName}`, description: 'Solicite orçamento para desenvolvimento profissional de matrizes de bordado.' },
      { match: /^\/contato/, title: `Contato | ${siteName}`, description: `Fale com a equipe da ${siteName}.` },
      { match: /^\/produto\//, title: `${siteName} | Produto`, description: baseDescription },
      { match: /^\/favoritos/, title: `Favoritos | ${siteName}`, description: 'Lista de produtos favoritados.' },
      { match: /^\/carrinho/, title: `Carrinho | ${siteName}`, description: 'Confira os itens adicionados ao carrinho.' },
      { match: /^\/login/, title: `Entrar | ${siteName}`, description: 'Acesse sua conta para comprar e baixar matrizes.', robots: 'noindex,nofollow' },
      { match: /^\/cadastro/, title: `Cadastro | ${siteName}`, description: 'Crie sua conta para comprar matrizes de bordado.', robots: 'noindex,nofollow' },
      { match: /^\/minha-conta/, title: `Minha Conta | ${siteName}`, description: 'Área do cliente.', robots: 'noindex,nofollow' },
      { match: /^\/admin/, title: `Admin | ${siteName}`, description: 'Painel administrativo', robots: 'noindex,nofollow' },
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
      canonical: `${path}${location.search || ''}`,
      siteName,
      image: String(settings.seo_og_image || settings.logo_url || '/uploads/seo-default-share.jpg'),
      twitterCard: String(settings.seo_twitter_card || 'summary_large_image'),
      keywords: String(settings.seo_keywords || ''),
      jsonLd: organizationSchema,
    });
  }, [location.pathname, location.search, settings]);

  return null;
}

export default function App() {

  return (
    <Router>
      <AuthProvider>
        <AppDataProvider>
          <FavoritesProvider>
            <CartProvider>
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
                <Route path="/tags" element={<AdminTagList />} />
                <Route path="/pedidos" element={<AdminOrderList />} />
                <Route path="/clientes" element={<AdminUserList />} />
                <Route path="/relatorios" element={<AdminReports />} />
                <Route path="/configuracoes" element={<AdminSettings />} />
              </Routes>
            </Suspense>
            </AdminLayout>
          } />

          {/* Public Routes */}
          <Route path="/*" element={
            <div className="min-h-screen bg-white font-sans text-gray-900 scroll-smooth flex flex-col">
              <RouteSeoDefaults />
              <Header />
              <div className="flex-1">
                <Suspense fallback={<PageLoader />}>
              <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/loja" element={<ShopPage />} />
                  <Route path="/orcamento" element={<BudgetPage />} />
                  <Route path="/contato" element={<ContactPage />} />
                  <Route path="/produto/:slug" element={<ProductDetail />} />
                  <Route
                    path="/carrinho"
                    element={
                      <RequireRegisteredUser>
                        <CartPage />
                      </RequireRegisteredUser>
                    }
                  />
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
                  <Route path="/ajuda" element={<HelpPage />} />
                </Routes>
            </Suspense>
              </div>
              <CookieConsentBanner />
              <Footer />
            </div>
          } />
          </Routes>
            </Suspense>
            </CartProvider>
          </FavoritesProvider>
        </AppDataProvider>
      </AuthProvider>
    </Router>
  );
}
