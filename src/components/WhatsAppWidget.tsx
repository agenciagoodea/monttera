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
    <div ref={widgetRef} className="fixed bottom-20 md:bottom-6 right-6 z-[999] font-sans">
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
        onClick={handleToggleChat}
        className={`w-14 h-14 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-300 relative focus:outline-none whatsapp-glow-pulse attention-light group ${
          isOpen ? 'rotate-90' : 'hover:scale-105'
        }`}
        aria-label="Atendimento via WhatsApp"
      >
        {isOpen ? (
          <X className="w-6 h-6 stroke-[2.5]" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]" xmlns="http://www.w3.org/2000/svg">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.062 5.248 5.403-.093 11.97-.093c3.184.001 6.177 1.24 8.428 3.492 2.25 2.253 3.487 5.247 3.487 8.434 0 6.572-5.341 11.913-11.91 11.913-2.004-.001-3.973-.505-5.724-1.46L0 24zm6.59-4.846c1.6.95 3.48 1.449 5.378 1.45 5.532 0 10.033-4.501 10.035-10.036 0-2.68-1.042-5.2-2.935-7.094-1.892-1.893-4.41-2.936-7.09-2.937-5.537 0-10.04 4.502-10.042 10.038-.001 1.902.497 3.761 1.448 5.368L1.6 22.3l4.896-1.285zM17.5 14.86c-.27-.135-1.595-.788-1.843-.877-.247-.09-.427-.135-.608.135-.18.27-.7.877-.857 1.057-.157.18-.314.202-.584.067-.27-.135-1.139-.42-2.17-1.34-1.003-.895-1.68-2.002-1.877-2.34-.197-.337-.02-.52.148-.687.151-.148.337-.393.506-.59.168-.197.224-.337.337-.562.112-.225.056-.422-.028-.59-.084-.168-.607-1.46-.83-2.002-.218-.524-.458-.453-.608-.46-.14-.007-.302-.007-.464-.007-.162 0-.427.06-.65.303-.224.24-.854.832-.854 2.03 0 1.197.87 2.35 1.002 2.52.132.17 1.71 2.61 4.14 3.66 2.43 1.05 2.43.7 2.87.66.44-.04 1.59-.65 1.81-.1.22-.56.22-1.04.15-1.13z" />
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
                <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16H11v-6h2v6zm0-8H11V7h2v3z" />
                  </svg>
                </div>
                {/* Ponto de Status Online */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></span>
              </div>
              
              <div>
                <h4 className="text-xs font-black tracking-wide">Suporte Digital Bordados</h4>
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
