const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../server.ts');
let content = fs.readFileSync(targetFilePath, 'utf8');

// 1. Adicionar o import no topo do arquivo (procurar o final das importações)
const importTarget = "import { fileURLToPath } from 'url';";
const importReplacement = `import { fileURLToPath } from 'url';\nimport AdmZip from 'adm-zip';`;

// 2. Inserir a API administrativa antes do Vite Integration
const apiTarget = `  // Vite Integration`;
const apiCode = `  // --- MÓDULO FILE MANAGER ADMINISTRATIVO SEGURO ---
  const ROOT_DIR = path.resolve(process.cwd(), 'public');
  const DANGEROUS_EXTENSIONS = ['.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps', '.js', '.jsx', '.ts', '.tsx', '.sh', '.bat', '.cmd', '.exe', '.json', '.htaccess', '.config'];

  function isDangerousFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return DANGEROUS_EXTENSIONS.includes(ext);
  }

  function getSafePath(inputPath) {
    const resolvedPath = path.resolve(ROOT_DIR, inputPath || '');
    const relative = path.relative(ROOT_DIR, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Acesso negado: Path Traversal detectado.');
    }
    return resolvedPath;
  }

  function getDiskSpaceInfo() {
    const info = { total: 100 * 1024 * 1024 * 1024, free: 60 * 1024 * 1024 * 1024, used: 40 * 1024 * 1024 * 1024 };
    try {
      if (process.platform === 'win32') {
        const currentDrive = process.cwd().includes(':') ? process.cwd().split(':')[0] + ':' : 'C:';
        const { execSync } = require('child_process');
        const output = execSync(\`wmic logicaldisk where "DeviceID='\${currentDrive}'" get FreeSpace,Size /format:list\`, { encoding: 'utf8' });
        const freeMatch = output.match(/FreeSpace=(\\d+)/i);
        const sizeMatch = output.match(/Size=(\\d+)/i);
        if (freeMatch && sizeMatch) {
          const free = parseInt(freeMatch[1], 10);
          const total = parseInt(sizeMatch[1], 10);
          return { total, free, used: total - free };
        }
      } else {
        const { execSync } = require('child_process');
        const output = execSync('df -B1 / | tail -n 1', { encoding: 'utf8' });
        const parts = output.trim().split(/\\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const free = parseInt(parts[3], 10);
          return { total, free, used };
        }
      }
    } catch (err) {
      console.error('Falha ao ler espaço em disco real, usando fallback:', err);
    }
    return info;
  }

  // GET /api/admin/files - Listar
  app.get('/api/admin/files', authenticate, isAdmin, async (req, res) => {
    try {
      const queryPath = String(req.query.path || '').trim();
      const targetDir = getSafePath(queryPath);
      
      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Diretório não encontrado' });
      }

      const stats = fs.statSync(targetDir);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'O caminho especificado não é um diretório' });
      }

      const files = fs.readdirSync(targetDir);
      const items = files.map((fileName) => {
        const fullPath = path.join(targetDir, fileName);
        try {
          const s = fs.statSync(fullPath);
          return {
            name: fileName,
            isDir: s.isDirectory(),
            size: s.size,
            updatedAt: s.mtime,
            relative: path.relative(ROOT_DIR, fullPath).replace(/\\\\/g, '/')
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      const disk = getDiskSpaceInfo();
      const currentRelative = path.relative(ROOT_DIR, targetDir).replace(/\\\\/g, '/');

      return res.json({
        currentPath: currentRelative,
        items,
        disk
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao listar arquivos' });
    }
  });

  // POST /api/admin/files/mkdir - Criar pasta
  app.post('/api/admin/files/mkdir', authenticate, isAdmin, async (req, res) => {
    try {
      const baseDirInput = String(req.body.path || '').trim();
      const folderName = String(req.body.name || '').trim();
      if (!folderName || isDangerousFile(folderName) || folderName.includes('/') || folderName.includes('\\\\')) {
        return res.status(400).json({ error: 'Nome de pasta inválido ou contendo caracteres proibidos' });
      }

      const baseDir = getSafePath(baseDirInput);
      const targetPath = path.join(baseDir, folderName);
      
      // Validação final de Path Traversal
      getSafePath(path.relative(ROOT_DIR, targetPath));

      if (fs.existsSync(targetPath)) {
        return res.status(400).json({ error: 'Já existe uma pasta ou arquivo com este nome' });
      }

      fs.mkdirSync(targetPath);
      return res.json({ success: true, message: 'Diretório criado com sucesso!' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao criar diretório' });
    }
  });

  // POST /api/admin/files/rename - Renomear
  app.post('/api/admin/files/rename', authenticate, isAdmin, async (req, res) => {
    try {
      const baseDirInput = String(req.body.path || '').trim();
      const oldName = String(req.body.oldName || '').trim();
      const newName = String(req.body.newName || '').trim();

      if (!oldName || !newName || isDangerousFile(newName) || newName.includes('/') || newName.includes('\\\\')) {
        return res.status(400).json({ error: 'Nome de arquivo inválido ou extensão perigosa' });
      }

      const baseDir = getSafePath(baseDirInput);
      const oldPath = path.join(baseDir, oldName);
      const newPath = path.join(baseDir, newName);

      // Validação Path Traversal
      getSafePath(path.relative(ROOT_DIR, oldPath));
      getSafePath(path.relative(ROOT_DIR, newPath));

      if (!fs.existsSync(oldPath)) {
        return res.status(404).json({ error: 'Arquivo ou diretório original não encontrado' });
      }
      if (fs.existsSync(newPath)) {
        return res.status(400).json({ error: 'Já existe um arquivo ou pasta com este nome' });
      }

      fs.renameSync(oldPath, newPath);
      return res.json({ success: true, message: 'Renomeado com sucesso!' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao renomear arquivo' });
    }
  });

  // POST /api/admin/files/delete - Excluir
  app.post('/api/admin/files/delete', authenticate, isAdmin, async (req, res) => {
    try {
      const baseDirInput = String(req.body.path || '').trim();
      const name = String(req.body.name || '').trim();

      if (!name) {
        return res.status(400).json({ error: 'Nome do arquivo ou diretório é obrigatório' });
      }

      const baseDir = getSafePath(baseDirInput);
      const targetPath = path.join(baseDir, name);

      // Validação Path Traversal
      getSafePath(path.relative(ROOT_DIR, targetPath));

      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Arquivo ou diretório não encontrado' });
      }

      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }

      return res.json({ success: true, message: 'Excluído com sucesso!' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao excluir' });
    }
  });

  // Configuração do multer temporário para a API de arquivos
  const fileManagerTempDir = path.join(process.cwd(), 'temp/uploads_temp');
  if (!fs.existsSync(fileManagerTempDir)) {
    fs.mkdirSync(fileManagerTempDir, { recursive: true });
  }
  const fileManagerUpload = multer({ dest: fileManagerTempDir });

  // POST /api/admin/files/upload - Upload
  app.post('/api/admin/files/upload', authenticate, isAdmin, fileManagerUpload.array('files'), async (req, res) => {
    try {
      const baseDirInput = String(req.body.path || '').trim();
      const baseDir = getSafePath(baseDirInput);
      const reqFiles = (req.files || []) ;

      if (reqFiles.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const uploadedFiles = [];
      const skippedFiles = [];

      for (const file of reqFiles) {
        const originalName = file.originalname;
        if (isDangerousFile(originalName)) {
          fs.unlinkSync(file.path); // Apaga temporário perigoso
          skippedFiles.push(originalName);
          continue;
        }

        const targetPath = path.join(baseDir, originalName);
        
        // Validação Path Traversal final
        getSafePath(path.relative(ROOT_DIR, targetPath));

        // Mover com fallback EXDEV
        try {
          fs.renameSync(file.path, targetPath);
        } catch (renameError) {
          if (renameError.code === 'EXDEV') {
            fs.copyFileSync(file.path, targetPath);
            fs.unlinkSync(file.path);
          } else {
            throw renameError;
          }
        }
        uploadedFiles.push(originalName);
      }

      return res.json({
        success: true,
        message: 'Upload concluído!',
        uploaded: uploadedFiles,
        skipped: skippedFiles
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao realizar upload' });
    }
  });

  // POST /api/admin/files/unzip - Descompactar ZIP com proteção Zip Slip
  app.post('/api/admin/files/unzip', authenticate, isAdmin, async (req, res) => {
    try {
      const baseDirInput = String(req.body.path || '').trim();
      const fileName = String(req.body.name || '').trim();

      if (!fileName || path.extname(fileName).toLowerCase() !== '.zip') {
        return res.status(400).json({ error: 'Apenas arquivos .zip são permitidos para extração' });
      }

      const baseDir = getSafePath(baseDirInput);
      const zipPath = path.join(baseDir, fileName);

      // Validação Path Traversal
      getSafePath(path.relative(ROOT_DIR, zipPath));

      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: 'Arquivo ZIP não encontrado' });
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // Validação antecipada contra Zip Slip e extensões nocivas
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName;
        
        if (isDangerousFile(entryName)) {
          return res.status(400).json({ error: \`O arquivo contido '\${entryName}' possui uma extensão proibida por segurança.\` });
        }

        const targetPath = path.resolve(baseDir, entryName);
        const relative = path.relative(baseDir, targetPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return res.status(400).json({ error: 'Acesso negado: Tentativa de Zip Slip detectada no arquivo ZIP.' });
        }
      }

      // Extração segura
      zip.extractAllTo(baseDir, true);
      return res.json({ success: true, message: 'Arquivo ZIP descompactado com sucesso!' });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Erro ao descompactar arquivo ZIP' });
    }
  });

  // Vite Integration`;

// Normalizar quebras de linha
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');

if (normalizedContent.includes(importTarget) && normalizedContent.includes(apiTarget)) {
  let updated = normalizedContent.replace(importTarget, importReplacement);
  updated = updated.replace(apiTarget, apiCode);
  fs.writeFileSync(targetFilePath, updated, 'utf8');
  console.log('Endpoints File Manager injetados com sucesso no server.ts!');
} else {
  console.error('Erro ao injetar endpoints no server.ts!');
  console.log('Import target found:', normalizedContent.includes(importTarget));
  console.log('API target found:', normalizedContent.includes(apiTarget));
}
