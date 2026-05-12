// api/index.ts - Entry point for Vercel Serverless Functions
// This file bridges the Express app (server.ts) with Vercel's serverless environment
import type { IncomingMessage, ServerResponse } from 'http';

let appHandler: ((req: any, res: any) => void) | null = null;
let appInitialized = false;
let initPromise: Promise<void> | null = null;

async function initApp() {
  if (appInitialized) return;
  const { default: handler } = await import('../server.js');
  appHandler = handler;
  appInitialized = true;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!initPromise) {
    initPromise = initApp();
  }
  await initPromise;
  if (appHandler) {
    return appHandler(req, res);
  }
  res.statusCode = 500;
  res.end('Server failed to initialize');
}
