const fs = require('fs');
const path = require('path');

const serverContent = fs.readFileSync(path.join(__dirname, '..', '..', 'server.ts'), 'utf8');

const regexes = [
  /\/api\/admin\/lgpd\/consents/i,
  /lgpd_consents/i,
  /lgpd_requests/i,
  /FROM users/i
];

console.log("=== Buscando ocorrências de LGPD / Consents no server.ts ===");

const lines = serverContent.split('\n');
lines.forEach((line, index) => {
  if (line.includes('lgpd') || line.includes('consent') || line.includes('consentimento')) {
    console.log(`Linha ${index + 1}: ${line.trim().substring(0, 120)}`);
  }
});
