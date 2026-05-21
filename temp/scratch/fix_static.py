import os

target = 'server.ts'
with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# Add static file serving logic to server.ts if not present
static_logic = """
  // ===== Static Files Servicing (Production) =====
  import path from 'path';
  import { fileURLToPath } from 'url';
  import fs from 'fs';
  const __filename_es = fileURLToPath(import.meta.url);
  const _dir = path.dirname(__filename_es);
  const distPath = path.join(_dir, 'dist');
  if (fs.existsSync(distPath)) {
    console.log('Serving static files from:', distPath);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({error: 'Not found'});
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  // ===============================================
"""

if "Serving static files from" not in content:
    # Insert right before startServer() returns app
    return_app = "  return app;\n}\n"
    if return_app in content:
        content = content.replace(return_app, static_logic + "\n" + return_app)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Static serving added to server.ts")
    else:
        print("return app not found")

