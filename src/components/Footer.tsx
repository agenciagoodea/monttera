import { Facebook, Instagram, Youtube, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-100 pt-20 pb-10 px-6 md:px-10 mt-20">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 mb-20">
          
          {/* Brand & Intro */}
          <div className="lg:col-span-4 space-y-8">
            <Link to="/" className="flex flex-col group">
              <span className="text-3xl font-black text-primary leading-none tracking-tighter uppercase">
                DIGITAL<span className="text-blue-400 font-light">BORDADOS</span>
              </span>
              <span className="text-[10px] font-black text-slate-400 tracking-[0.4em] -mt-0.5">EXCELÊNCIA EM MATRIZES</span>
            </Link>
            
            <p className="text-slate-500 text-sm leading-relaxed font-medium">
              Transforme suas ideias em bordados perfeitos! Oferecemos matrizes de bordado computadorizado de alta qualidade, prontas para dar vida aos seus projetos com precisão e criatividade. Escolha entre diversos estilos e formatos compatíveis com as principais máquinas de bordar do mercado.
            </p>

            <div className="space-y-4">
              {[
                { text: "Downloads imediatos", icon: CheckCircle2 },
                { text: "Variedade de formatos", icon: CheckCircle2 },
                { text: "Qualidade garantida", icon: CheckCircle2 },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-red-500 font-black text-[11px] uppercase tracking-widest">
                  <item.icon className="w-5 h-5 fill-red-100" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Links Column 1 */}
          <div className="lg:col-span-2">
            <h4 className="text-slate-900 font-black mb-8 uppercase text-xs tracking-[0.2em]">Minha Conta</h4>
            <ul className="space-y-4 text-xs font-bold text-slate-500">
              <li><Link to="/minha-conta" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Minha Conta</Link></li>
              <li><Link to="/minha-conta/pedidos" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Pedidos</Link></li>
              <li><Link to="/downloads" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Downloads</Link></li>
              <li><Link to="/endereco" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Endereço</Link></li>
              <li><Link to="/perfil" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Perfil</Link></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="lg:col-span-2">
            <h4 className="text-slate-900 font-black mb-8 uppercase text-xs tracking-[0.2em]">Menu</h4>
            <ul className="space-y-4 text-xs font-bold text-slate-500">
              <li><Link to="/" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Início</Link></li>
              <li><Link to="/sobre" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Nossa Empresa</Link></li>
              <li><Link to="/loja" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Loja</Link></li>
              <li><Link to="/pedidos" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Pedidos</Link></li>
              <li><Link to="/contato" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Contato</Link></li>
            </ul>
          </div>

          {/* Links Column 3 */}
          <div className="lg:col-span-2">
            <h4 className="text-slate-900 font-black mb-8 uppercase text-xs tracking-[0.2em]">Categorias</h4>
            <ul className="space-y-4 text-xs font-bold text-slate-500">
              <li><Link to="/?category=destaques" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Destaques</Link></li>
              <li><Link to="/?category=gratis" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Grátis</Link></li>
              <li><Link to="/?category=colecoes" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Coleções</Link></li>
              <li><Link to="/?category=datas-comemorativas" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Datas Comemorativas</Link></li>
              <li><Link to="/?category=genero" className="flex items-center gap-2 hover:text-primary transition-colors"><ArrowRight className="w-3 h-3" /> Gênero</Link></li>
            </ul>
          </div>

          {/* Payment & Social */}
          <div className="lg:col-span-2 space-y-10">
            <div>
              <h4 className="text-slate-900 font-black mb-6 uppercase text-xs tracking-[0.2em]">Métodos de Pagamento</h4>
              <div className="flex flex-wrap gap-2">
                {['Visa', 'Master', 'Hiper', 'Elo', 'Pix', 'PayPal'].map(p => (
                  <div key={p} className="w-10 h-6 bg-slate-50 border border-slate-100 rounded flex items-center justify-center text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                    {p}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-slate-900 font-black mb-6 uppercase text-xs tracking-[0.2em]">Nossas Redes Sociais</h4>
              <div className="flex items-center gap-3">
                <a href="#" className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-blue-200">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-pink-200">
                  <Instagram className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-red-200">
                  <Youtube className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-50 pt-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center lg:text-left">
            2025 - 2026 © Digital Bordados E-commerce | Av. Fortaleza, 90 - Bairro Novo CEP 66010-000 - Belém/PA. Desenvolvido por <span className="text-primary">Agência Goodiea</span>
          </p>
          
          <div className="flex items-center gap-8">
             <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 px-4 py-2 rounded-2xl">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest leading-none">
                  Site 100% Seguro<br/>
                  <span className="text-[7px] opacity-60">Certificado de Segurança</span>
                </span>
             </div>
             <div className="flex gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Link to="/politica" className="hover:text-primary transition-colors">Política de Privacidade</Link>
                <Link to="/ajuda" className="hover:text-primary transition-colors">Precisa de Ajuda?</Link>
             </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
