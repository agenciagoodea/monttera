import { motion } from 'motion/react';
import { UserPlus, ShoppingCart, CheckCircle, ArrowRight } from 'lucide-react';

export default function Banner() {
  return (
    <div className="w-full bg-gradient-to-br from-blue-600 via-blue-500 to-sky-400 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between shadow-2xl shadow-blue-200 group border border-white/20">
      <div className="relative z-10 max-w-xl">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-[0.2em] mb-6 border border-white/10"
        >
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          Guia Rápido
        </motion.div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-black text-white mb-8 tracking-tighter leading-none"
        >
          COMO <br/>
          <span className="text-sky-100">COMPRAR?</span>
        </motion.h2>

        <div className="space-y-6">
          {[
            { id: 1, text: "Crie sua conta ou faça login.", icon: UserPlus },
            { id: 2, text: "Escolha as matrizes e adicione ao carrinho.", icon: ShoppingCart },
            { id: 3, text: "Finalize a compra e pronto! Sua matriz estará disponível para download.", icon: CheckCircle },
          ].map((step, i) => (
            <motion.div 
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i }}
              className="flex items-center gap-4 group/step"
            >
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-blue-600 font-black text-sm shadow-lg group-hover/step:scale-110 transition-transform">
                {step.id}
              </div>
              <p className="text-white text-sm md:text-base font-bold leading-tight opacity-90 group-hover/step:opacity-100 transition-opacity">
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Illustrative Shopping Cart / Graphics */}
      <div className="relative mt-12 md:mt-0 md:mr-10 select-none pointer-events-none">
        <div className="relative z-10 w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
            {/* Abstraction of a shopping cart with 3D feel using CSS */}
            <div className="absolute inset-0 bg-white/10 rounded-full blur-3xl" />
            <motion.div
              animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="relative z-20"
            >
               <ShoppingCart className="w-32 h-32 md:w-48 md:h-48 text-white opacity-20 stroke-[1]" />
               <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 md:w-20 md:h-20 text-white drop-shadow-2xl" />
               </div>
            </motion.div>
        </div>
      </div>

      {/* Background Decorative Circles */}
      <div className="absolute right-[-50px] bottom-[-50px] w-80 h-80 bg-white/5 rounded-full blur-2xl" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-full h-full opacity-10 pointer-events-none">
         <div className="grid grid-cols-6 h-full w-full gap-4 rotate-12 scale-150">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="text-[10px] font-black text-white uppercase opacity-20">Matriz</span>
            ))}
         </div>
      </div>
    </div>
  );
}
