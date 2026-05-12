import db from '../src/server/db';

function addBreakAfterSizesTitle(input: string) {
  let out = input || '';

  // Garante quebra de linha após "Tamanho(s) disponível(is):" quando ainda não houver <br/> logo em seguida
  out = out.replace(
    /(►\s*Tamanhos?\s+dispon[ií]veis?(?:\s+por\s+matriz)?\s*:\s*)(?!<br\s*\/?>)/gi,
    '$1<br/>',
  );

  return out;
}

const rows = db.all('SELECT id, short_description FROM products WHERE short_description IS NOT NULL AND short_description <> ""') as any[];

const tx = db.transaction(() => {
  let changed = 0;
  for (const row of rows) {
    const current = String(row.short_description || '');
    const next = addBreakAfterSizesTitle(current);
    if (next !== current) {
      db.run('UPDATE products SET short_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', next, row.id);
      changed += 1;
    }
  }
  return changed;
});

const changed = tx();
const withPattern = db.get('SELECT COUNT(*) as c FROM products WHERE short_description LIKE ?', '%► Tamanhos disponível:%') as any;

console.log(JSON.stringify({
  totalChecked: rows.length,
  changed,
  withPattern: withPattern?.c || 0,
}, null, 2));
