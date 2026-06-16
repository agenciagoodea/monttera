import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { X, Send } from 'lucide-react';

export default function WhatsAppWidget() {
  const location = useLocation();
  const { settings } = useAppData();
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasNotification, setHasNotification] = useState(true);
  const [isTyping, setIsTyping] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);

  // Estados e refs para lógica de arrastar (drag) no celular
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const wasDraggedRef = useRef(false);

  // Ocultar se estiver nas rotas do painel admin
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  // Exibir o balão informativo após 2.5 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Controlar o estado de digitação ao abrir o simulador
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      
      setIsTyping(true);
      const timer = setTimeout(() => {
        setIsTyping(false);
      }, 900); // tempo ideal para a simulação de digitação
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fechar o simulador ao clicar fora dele
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Carregar número de WhatsApp com fallback seguro
  const rawNumber = settings.contact_whatsapp || settings.support_whatsapp || '5591992421982';
  const cleanNumber = rawNumber.replace(/\D/g, '');

  const handleToggleChat = () => {
    setIsOpen(!isOpen);
    setHasNotification(false);
    setShowTooltip(false);
  };

  // Lógica de arrastar em celular (Touch Screen)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartRef.current = {
      x: touch.clientX - dragPos.x,
      y: touch.clientY - dragPos.y
    };
    setIsDragging(true);
    wasDraggedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStartRef.current.x;
    const newY = touch.clientY - dragStartRef.current.y;

    // Se moveu mais de 8px, consideramos que houve arrasto
    const deltaX = Math.abs(newX - dragPos.x);
    const deltaY = Math.abs(newY - dragPos.y);
    if (deltaX > 8 || deltaY > 8) {
      wasDraggedRef.current = true;
    }

    setDragPos({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (wasDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      wasDraggedRef.current = false; // reseta flag
      return;
    }
    handleToggleChat();
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const textToSend = inputValue.trim()
      ? encodeURIComponent(inputValue.trim())
      : encodeURIComponent('Olá! Vim do site e gostaria de tirar uma dúvida sobre as matrizes de bordado.');
      
    window.open(`https://wa.me/${cleanNumber}?text=${textToSend}`, '_blank');
    setInputValue('');
    setIsOpen(false);
  };

  return (
    <div 
      ref={widgetRef} 
      className="fixed bottom-32 md:bottom-6 right-6 z-[999] font-sans"
      style={{
        transform: `translate3d(${dragPos.x}px, ${dragPos.y}px, 0)`,
      }}
    >
      {/* Estilos customizados locais para efeitos de luz, pulsação e animações */}
      <style>{`
        @keyframes whatsapp-glow-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7), 0 4px 14px rgba(0, 0, 0, 0.1);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(37, 211, 102, 0), 0 4px 14px rgba(0, 0, 0, 0.1);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 211, 102, 0), 0 4px 14px rgba(0, 0, 0, 0.1);
          }
        }
        @keyframes attention-light {
          0%, 100% {
            filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.4)) brightness(1);
          }
          50% {
            filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8)) brightness(1.15);
          }
        }
        @keyframes badge-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-3px) scale(1.1); }
        }
        @keyframes tooltip-slide {
          0% { opacity: 0; transform: translateX(12px) scale(0.9); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes typing-bubble {
          0% { transform: translateY(0); }
          100% { transform: translateY(-4px); }
        }
        .whatsapp-glow-pulse {
          animation: whatsapp-glow-pulse 2s infinite;
        }
        .attention-light {
          animation: attention-light 3s infinite ease-in-out;
        }
        .badge-bounce {
          animation: badge-bounce 2s infinite ease-in-out;
        }
        .tooltip-slide-in {
          animation: tooltip-slide 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .typing-dot {
          animation: typing-bubble 0.6s infinite alternate ease-in-out;
        }
        .typing-dot:nth-child(2) {
          animation-delay: 0.15s;
        }
        .typing-dot:nth-child(3) {
          animation-delay: 0.3s;
        }
        .wa-chat-bg {
          background-color: #efeae2;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23b4a28f' fill-opacity='0.08'%3E%3Cpath fill-rule='evenodd' d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zM11 61c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm74-27c0 7.732-6.268 14-14 14s-14-6.268-14-14 6.268-14 14-14 14 6.268 14 14zM9 26c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm65 0c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zM9 71c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm65 0c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z'/%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>

      {/* Dica de texto lateral (Tooltip de atenção) */}
      {showTooltip && !isOpen && (
        <div className="absolute right-16 top-2 mr-2 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-black py-2 px-3.5 rounded-xl whitespace-nowrap shadow-lg tooltip-slide-in flex items-center gap-1.5 border border-white/10 select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Suporte Online!
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
            className="text-white/60 hover:text-white ml-1.5 focus:outline-none"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Botão Flutuante Principal do WhatsApp */}
      <button
        onClick={handleButtonClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`w-14 h-14 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-300 relative focus:outline-none whatsapp-glow-pulse attention-light group ${
          isOpen ? 'rotate-90' : 'hover:scale-105'
        }`}
        style={{
          touchAction: 'none' // Evita scroll do site ao arrastar a bolinha
        }}
        aria-label="Atendimento via WhatsApp"
      >
        {isOpen ? (
          <X className="w-6 h-6 stroke-[2.5]" />
        ) : (
          <svg viewBox="0 0 448 512" className="w-6.5 h-6.5 fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.13)]" xmlns="http://www.w3.org/2000/svg">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l127.7-33.5c32.6 18 69.2 27.5 106.2 27.5h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-75.8 19.9 20.3-73.8-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
        )}

        {/* Notificação vermelha pulsante "1" */}
        {hasNotification && !isOpen && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[10px] w-5.5 h-5.5 rounded-full flex items-center justify-center border-2 border-white shadow-md badge-bounce select-none">
            1
          </span>
        )}
      </button>

      {/* Janela de Chat Simulada */}
      {isOpen && (
        <div className="absolute bottom-18 right-0 w-[310px] sm:w-[340px] md:w-[360px] max-w-[calc(100vw-2.5rem)] rounded-2xl shadow-2xl bg-white border border-slate-100 overflow-hidden flex flex-col z-[999] transition-all duration-300 origin-bottom-right">
          {/* Cabeçalho do Chat */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between shadow-sm relative">
            <div className="flex items-center gap-3">
              {/* Foto de Perfil do Atendente */}
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-inner select-none">
                  <svg viewBox="0 0 448 512" className="w-5.5 h-5.5 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l127.7-33.5c32.6 18 69.2 27.5 106.2 27.5h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-75.8 19.9 20.3-73.8-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                </div>
                {/* Ponto de Status Online */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></span>
              </div>
              
              <div>
                <div className="flex items-center gap-1">
                  <h4 className="text-xs font-black tracking-wide">Suporte Digital Bordados</h4>
                  {/* Verified Badge */}
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-sky-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <p className="text-[10px] text-emerald-200/90 font-bold flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Online agora
                </p>
              </div>
            </div>

            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors focus:outline-none"
            >
              <X className="w-5 h-5 text-white/80 hover:text-white" />
            </button>
          </div>

          {/* Corpo das Mensagens */}
          <div className="wa-chat-bg p-4 flex flex-col justify-end gap-3 min-h-[170px] max-h-[300px] overflow-y-auto">
            {isTyping ? (
              /* Bolha de Digitação Simulado */
              <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 text-slate-400 text-xs font-bold max-w-[70%] ml-1 shadow-sm flex items-center gap-1.5 self-start">
                <span>Digitando</span>
                <div className="flex gap-0.5 mt-1">
                  <span className="w-1 h-1 bg-slate-400 rounded-full typing-dot"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full typing-dot"></span>
                  <span className="w-1 h-1 bg-slate-400 rounded-full typing-dot"></span>
                </div>
              </div>
            ) : (
              /* Mensagem de Suporte */
              <div className="bg-white rounded-2xl rounded-tl-none p-3.5 shadow-sm text-xs text-slate-800 max-w-[85%] self-start relative border border-slate-100 flex flex-col gap-1.5 transition-all">
                <p className="font-medium leading-relaxed">
                  Olá! Seja bem-vindo(a) à Digital Bordados! 🧵✨
                </p>
                <p className="font-medium leading-relaxed">
                  Nosso atendimento está <strong className="text-emerald-600 font-extrabold">online</strong> pronto para te ajudar a encontrar suas matrizes ou tirar qualquer dúvida.
                </p>
                <p className="font-medium leading-relaxed">
                  Como podemos ajudar você hoje?
                </p>
                <span className="text-[8px] text-slate-400 font-bold self-end mt-1 uppercase">
                  {timeStr}
                </span>
              </div>
            )}
          </div>

          {/* Rodapé Interativo com Input de Texto */}
          <form onSubmit={handleSendMessage} className="bg-white p-3 border-t border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escreva sua mensagem..."
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              className="p-2.5 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-white rounded-xl shadow-md transition-all duration-150 flex items-center justify-center cursor-pointer"
              title="Iniciar conversa no WhatsApp"
            >
              <Send className="w-4 h-4 fill-white" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
