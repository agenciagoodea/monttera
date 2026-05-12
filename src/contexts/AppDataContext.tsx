import React, { createContext, useContext, useEffect, useState } from 'react';
import { Category } from '../types';

interface AppSettings {
  primary_color?: string;
  secondary_color?: string;
  site_name?: string;
  logo?: string;
  [key: string]: string | undefined;
}

interface AppDataContextType {
  categories: Category[];
  settings: AppSettings;
  loadingCategories: boolean;
}

const AppDataContext = createContext<AppDataContextType>({
  categories: [],
  settings: {},
  loadingCategories: true,
});

// Promise-based singleton cache: garante que fetch() só é chamado UMA VEZ
let categoriesCache: Category[] | null = null;
let settingsCache: AppSettings | null = null;
let categoriesPromise: Promise<Category[]> | null = null;
let settingsPromise: Promise<AppSettings> | null = null;

function fetchCategories(): Promise<Category[]> {
  if (categoriesCache) return Promise.resolve(categoriesCache);
  if (categoriesPromise) return categoriesPromise;
  categoriesPromise = fetch('/api/categories')
    .then((r) => r.json())
    .then((data) => {
      categoriesCache = Array.isArray(data) ? data : [];
      return categoriesCache;
    })
    .catch(() => {
      categoriesPromise = null; // permite retry em caso de falha
      return [];
    });
  return categoriesPromise;
}

function fetchSettings(): Promise<AppSettings> {
  if (settingsCache) return Promise.resolve(settingsCache);
  if (settingsPromise) return settingsPromise;
  settingsPromise = fetch('/api/settings')
    .then((r) => r.json())
    .then((data) => {
      settingsCache = data || {};
      return settingsCache;
    })
    .catch(() => {
      settingsPromise = null;
      return {};
    });
  return settingsPromise;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(categoriesCache || []);
  const [settings, setSettings] = useState<AppSettings>(settingsCache || {});
  const [loadingCategories, setLoadingCategories] = useState(!categoriesCache);

  useEffect(() => {
    // Executa ambas as fetches em paralelo, sem duplicação
    Promise.all([fetchCategories(), fetchSettings()]).then(([cats, sett]) => {
      setCategories(cats);
      setSettings(sett);
      setLoadingCategories(false);

      // Aplica CSS vars de branding (substituindo o fetchBranding do App.tsx)
      if (sett.primary_color) {
        document.documentElement.style.setProperty('--brand-primary', sett.primary_color);
        const hex = sett.primary_color.replace('#', '');
        const int = parseInt(hex, 16);
        const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
        document.documentElement.style.setProperty('--brand-primary-rgb', `${r}, ${g}, ${b}`);
      }
      if (sett.secondary_color) {
        document.documentElement.style.setProperty('--brand-secondary', sett.secondary_color);
      }
    });
  }, []);

  return (
    <AppDataContext.Provider value={{ categories, settings, loadingCategories }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
