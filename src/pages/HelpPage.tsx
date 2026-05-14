import { HelpCircle, MessageCircle, Download, FileQuestion, Mail, Smartphone } from 'lucide-react';
import { useAppData } from '../contexts/AppDataContext';

export default function HelpPage() {
  const { settings } = useAppData();

  const faqs = [
    {
      q: "Como recebo minhas matrizes após a compra?",
      a: "Após a confirmação do pagamento, o download é liberado instantaneamente na sua conta. Você receberá um e-mail com os links e também poderá acessá-los na aba 'Meus Downloads' no seu painel.",
      icon: Download
    },
    {
      q: "Quais formatos de arquivo estão inclusos?",
      a: "Nossas matrizes são enviadas nos principais formatos do mercado: DST, PES, JEF, EXP, XXX, entre outros. Verifique a descrição de cada produto para detalhes específicos.",
      icon: FileQuestion
    },
    {
      q: "Posso solicitar uma matriz personalizada?",
      a: "Sim! Temos uma equipe pronta para criar matrizes exclusivas para você. Basta acessar a página 'Solicitar Matriz' ou 'Orçamento' e enviar sua imagem.",
      icon: MessageCircle
    }
  ];

  return (
    <main className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-16">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <HelpCircle className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-4">Como podemos ajudar?</h1>
        <p className="text-slate-500 font-medium">Encontre respostas rápidas ou entre em contato com nosso suporte.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
              <faq.icon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-4 leading-tight">{faq.q}</h3>
            <p className="text-slate-50 text-slate-600 text-sm leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>

      <div className="bg-primary rounded-[3rem] p-10 md:p-16 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Ainda precisa de ajuda?</h2>
            <p className="text-white/70 font-medium mb-10">
              Nossa equipe de suporte está disponível de segunda a sexta, das 09h às 18h, para resolver qualquer dúvida ou problema técnico.
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              {settings.support_whatsapp && (
                <a 
                  href={`https://wa.me/${settings.support_whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  className="flex items-center gap-3 bg-green-500 hover:bg-green-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-green-500/20"
                >
                  <Smartphone className="w-5 h-5" />
                  WhatsApp
                </a>
              )}
              {settings.support_email && (
                <a 
                  href={`mailto:${settings.support_email}`}
                  className="flex items-center gap-3 bg-white/10 hover:bg-white/20 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/10"
                >
                  <Mail className="w-5 h-5" />
                  E-mail
                </a>
              )}
            </div>
          </div>
          <div className="hidden md:block">
            <div className="aspect-square bg-white/10 rounded-[3rem] flex items-center justify-center p-12">
               <HelpCircle className="w-full h-full text-white/10" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
