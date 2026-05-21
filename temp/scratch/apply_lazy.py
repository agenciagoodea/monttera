import os

target = 'src/App.tsx'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

header = """import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';

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

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white/50 backdrop-blur-sm fixed inset-0 z-50">
    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-lg shadow-blue-600/20"></div>
  </div>
);"""

# Replace imports
import_section_end = "import { AppDataProvider } from './contexts/AppDataContext';"
if import_section_end in content:
    # Everything before and including import_section_end
    # Actually just replace everything before "export default function App() {"
    app_start = "export default function App() {"
    if app_start in content:
        parts = content.split(app_start)
        new_content = header + "\n\n" + app_start + parts[1]
        
        # Now wrap Routes in Suspense
        new_content = new_content.replace("<Routes>", "<Suspense fallback={<PageLoader />}>\n              <Routes>")
        new_content = new_content.replace("</Routes>", "</Routes>\n            </Suspense>")
        
        with open(target, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Updated App.tsx with Lazy Loading!")
    else:
        print("App.tsx start not found.")
else:
    print("Import section not found.")
