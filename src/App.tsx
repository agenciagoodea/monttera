import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import ShopPage from './pages/ShopPage';
import BudgetPage from './pages/BudgetPage';
import ContactPage from './pages/ContactPage';
import ProductDetail from './pages/ProductDetail';
import CartPage from './pages/CartPage';
import FavoritesPage from './pages/FavoritesPage';
import MyAccount from './pages/MyAccount';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProductList from './pages/admin/AdminProductList';
import AdminProductForm from './pages/admin/AdminProductForm';
import AdminCategoryList from './pages/admin/AdminCategoryList';
import AdminTagList from './pages/admin/AdminTagList';
import AdminOrderList from './pages/admin/AdminOrderList';
import AdminUserList from './pages/admin/AdminUserList';
import AdminReports from './pages/admin/AdminReports';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLayout from './layouts/AdminLayout';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FavoritesProvider } from './contexts/FavoritesContext';

export default function App() {
  useEffect(() => {
    const hexToRgb = (hex: string) => {
      const normalized = hex.replace('#', '').trim();
      const raw = normalized.length === 3
        ? normalized.split('').map((ch) => ch + ch).join('')
        : normalized;
      if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
      const int = Number.parseInt(raw, 16);
      return {
        r: (int >> 16) & 255,
        g: (int >> 8) & 255,
        b: int & 255,
      };
    };

    async function fetchBranding() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data) {
          if (data.primary_color) {
            document.documentElement.style.setProperty('--brand-primary', data.primary_color);
            const primaryRgb = hexToRgb(data.primary_color);
            if (primaryRgb) {
              document.documentElement.style.setProperty('--brand-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
            }
          }
          if (data.secondary_color) {
            document.documentElement.style.setProperty('--brand-secondary', data.secondary_color);
            const secondaryRgb = hexToRgb(data.secondary_color);
            if (secondaryRgb) {
              document.documentElement.style.setProperty('--brand-secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
      }
    }
    fetchBranding();
  }, []);

  return (
    <Router>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
            <Routes>
          {/* Admin Routes */}
          <Route path="/admin/*" element={
            <AdminLayout>
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
            </AdminLayout>
          } />

          {/* Public Routes */}
          <Route path="/*" element={
            <div className="min-h-screen bg-white font-sans text-gray-900 scroll-smooth flex flex-col">
              <Header />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/loja" element={<ShopPage />} />
                  <Route path="/orcamento" element={<BudgetPage />} />
                  <Route path="/contato" element={<ContactPage />} />
                  <Route path="/produto/:slug" element={<ProductDetail />} />
                  <Route path="/carrinho" element={<CartPage />} />
                  <Route path="/favoritos" element={<FavoritesPage />} />
                  <Route path="/minha-conta" element={<MyAccount />} />
                  <Route path="/minha-conta/pedidos" element={<MyAccount />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/cadastro" element={<Register />} />
                  <Route path="/esqueci-senha" element={<ForgotPassword />} />
                  <Route path="/redefinir-senha" element={<ResetPassword />} />
                </Routes>
              </div>
              <Footer />
            </div>
          } />
          </Routes>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </Router>
  );
}
