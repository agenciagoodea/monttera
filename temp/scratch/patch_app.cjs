const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '../../src/App.tsx');
let content = fs.readFileSync(targetFilePath, 'utf8');

// 1. Adicionar o lazy import
const originalImport = `const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));`;

const replacementImport = `const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminFiles = lazy(() => import('./pages/admin/AdminFiles'));`;

// 2. Adicionar a rota /arquivos
const originalRoute = `                <Route path="/clientes" element={<AdminUserList />} />
                <Route path="/relatorios" element={<AdminReports />} />
                <Route path="/configuracoes" element={<AdminSettings />} />`;

const replacementRoute = `                <Route path="/clientes" element={<AdminUserList />} />
                <Route path="/relatorios" element={<AdminReports />} />
                <Route path="/arquivos" element={<AdminFiles />} />
                <Route path="/configuracoes" element={<AdminSettings />} />`;

// Normalizar
const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
const normalizedContent = content.replace(/\r\n/g, '\n');

const normalizedImportTarget = normalize(originalImport);
const normalizedRouteTarget = normalize(originalRoute);

if (normalizedContent.includes(normalizedImportTarget) && normalizedContent.includes(normalizedRouteTarget)) {
  let updated = normalizedContent.replace(normalizedImportTarget, replacementImport);
  updated = updated.replace(normalizedRouteTarget, replacementRoute);
  fs.writeFileSync(targetFilePath, updated, 'utf8');
  console.log('App.tsx atualizado com sucesso via script patch_app.cjs!');
} else {
  console.error('Erro: não foi possível encontrar os alvos de substituição no App.tsx!');
  console.log('Import target found:', normalizedContent.includes(normalizedImportTarget));
  console.log('Route target found:', normalizedContent.includes(normalizedRouteTarget));
}
