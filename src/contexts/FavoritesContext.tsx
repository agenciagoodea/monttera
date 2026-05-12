import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Heart } from 'lucide-react';
import { useAuth } from './AuthContext';

const FAVORITES_STORAGE_KEY = 'favorite_products';

type ToastType = 'success' | 'info' | 'error';

interface ToastState {
  message: string;
  type: ToastType;
}

interface FavoritesContextType {
  favorites: number[];
  totalFavorites: number;
  loading: boolean;
  isFavorite: (productId: number) => boolean;
  toggleFavorite: (productId: number, productName?: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

function parseLocalFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

function persistLocalFavorites(ids: number[]) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) {
        setFavorites(parseLocalFavorites());
        return;
      }

      const localFavorites = parseLocalFavorites();
      const res = await fetch('/api/favorites');
      if (!res.ok) {
        setFavorites([]);
        return;
      }

      const data = await res.json();
      const serverFavorites = Array.isArray(data?.favorite_ids)
        ? data.favorite_ids.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
        : [];

      const missingFromServer = localFavorites.filter((id) => !serverFavorites.includes(id));
      if (missingFromServer.length > 0) {
        await Promise.all(
          missingFromServer.map((productId) =>
            fetch(`/api/favorites/${productId}`, { method: 'POST' }).catch(() => null),
          ),
        );
      }

      const merged = Array.from(new Set([...serverFavorites, ...localFavorites]));
      setFavorites(merged);
      localStorage.removeItem(FAVORITES_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      setFavorites(user ? [] : parseLocalFavorites());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const isFavorite = useCallback((productId: number) => favorites.includes(productId), [favorites]);

  const toggleFavorite = useCallback(async (productId: number, productName?: string) => {
    if (!Number.isInteger(productId) || productId <= 0) return;

    const alreadyFavorite = favorites.includes(productId);

    if (!user) {
      const next = alreadyFavorite
        ? favorites.filter((id) => id !== productId)
        : [...favorites, productId];
      setFavorites(next);
      persistLocalFavorites(next);
      showToast(
        alreadyFavorite
          ? 'Favorito removido deste navegador.'
          : `“${productName || 'Produto'}” salvo nos favoritos.`,
        'info',
      );
      return;
    }

    try {
      const res = await fetch(`/api/favorites/${productId}`, {
        method: alreadyFavorite ? 'DELETE' : 'POST',
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Falha ao atualizar favoritos');
      }

      setFavorites((prev) =>
        alreadyFavorite ? prev.filter((id) => id !== productId) : Array.from(new Set([...prev, productId])),
      );

      showToast(
        alreadyFavorite
          ? 'Produto removido dos seus favoritos.'
          : `Perfeito! “${productName || 'Produto'}” foi para os seus favoritos.`,
        'success',
      );
    } catch (error) {
      console.error('Toggle favorite error:', error);
      showToast('Não foi possível atualizar seus favoritos agora.', 'error');
    }
  }, [favorites, showToast, user]);

  const contextValue = useMemo<FavoritesContextType>(() => ({
    favorites,
    totalFavorites: favorites.length,
    loading,
    isFavorite,
    toggleFavorite,
  }), [favorites, loading, isFavorite, toggleFavorite]);

  return (
    <FavoritesContext.Provider value={contextValue}>
      {children}
      {toast && (
        <div className="fixed right-4 bottom-4 z-[120] pointer-events-none">
          <div
            className={`min-w-[280px] max-w-[360px] rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm transition-all duration-300 ${
              toast.type === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-700'
                : toast.type === 'info'
                  ? 'bg-slate-900/95 border-slate-700 text-white'
                  : 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`mt-0.5 ${toast.type === 'error' ? 'text-red-500' : toast.type === 'info' ? 'text-pink-300' : 'text-emerald-600'}`}>
                {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
              </div>
              <p className="text-xs font-bold leading-relaxed">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}

