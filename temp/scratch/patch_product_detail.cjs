const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../src/pages/ProductDetail.tsx');
let content = fs.readFileSync(targetFilePath, 'utf8');

// 1. Encontrar o trecho de Pontos e Cores
const targetStr = `          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <Hash className="w-4 h-4" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Pontos</p>
              </div>
              <p className="text-base font-black text-slate-800">{product.stitch_count ?? '-'}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <Palette className="w-4 h-4" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Cores</p>
              </div>
              <p className="text-base font-black text-blue-700">{product.colors || '1'}</p>
            </div>
          </div>`;

const replacementStr = `          <div className={\`grid grid-cols-1 \${hasStitchCount ? 'sm:grid-cols-2' : ''} gap-4 mb-6\`}>
            {hasStitchCount && (
              <div className="p-4 bg-white border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                  <Hash className="w-4 h-4" />
                  <p className="text-[11px] font-bold uppercase tracking-widest">Pontos</p>
                </div>
                <p className="text-base font-black text-slate-800">{product.stitch_count}</p>
              </div>
            )}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <Palette className="w-4 h-4" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Sequência de Cores</p>
              </div>
              <p className="text-base font-black text-blue-700">{product.colors || '1'}</p>
            </div>
          </div>`;

// Fazer o replace tolerando CRLF (\r\n) ou LF (\n)
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = normalize(targetStr);

if (normalizedContent.includes(normalizedTarget)) {
  const index = normalizedContent.indexOf(normalizedTarget);
  // Vamos fazer a substituição direta na string
  content = normalizedContent.replace(normalizedTarget, replacementStr);
  fs.writeFileSync(targetFilePath, content, 'utf8');
  console.log('ProductDetail.tsx atualizado com sucesso via script .cjs!');
} else {
  console.error('Alvo de substituição não encontrado em ProductDetail.tsx!');
}
