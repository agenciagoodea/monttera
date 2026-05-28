import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileCode, Link as LinkIcon } from 'lucide-react';

declare global {
  interface Window {
    Quill?: any;
  }
}

type HtmlRichEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
};

let quillLoader: Promise<void> | null = null;

function loadQuillFromCdn() {
  if (window.Quill) return Promise.resolve();
  if (quillLoader) return quillLoader;

  quillLoader = new Promise((resolve, reject) => {
    const existingStyle = document.querySelector('link[data-quill-style="snow"]');
    if (!existingStyle) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css';
      link.setAttribute('data-quill-style', 'snow');
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-quill-script="main"]') as HTMLScriptElement | null;
    if (existingScript) {
      if (window.Quill) resolve();
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Falha ao carregar Quill')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
    script.async = true;
    script.setAttribute('data-quill-script', 'main');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Quill'));
    document.body.appendChild(script);
  });

  return quillLoader;
}

function applyHtmlToQuill(instance: any, html: string) {
  const safeHtml = html || '';
  const delta = instance.clipboard.convert(safeHtml);
  instance.setContents(delta, 'silent');
}

export default function HtmlRichEditor({ label, value, onChange, placeholder, rows = 10 }: HtmlRichEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<any>(null);
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [ready, setReady] = useState(false);
  const currentHtmlRef = useRef(value || '');

  const editorMinHeight = useMemo(() => `${Math.max(rows, 6) * 20}px`, [rows]);

  useEffect(() => {
    let active = true;
    loadQuillFromCdn()
      .then(() => {
        if (!active || !editorHostRef.current || quillRef.current || !window.Quill) return;
        const Quill = window.Quill;
        // Forçar uso de inline styles em vez de classes
        const ColorStyle = Quill.import('attributors/style/color');
        Quill.register(ColorStyle, true);
        const BackgroundStyle = Quill.import('attributors/style/background');
        Quill.register(BackgroundStyle, true);
        const AlignStyle = Quill.import('attributors/style/align');
        Quill.register(AlignStyle, true);

        const instance = new Quill(editorHostRef.current, {
          theme: 'snow',
          placeholder: placeholder || '',
          modules: {
            toolbar: [
              ['bold', 'italic'],
              [{ color: [] }, { background: [] }],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['blockquote'],
              [{ align: [] }],
              ['link'],
              ['clean'],
            ],
          },
        });

        applyHtmlToQuill(instance, value || '');
        currentHtmlRef.current = value || '';
        instance.on('text-change', () => {
          const html = instance.root.innerHTML;
          currentHtmlRef.current = html;
          onChange(html);
        });
        quillRef.current = instance;
        setReady(true);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isCodeMode) return;
    if (!quillRef.current) return;
    if (value === currentHtmlRef.current) return;
    currentHtmlRef.current = value || '';
    applyHtmlToQuill(quillRef.current, value || '');
  }, [value, isCodeMode]);

  const toggleMode = () => {
    if (!isCodeMode && quillRef.current) {
      const html = quillRef.current.root.innerHTML;
      currentHtmlRef.current = html;
      onChange(html);
    }
    if (isCodeMode && quillRef.current) {
      applyHtmlToQuill(quillRef.current, value || '');
      currentHtmlRef.current = value || '';
    }
    setIsCodeMode((prev) => !prev);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
        <button
          type="button"
          onClick={toggleMode}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600 bg-white hover:border-blue-300 hover:text-blue-600"
        >
          {isCodeMode ? (
            <>
              <Eye className="w-3 h-3" />
              Modo Visual
            </>
          ) : (
            <>
              <FileCode className="w-3 h-3" />
              Código HTML
            </>
          )}
        </button>
      </div>

      <div className={isCodeMode ? 'block' : 'hidden'}>
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => {
            currentHtmlRef.current = e.target.value;
            onChange(e.target.value);
          }}
          className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all resize-y"
          placeholder={placeholder || 'Digite HTML'}
        />
      </div>

      <div className={!isCodeMode ? 'block' : 'hidden'}>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {!ready && (
            <div className="px-6 py-4 text-xs text-slate-500">Carregando editor...</div>
          )}
          <div className={ready ? 'block' : 'hidden'}>
            <div ref={editorHostRef} style={{ minHeight: editorMinHeight }} />
          </div>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex items-center gap-2">
            <LinkIcon className="w-3 h-3" />
            Use o botão de link na barra para inserir URLs.
          </div>
        </div>
      </div>
    </div>
  );
}
