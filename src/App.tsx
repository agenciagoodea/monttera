import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import CartPage from './pages/CartPage';
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

export default function App() {
  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch('/api/admin/settings');
        const data = await res.json();
        if (data) {
          if (data.primary_color) {
            document.documentElement.style.setProperty('--brand-primary', data.primary_color);
          }
          if (data.secondary_color) {
            document.documentElement.style.setProperty('--brand-secondary', data.secondary_color);
          }
          // We can also store logo_url in a context or local storage if needed by Header
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
      }
    }
    fetchBranding();
  }, []);

  return (
  return (
    <Router>
      <AuthProvider>
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
                  <Route path="/produto/:slug" element={<ProductDetail />} />
                  <Route path="/carrinho" element={<CartPage />} />
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
      </AuthProvider>
    </Router>
  );
}
