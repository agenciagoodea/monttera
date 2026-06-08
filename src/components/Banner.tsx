import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, ShoppingCart, Sparkles, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import MatrixRequestForm from './MatrixRequestForm';
import { useAppData } from '../contexts/AppDataContext';

const steps = [
  {
    id: 1,
    title: 'Crie sua conta',
    text: 'Cadastre-se ou faça login para liberar seus downloads.',
    icon: UserPlus,
  },
  {
    id: 2,
    title: 'Escolha as matrizes',
    text: 'Adicione ao carrinho as peças que você deseja baixar.',
    icon: ShoppingCart,
  },
  {
    id: 3,
    title: 'Finalize o pagamento',
    text: 'Pagamento aprovado, matriz liberada automaticamente.',
    icon: CheckCircle2,
  },
];

const SLIDE_INTERVAL_MS = 7500;

function SlideIndicator({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`h-2 rounded-full transition-all duration-300 ${
        active ? 'w-6 bg-white' : 'w-2 bg-white/45 hover:bg-white/70'
      }`}
    />
  );
}

export default function Banner() {
  const { settings } = useAppData();

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const sliders = (() => {
    try {
      if (settings?.home_sliders) {
        const parsed = JSON.parse(settings.home_sliders);
        if (Array.isArray(parsed)) {
          return parsed.filter((slide: any) => {
            if (slide.active === false) return false;
            
            const showMobile = slide.show_mobile ?? (slide.visibility === 'all' || slide.visibility === 'mobile' || !slide.visibility);
            const showDesktop = slide.show_desktop ?? (slide.visibility === 'all' || slide.visibility === 'desktop' || !slide.visibility);
            
            if (isMobile && !showMobile) return false;
            if (!isMobile && !showDesktop) return false;
            return true;
          });
        }
      }
    } catch (e) {
      console.error('Erro ao parsear home_sliders:', e);
    }
    return [];
  })();

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const totalSlides = sliders.length > 0 ? sliders.length : 2;

  useEffect(() => {
    if (isPaused) return;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % totalSlides);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPaused, totalSlides]);

  useEffect(() => {
    setActiveSlide(0);
  }, [sliders.length]);

  const goToSlide = (index: number) => setActiveSlide(index);
  const nextSlide = () => setActiveSlide((current) => (current + 1) % totalSlides);
  const prevSlide = () => setActiveSlide((current) => (current === 0 ? totalSlides - 1 : current - 1));

  if (sliders.length > 0) {
    return (
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative w-full aspect-[1080/500] overflow-hidden rounded-[2.35rem] border border-slate-200 bg-slate-100 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.1)] group/banner"
      >
        <AnimatePresence mode="wait">
          {sliders.map((slide, index) => {
            if (index !== activeSlide) return null;

            const slideContent = (
              <motion.img
                key={slide.id || index}
                src={slide.image_url}
                alt={`Slide promocional ${index + 1}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full h-full object-cover rounded-[2.35rem]"
              />
            );

            return slide.link ? (
              <a
                href={slide.link}
                key={slide.id || index}
                className="block w-full h-full cursor-pointer"
                target={slide.link.startsWith('http') ? '_blank' : '_self'}
                rel="noopener noreferrer"
              >
                {slideContent}
              </a>
            ) : (
              <div key={slide.id || index} className="w-full h-full">
                {slideContent}
              </div>
            );
          })}
        </AnimatePresence>

        {totalSlides > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Slide anterior"
              className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-md text-white border border-white/20 transition hover:bg-black/55 shadow-lg active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Próximo slide"
              className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-md text-white border border-white/20 transition hover:bg-black/55 shadow-lg active:scale-95"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full overflow-hidden rounded-[2.35rem] border border-white/20 bg-gradient-to-br from-[#1e58dc] via-[#2868ec] to-[#08aeea] p-6 md:p-10 shadow-[0_32px_80px_-32px_rgba(8,85,220,0.75)]"
    >
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative z-10 mb-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-white">
          <Sparkles className="h-3.5 w-3.5" />
          {activeSlide === 0 ? 'Guia rápido' : 'Solicitação personalizada'}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Slide anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Próximo slide"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSlide === 0 ? (
          <motion.div
            key="purchase-flow-slide"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.32 }}
            className="relative z-10"
          >
            <p className="max-w-full text-lg md:text-xl font-black text-white leading-tight uppercase tracking-tight">
              Tudo pronto para você baixar sua matriz em poucos minutos.
            </p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <motion.article
                    key={step.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: step.id * 0.07 }}
                    className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md"
                  >
                    <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/15 blur-xl transition-transform duration-500 group-hover:scale-125" />
                    <div className="relative z-10">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="text-xl font-black text-white/60">{step.id}</span>
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-wide text-white">{step.title}</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-white/90">{step.text}</p>
                    </div>
                  </motion.article>
                );
              })}
            </div>

          </motion.div>
        ) : (
          <motion.div
            key="request-slide"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.32 }}
            className="relative z-10"
          >
            <div className="mb-4 md:mb-5">
              <p className="max-w-full text-lg md:text-xl font-black text-white leading-tight uppercase tracking-tight">
                Não achou a matriz? Envie-nos sua referência pelo formulário que retornamos.
              </p>
            </div>

            <MatrixRequestForm layout="horizontal" className="mt-8 border-white/25 ring-2 ring-white/15" />
          </motion.div>
        )}
      </AnimatePresence>


    </section>
  );
}
