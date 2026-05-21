import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  // Ambientes compartilhados (DirectAdmin/cPanel) costumam limitar criação de threads.
  // Forçamos bindings WASI e threadpool mínimo para evitar panic do runtime Rust.
  UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '1',
  GOMAXPROCS: process.env.GOMAXPROCS || '1',
  RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || '1',
  NAPI_RS_FORCE_WASI: process.env.NAPI_RS_FORCE_WASI || '1',
};

const args = ['./node_modules/vite/bin/vite.js', 'build', '--config', 'vite.config.mjs'];
const child = spawn(process.execPath, args, {
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('[build-client] Falha ao iniciar vite build:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[build-client] Processo encerrado por sinal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
