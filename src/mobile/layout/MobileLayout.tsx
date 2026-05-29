import React from 'react';
import MobileHeader from '../components/MobileHeader';
import MobileBottomNav from '../components/MobileBottomNav';

interface MobileLayoutProps {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900 overflow-x-hidden antialiased">
      {/* Top Header Fixo */}
      <MobileHeader />

      {/* Conteúdo Principal com Rolagem Suave */}
      <main className="flex-1 w-full pt-16 pb-20 px-4 max-w-md mx-auto">
        <div className="animate-fade-in duration-300">
          {children}
        </div>
      </main>

      {/* Barra de Navegação Inferior Fixa */}
      <MobileBottomNav />
    </div>
  );
}
