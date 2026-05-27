const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../src/pages/admin/AdminFiles.tsx');
let content = fs.readFileSync(targetFilePath, 'utf8');

// 1. Corrigir a linha 229: const filesArray = Array.from(uploadFiles);
const originalFilesArray = `    // Validar extensões executáveis antes de enviar
    const filesArray = Array.from(uploadFiles);
    const dangerousList = filesArray.filter(file => isDangerousFile(file.name));`;

const replacementFilesArray = `    // Validar extensões executáveis antes de enviar
    const filesArray = Array.from(uploadFiles || []) as File[];
    const dangerousList = filesArray.filter(file => isDangerousFile(file.name));`;

// 2. Corrigir a linha 847: {Array.from(uploadFiles).map((f) => (
const originalListFiles = `                {uploadFiles && uploadFiles.length > 0 && (
                  <div className="mt-4 p-3 bg-white border border-slate-100 rounded-xl max-h-36 overflow-y-auto w-full text-left space-y-1">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Arquivos selecionados ({uploadFiles.length}):
                    </span>
                    {Array.from(uploadFiles).map((f) => (
                      <div key={f.name} className="flex justify-between items-center text-[10px] font-bold text-slate-700">`;

const replacementListFiles = `                {uploadFiles && uploadFiles.length > 0 && (
                  <div className="mt-4 p-3 bg-white border border-slate-100 rounded-xl max-h-36 overflow-y-auto w-full text-left space-y-1">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      Arquivos selecionados ({uploadFiles.length}):
                    </span>
                    {(Array.from(uploadFiles || []) as File[]).map((f) => (
                      <div key={f.name} className="flex justify-between items-center text-[10px] font-bold text-slate-700">`;

// Normalizar
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');

const normalizedImportTarget = normalize(originalFilesArray);
const normalizedListTarget = normalize(originalListFiles);

if (normalizedContent.includes(normalizedImportTarget) && normalizedContent.includes(normalizedListTarget)) {
  let updated = normalizedContent.replace(normalizedImportTarget, replacementFilesArray);
  updated = updated.replace(normalizedListTarget, replacementListFiles);
  fs.writeFileSync(targetFilePath, updated, 'utf8');
  console.log('AdminFiles.tsx corrigido contra tipos desconhecidos com sucesso!');
} else {
  console.error('Erro ao corrigir AdminFiles.tsx!');
  console.log('Target 1 found:', normalizedContent.includes(normalizedImportTarget));
  console.log('Target 2 found:', normalizedContent.includes(normalizedListTarget));
}
