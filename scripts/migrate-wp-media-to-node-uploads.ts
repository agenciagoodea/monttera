import fs from 'node:fs';
import path from 'node:path';
import db from '../src/server/db';

type MediaRef = {
  table: 'products' | 'product_images';
  id: number;
  column: 'image' | 'production_sheet' | 'url';
  value: string;
};

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const verbose = args.has('--verbose');

const projectRoot = process.cwd();
const nodeUploadsRoot = path.resolve(projectRoot, 'public', 'uploads');
const wpUploadsRoot = path.resolve(
  String(process.env.WP_UPLOADS_DIR || '').trim() || path.resolve(projectRoot, 'wp-content', 'uploads'),
);

function toWpRelative(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const noDomain = raw.replace(/^https?:\/\/[^/]+/i, '');
  const marker = '/wp-content/uploads/';
  const idx = noDomain.toLowerCase().indexOf(marker);
  if (idx < 0) return null;
  const rel = noDomain.slice(idx + marker.length).replace(/^\/+/, '');
  if (!rel || /^woocommerce_uploads\//i.test(rel)) return null;
  return rel;
}

function toNodeUrl(rel: string): string {
  return `/uploads/${rel.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function collectMedia(): MediaRef[] {
  const products = db.all<{ id: number; image: string | null; production_sheet: string | null }>(
    'SELECT id, image, production_sheet FROM products',
  );
  const productImages = db.all<{ id: number; url: string | null }>('SELECT id, url FROM product_images');

  const refs: MediaRef[] = [];
  for (const row of products) {
    if (row.image) refs.push({ table: 'products', id: row.id, column: 'image', value: row.image });
    if (row.production_sheet) refs.push({ table: 'products', id: row.id, column: 'production_sheet', value: row.production_sheet });
  }
  for (const row of productImages) {
    if (row.url) refs.push({ table: 'product_images', id: row.id, column: 'url', value: row.url });
  }
  return refs;
}

function main() {
  const refs = collectMedia();
  const targets = refs
    .map((ref) => {
      const rel = toWpRelative(ref.value);
      if (!rel) return null;
      return { ...ref, rel };
    })
    .filter((item): item is MediaRef & { rel: string } => Boolean(item));

  const uniqueRel = Array.from(new Set(targets.map((item) => item.rel)));

  let copied = 0;
  let missing = 0;
  let unchanged = 0;
  let updated = 0;
  const availableRel = new Set<string>();

  for (const rel of uniqueRel) {
    const src = path.resolve(wpUploadsRoot, rel);
    const dst = path.resolve(nodeUploadsRoot, rel);
    if (fs.existsSync(dst)) {
      availableRel.add(rel);
      unchanged += 1;
      continue;
    }
    if (!fs.existsSync(src)) {
      missing += 1;
      if (verbose) console.log(`[missing] ${rel}`);
      continue;
    }
    availableRel.add(rel);
    if (apply) {
      ensureDirFor(dst);
      fs.copyFileSync(src, dst);
    }
    copied += 1;
    if (verbose) console.log(`[copied] ${rel}`);
  }

  for (const item of targets) {
    if (!availableRel.has(item.rel)) continue;
    const nextValue = toNodeUrl(item.rel);
    if (String(item.value).trim() === nextValue) continue;
    if (apply) {
      db.run(`UPDATE ${item.table} SET ${item.column} = ? WHERE id = ?`, nextValue, item.id);
    }
    updated += 1;
  }

  console.log('--- WP Media -> Node Uploads Migration ---');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`WP uploads root: ${wpUploadsRoot}`);
  console.log(`Node uploads root: ${nodeUploadsRoot}`);
  console.log(`Rows scanned: ${refs.length}`);
  console.log(`Rows to normalize: ${targets.length}`);
  console.log(`Files copied: ${copied}`);
  console.log(`Files already present: ${unchanged}`);
  console.log(`Files missing at source: ${missing}`);
  console.log(`DB rows to update: ${updated}`);
  if (!apply) {
    console.log('Run with --apply to execute copy + DB updates.');
  }
}

main();
