import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { AtSign, FileImage, Loader2, Phone, Send, User } from 'lucide-react';

type MatrixRequestFormProps = {
  className?: string;
  layout?: 'vertical' | 'horizontal';
};

export default function MatrixRequestForm({ className = '', layout = 'vertical' }: MatrixRequestFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [details, setDetails] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('email', email.trim());
      formData.append('whatsapp', whatsapp.trim());
      formData.append('details', details.trim());
      if (referenceImage) {
        formData.append('reference_image', referenceImage);
      }

      const res = await fetch('/api/matrix-requests', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível enviar sua solicitação agora.');
      }

      setMessage({
        type: 'success',
        text: 'Solicitação enviada! Nossa equipe vai entrar em contato com você em breve.',
      });
      setName('');
      setEmail('');
      setWhatsapp('');
      setDetails('');
      setReferenceImage(null);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error?.message || 'Erro ao enviar solicitação.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isHorizontal = layout === 'horizontal';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`w-full rounded-[1.25rem] border border-white/25 bg-white/12 p-3 md:p-3.5 shadow-[0_16px_40px_-26px_rgba(3,35,84,0.55)] backdrop-blur-xl ${className}`}
    >
      <form onSubmit={onSubmit} className="space-y-2.5">
        <div className={`grid gap-2.5 ${isHorizontal ? 'grid-cols-1 md:grid-cols-12' : 'grid-cols-1'}`}>
          <label className={`block ${isHorizontal ? 'md:col-span-4' : ''}`}>
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/90">
              <User className="h-3.5 w-3.5" /> Nome
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
              placeholder="Seu nome"
            />
          </label>

          <label className={`block ${isHorizontal ? 'md:col-span-4' : ''}`}>
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/90">
              <AtSign className="h-3.5 w-3.5" /> Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
              placeholder="seuemail@dominio.com"
            />
          </label>

          <label className={`block ${isHorizontal ? 'md:col-span-4' : ''}`}>
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/90">
              <Phone className="h-3.5 w-3.5" /> WhatsApp com DDD
            </span>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
              className="w-full rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
              placeholder="(99) 99999-9999"
            />
          </label>

          <label className={`block ${isHorizontal ? 'md:col-span-5 xl:col-span-4' : ''}`}>
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/90">
              Demais informações
            </span>
            {isHorizontal ? (
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="h-[58px] w-full rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                placeholder="Exemplo: tecido, tamanho estimado, tipo de bordado, aplicação..."
              />
            ) : (
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="min-h-[88px] w-full rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] font-semibold text-slate-700 outline-none transition-all focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                placeholder="Exemplo: tecido, tamanho estimado, tipo de bordado, aplicação..."
              />
            )}
          </label>

          <label className={`block ${isHorizontal ? 'md:col-span-4 xl:col-span-4' : ''}`}>
            <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/90">
              <FileImage className="h-3.5 w-3.5" /> Imagem de referência
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setReferenceImage(e.target.files?.[0] || null)}
              className={`w-full cursor-pointer rounded-lg border border-white/30 bg-white/88 px-3 py-2 text-[13px] text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-2.5 file:py-1.5 file:text-[11px] file:font-black file:text-white hover:file:bg-blue-700 ${isHorizontal ? 'h-[58px]' : ''}`}
            />
          </label>

          {isHorizontal && (
            <div className="md:col-span-3 xl:col-span-4 flex items-end">
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="inline-flex h-[58px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-700 hover:to-cyan-600 disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4.5 w-4.5" />
                    Enviar
                  </>
                )}
              </motion.button>
            </div>
          )}
        </div>

        {message && (
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-black ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {!isHorizontal && (
          <div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-700 hover:to-cyan-600 disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  Enviando solicitação...
                </>
              ) : (
                <>
                  <Send className="h-4.5 w-4.5" />
                  Enviar
                </>
              )}
            </motion.button>
          </div>
        )}
      </form>
    </motion.div>
  );
}
