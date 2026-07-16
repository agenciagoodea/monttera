import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAppData } from '../contexts/AppDataContext';

const SLIDE_INTERVAL_MS = 6000;

export default function SideBanner() {
  const { settings } = useAppData();
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
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
      if (settings?.side_sliders) {
        const parsed = JSON.parse(settings.side_sliders);
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
      console.error('Erro ao parsear side_sliders:', e);
    }
    return [];
  })();

  const totalSlides = sliders.length;

  useEffect(() => {
    if (isPaused || totalSlides <= 1) return;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % totalSlides);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPaused, totalSlides]);

  useEffect(() => {
    setActiveSlide(0);
  }, [totalSlides]);

  const nextSlide = () => setActiveSlide((current) => (current + 1) % totalSlides);
  const prevSlide = () => setActiveSlide((current) => (current === 0 ? totalSlides - 1 : current - 1));

  if (totalSlides === 0) return null;

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full h-[350px] md:h-[600px] overflow-hidden rounded-[2.25rem] border border-slate-100 bg-slate-50 shadow-sm group/sidebanner"
    >
      <AnimatePresence mode="wait">
        {sliders.map((slide, index) => {
          if (index !== activeSlide) return null;

          const content = (
            <motion.div
              key={slide.id || index}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="absolute inset-0 w-full h-full"
            >
              {slide.image_url ? (
                <img
                  src={slide.image_url}
                  alt={slide.title || 'Banner Lateral'}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
                  <Sparkles className="w-8 h-8 text-blue-400 mb-3 animate-pulse" />
                  <h4 className="text-sm font-black uppercase tracking-widest mb-2">{slide.title || 'Novidades Monttera'}</h4>
                  <p className="text-xs text-slate-300 max-w-xs">{slide.description || 'Confira os melhores produtos na nossa loja.'}</p>
                </div>
              )}
            </motion.div>
          );

          if (slide.link) {
            return (
              <a
                key={slide.id || index}
                href={slide.link}
                target={slide.link.startsWith('http') ? '_blank' : undefined}
                rel={slide.link.startsWith('http') ? 'noopener noreferrer' : undefined}
              >
                {content}
              </a>
            );
          }

          return content;
        })}
      </AnimatePresence>

      {/* Navegação por setas (Apenas se tiver mais de um slide) */}
      {totalSlides > 1 && (
        <>
          <button
            type="button"
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-800 flex items-center justify-center border border-slate-100 shadow-md opacity-0 group-hover/sidebanner:opacity-100 transition-opacity active:scale-95 duration-200 z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-800 flex items-center justify-center border border-slate-100 shadow-md opacity-0 group-hover/sidebanner:opacity-100 transition-opacity active:scale-95 duration-200 z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Indicadores de slide */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 bg-slate-900/30 backdrop-blur-sm px-2.5 py-1.5 rounded-full">
            {sliders.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === activeSlide ? 'w-4 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/85'
                }`}
                aria-label={`Ir para slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
