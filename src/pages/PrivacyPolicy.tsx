import { Shield, Lock, Eye, FileText } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-20">
      <div className="text-center mb-16">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-4">Política de Privacidade</h1>
        <p className="text-slate-500 font-medium">Sua segurança e privacidade são nossa prioridade.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 md:p-16 shadow-xl shadow-slate-200/50 space-y-12">
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-primary mb-2">
            <Eye className="w-5 h-5" />
            <h2 className="text-xl font-black uppercase tracking-tight">Coleta de Informações</h2>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Coletamos informações básicas necessárias para processar seus pedidos e oferecer a melhor experiência possível. Isso inclui seu nome, e-mail, endereço de entrega e dados de pagamento processados de forma segura por nossos parceiros (Mercado Pago e PayPal).
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-primary mb-2">
            <Lock className="w-5 h-5" />
            <h2 className="text-xl font-black uppercase tracking-tight">Uso de Dados</h2>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Seus dados são utilizados exclusivamente para:
          </p>
          <ul className="list-disc list-inside text-slate-600 space-y-2 ml-4">
            <li>Processamento e entrega de pedidos de matrizes.</li>
            <li>Envio de atualizações sobre o status da sua compra.</li>
            <li>Melhoria contínua dos nossos serviços e interface.</li>
            <li>Comunicação de suporte técnico e atendimento.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-primary mb-2">
            <Shield className="w-5 h-5" />
            <h2 className="text-xl font-black uppercase tracking-tight">Segurança</h2>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Utilizamos criptografia SSL de 256 bits em todo o site para garantir que suas informações trafeguem de forma segura. Não armazenamos dados sensíveis de cartões de crédito em nossos servidores; todo o processamento financeiro é delegado a gateways certificados internacionalmente.
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3 text-primary mb-2">
            <FileText className="w-5 h-5" />
            <h2 className="text-xl font-black uppercase tracking-tight">Cookies</h2>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Usamos cookies para lembrar suas preferências, manter seu carrinho de compras e analisar o tráfego do site de forma anônima. Você pode desativar os cookies nas configurações do seu navegador a qualquer momento.
          </p>
        </section>

        <div className="pt-10 border-t border-slate-50 text-center">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>
    </main>
  );
}
