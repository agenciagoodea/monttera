const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../src/pages/admin/AdminProductForm.tsx');
let content = fs.readFileSync(targetFilePath, 'utf8');

// 1. Inserir o import do ícone Eye
const originalImport = `  Hash,
  Palette
} from 'lucide-react';`;

const replacementImport = `  Hash,
  Palette,
  Eye
} from 'lucide-react';`;

// 2. Inserir o botão "Visualizar Produto" ao lado do botão de Salvar Matriz
const originalButton = `          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : (
              <>
                <Save className="w-5 h-5" />
                Salvar Matriz
              </>
            )}
          </button>`;

const replacementButton = `          {id && formData.slug && (
            <a
              href={\`/produto/\${formData.slug}\`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 transition-all flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Visualizar Produto
            </a>
          )}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : (
              <>
                <Save className="w-5 h-5" />
                Salvar Matriz
              </>
            )}
          </button>`;

// Normalizar quebras de linha
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');

const normalizedImportTarget = normalize(originalImport);
const normalizedButtonTarget = normalize(originalButton);

if (normalizedContent.includes(normalizedImportTarget) && normalizedContent.includes(normalizedButtonTarget)) {
  let updated = normalizedContent.replace(normalizedImportTarget, replacementImport);
  updated = updated.replace(normalizedButtonTarget, replacementButton);
  fs.writeFileSync(targetFilePath, updated, 'utf8');
  console.log('AdminProductForm.tsx atualizado com sucesso via script patch_admin_form.cjs!');
} else {
  console.error('Erro: não foi possível encontrar os alvos de substituição no AdminProductForm.tsx!');
  console.log('Import target found:', normalizedContent.includes(normalizedImportTarget));
  console.log('Button target found:', normalizedContent.includes(normalizedButtonTarget));
}
