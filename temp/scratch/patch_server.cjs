const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../server.ts');
let content = fs.readFileSync(targetFilePath, 'utf8');

// A função original
const targetStr = `function moveUploadedFileToFinalPath(
  file: Express.Multer.File | undefined,
  absoluteDestDir: string,
  finalFileName: string,
): { absolutePath: string; fileName: string } | null {
  if (!file || !file.path || !finalFileName) return null;
  if (!fs.existsSync(absoluteDestDir)) fs.mkdirSync(absoluteDestDir, { recursive: true });
  const source = path.resolve(file.path);
  const target = path.resolve(path.join(absoluteDestDir, finalFileName));
  if (source === target) return { absolutePath: target, fileName: finalFileName };
  fs.renameSync(source, target);
  return { absolutePath: target, fileName: finalFileName };
}`;

// A função modificada
const replacementStr = `function moveUploadedFileToFinalPath(
  file: Express.Multer.File | undefined,
  absoluteDestDir: string,
  finalFileName: string,
): { absolutePath: string; fileName: string } | null {
  if (!file || !file.path || !finalFileName) return null;
  try {
    if (!fs.existsSync(absoluteDestDir)) fs.mkdirSync(absoluteDestDir, { recursive: true });
    const source = path.resolve(file.path);
    const target = path.resolve(path.join(absoluteDestDir, finalFileName));
    if (source === target) return { absolutePath: target, fileName: finalFileName };
    try {
      fs.renameSync(source, target);
    } catch (renameError: any) {
      if (renameError.code === 'EXDEV') {
        fs.copyFileSync(source, target);
        fs.unlinkSync(source);
      } else {
        throw renameError;
      }
    }
    return { absolutePath: target, fileName: finalFileName };
  } catch (error) {
    console.error('Erro ao mover arquivo físico de upload:', error);
    return null;
  }
}`;

// Normalizar quebras de linha
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = normalize(targetStr);

if (normalizedContent.includes(normalizedTarget)) {
  content = normalizedContent.replace(normalizedTarget, replacementStr);
  fs.writeFileSync(targetFilePath, content, 'utf8');
  console.log('server.ts atualizado com sucesso via script patch_server.cjs!');
} else {
  console.error('Erro: não foi possível encontrar a função moveUploadedFileToFinalPath no server.ts!');
}
