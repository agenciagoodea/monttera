/**
 * ============================================================
 *  SCRIPT DE MIGRAÇÃO — WooCommerce → Digital Bordados (Antigravity)
 *  Agência Goodea
 * ============================================================
 *
 * PASSO A PASSO ANTES DE RODAR:
 *
 *  1. Exporte os produtos do WooCommerce usando o plugin
 *     "WP All Export" com as colunas listadas abaixo.
 *     Salve como "produtos.csv" na mesma pasta deste script.
 *
 *  2. Colunas obrigatórias no CSV (exatamente esses nomes):
 *     - ID
 *     - post_title           (nome do produto)
 *     - post_content         (descrição)
 *     - regular_price        (preço normal)
 *     - sale_price           (preço promocional)
 *     - images               (URL da imagem principal)
 *     - categories           (separadas por |)
 *     - tags                 (separadas por |)
 *     - downloadable_files   (URLs dos .zip, separadas por |)
 *     - downloadable_names   (nomes dos arquivos, separados por |)
 *     - quantidade_de_pontos (meta field JetEngine)
 *     - cores                (meta field JetEngine)
 *
 *  3. Coloque este script e o arquivo "produtos.csv"
 *     na mesma pasta.
 *
 *  4. Instale as dependências:
 *     npm install node-fetch form-data csv-parse
 *
 *  5. Execute:
 *     node migrar-produtos.mjs
 *
 *  ⚠️  Rode em ambiente de TESTE primeiro!
 *  ⚠️  O sistema destino deve estar rodando em localhost:3000
 * ============================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import FormData from "form-data";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIGURAÇÕES ────────────────────────────────────────────
const CONFIG = {
  baseUrl: "http://localhost:3000",
  adminEmail: "contato@agenciagoodea.com",
  adminPassword: "04039866",
  csvPath: path.join(__dirname, "produtos.csv"),
  logPath: path.join(__dirname, "migracao.log"),
  // Intervalo entre produtos para não sobrecarregar o servidor (ms)
  delayEntreProdutos: 300,
};
// ──────────────────────────────────────────────────────────────

let cookieJar = "";
const log = (msg) => {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  fs.appendFileSync(CONFIG.logPath, linha + "\n");
};

// ─── UTILITÁRIOS ──────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Remove APENAS os atributos data-start e data-end injetados pelo WordPress/Gutenberg.
 * Mantém todo o HTML intacto para ser salvo no sistema novo.
 */
function limparAtributosWP(html) {
  if (!html) return "";
  return html
    .replace(/\s*data-start="[^"]*"/g, "")
    .replace(/\s*data-end="[^"]*"/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

/**
 * Remove tags HTML e converte para texto puro.
 * Usado apenas para campos que NÃO aceitam HTML (ex: stitch_count, cores).
 */
function limparHTML(html) {
  if (!html) return "";
  return html
    .replace(/<\/(p|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const slugify = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${CONFIG.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Cookie: cookieJar,
    },
  });

  // Captura cookies de set-cookie
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/auth_token=[^;]+/);
    if (match) cookieJar = match[0];
  }

  return res;
}

// ─── AUTENTICAÇÃO ─────────────────────────────────────────────

async function login() {
  log("🔐 Fazendo login como admin...");
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: CONFIG.adminEmail,
      password: CONFIG.adminPassword,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha no login: ${res.status} — ${txt}`);
  }

  const data = await res.json();
  log(`✅ Login OK — usuário: ${data.user?.email || "?"}`);
  return data;
}

// ─── CATEGORIAS ───────────────────────────────────────────────

const categoriaCache = {}; // slug → id

async function buscarCategorias() {
  const res = await apiFetch("/api/admin/categories");
  const lista = await res.json();
  for (const cat of lista) {
    categoriaCache[slugify(cat.name)] = cat.id;
  }
  log(`📂 ${lista.length} categorias já existentes carregadas.`);
}

async function criarCategoria(nome, parentId = null) {
  const slug = slugify(nome);
  if (categoriaCache[slug]) return categoriaCache[slug];

  const body = { name: nome, slug };
  if (parentId) body.parent_id = parentId;

  const res = await apiFetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    log(`⚠️  Erro ao criar categoria "${nome}": ${txt}`);
    return null;
  }

  const data = await res.json();
  const id = data.id || data.category?.id;
  categoriaCache[slug] = id;
  log(`  📁 Categoria criada: "${nome}" (id: ${id})`);
  return id;
}

/**
 * Processa string de categorias do WooCommerce.
 * Formato esperado: "Pai > Filho | Pai2 > Filho2" ou "Categoria Simples"
 * Retorna array de IDs de categorias folha.
 */
async function processarCategorias(strCategorias) {
  if (!strCategorias) return [];

  const ids = [];
  const grupos = strCategorias.split(",").map((s) => s.trim()).filter(Boolean);

  for (const grupo of grupos) {
    const partes = grupo.split(">").map((s) => s.trim());

    let parentId = null;
    let lastId = null;

    for (const parte of partes) {
      const id = await criarCategoria(parte, parentId);
      parentId = id;
      lastId = id;
    }

    if (lastId && !ids.includes(lastId)) ids.push(lastId);
  }

  return ids;
}

// ─── TAGS ─────────────────────────────────────────────────────

const tagCache = {}; // slug → id

async function buscarTags() {
  const res = await apiFetch("/api/admin/tags");
  const lista = await res.json();
  for (const tag of lista) {
    tagCache[slugify(tag.name)] = tag.id;
  }
  log(`🏷️  ${lista.length} tags já existentes carregadas.`);
}

async function criarTag(nome) {
  const slug = slugify(nome);
  if (tagCache[slug]) return tagCache[slug];

  const res = await apiFetch("/api/admin/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, slug }),
  });

  if (!res.ok) {
    log(`⚠️  Erro ao criar tag "${nome}"`);
    return null;
  }

  const data = await res.json();
  const id = data.id || data.tag?.id;
  tagCache[slug] = id;
  return id;
}

async function processarTags(strTags) {
  if (!strTags) return [];

  const ids = [];
  const nomes = strTags.split(",").map((s) => s.trim()).filter(Boolean);

  for (const nome of nomes) {
    const id = await criarTag(nome);
    if (id) ids.push(id);
  }

  return ids;
}

// ─── DOWNLOAD DE IMAGEM ───────────────────────────────────────

async function baixarImagem(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.buffer();
    const ext = url.split(".").pop().split("?")[0] || "jpg";
    return { buffer, ext };
  } catch (e) {
    log(`⚠️  Falha ao baixar imagem: ${url} — ${e.message}`);
    return null;
  }
}

// ─── IMPORTAR PRODUTO ─────────────────────────────────────────

async function importarProduto(row, index, total) {
  const nome = row["post_title"]?.trim();
  if (!nome) {
    log(`⏭️  Linha ${index + 1}: nome vazio, pulando.`);
    return;
  }

  log(`\n[${index + 1}/${total}] 📦 Importando: "${nome}"`);

  // Descrições: mantém HTML mas limpa atributos desnecessários do WordPress
  const descricao = limparAtributosWP(row["post_content"] || "");
  const shortDesc = limparAtributosWP(row["short_description"] || "");

  // Campos nativos do schema Antigravity (tabela products)
  const pontos = (row["quantidade_de_pontos"] || "").toString().trim();
  const cores = (row["cores"] || "").toString().trim();

  // Categorias e tags
  const categoriaIds = await processarCategorias(row["categories"]);
  const tagIds = await processarTags(row["tags"]);

  // Montar FormData (API aceita multipart)
  const form = new FormData();
  form.append("name", nome);
  form.append("slug", slugify(nome));
  form.append("description", descricao.trim());
  if (pontos) form.append("stitch_count", pontos);  // campo nativo: quantidade de pontos
  if (cores) form.append("colors", cores);          // campo nativo: cores
  if (shortDesc) form.append("short_description", shortDesc);

  // Folha de Produção (PDF visível pelo cliente)
  const pdfProducao = (row["arquivo_de_producao"] || row["arquivo_de_producao2"] || "").trim();
  if (pdfProducao) form.append("production_sheet", pdfProducao);

  // short_description já processada acima com limparAtributosWP
  form.append("price", row["regular_price"] || "0");

  if (row["sale_price"]) {
    form.append("promotional_price", row["sale_price"]);
  }

  if (categoriaIds.length > 0) {
    // Categoria principal = primeira da lista
    form.append("category_id", categoriaIds[0]);
    // Todas as categorias como JSON
    form.append("category_ids", JSON.stringify(categoriaIds));
  }

  if (tagIds.length > 0) {
    form.append("tag_ids", JSON.stringify(tagIds));
  }

  // Imagem principal — pega a primeira URL da lista (separadas por vírgula)
  const imgUrl = row["images"]?.split(",")[0]?.trim();

  // Galeria de imagens adicionais
  const galeriaUrls = (row["gallery_images"] || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (imgUrl) {
    const img = await baixarImagem(imgUrl);
    if (img) {
      form.append("image", img.buffer, {
        filename: `produto-${slugify(nome)}.${img.ext}`,
        contentType: `image/${img.ext === "jpg" ? "jpeg" : img.ext}`,
      });
      log(`  🖼️  Imagem baixada OK`);
    }
  }

  // Galeria de imagens adicionais — envia as URLs para o backend salvar em product_images
  if (galeriaUrls.length > 0) {
    form.append("gallery_urls", JSON.stringify(galeriaUrls));
    log(`  🖼️  Galeria: ${galeriaUrls.length} imagem(ns) adicional(is)`);
  }

  // Arquivo de download principal (vem das colunas file_path e file_name do CSV)
  const downloadUrl = (row["file_path"] || "").trim();
  const downloadName = (row["file_name"] || "").trim();

  if (downloadUrl) {
    const filesPayload = [{
      name: downloadName || "arquivo-download.zip",
      url: downloadUrl,
    }];
    form.append("downloadable_files", JSON.stringify(filesPayload));
    log(`  📎 Arquivo de download: ${downloadName || downloadUrl}`);
  }

  // Enviar para a API
  const res = await apiFetch("/api/admin/products", {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  if (!res.ok) {
    const txt = await res.text();
    log(`  ❌ ERRO ao importar "${nome}": ${res.status} — ${txt}`);
    // Log detalhado para diagnóstico
    log(`     → Campos enviados: name=${nome} | price=${row["regular_price"]} | category_ids=${JSON.stringify(categoriaIds)}`);
    return;
  }

  const data = await res.json();
  const prodId = data.id || data.product?.id || "?";
  log(`  ✅ Produto importado com sucesso! ID: ${prodId}`);
}

// ─── MAIN ─────────────────────────────────────────────────────

async function main() {
  // Limpar log anterior
  if (fs.existsSync(CONFIG.logPath)) fs.unlinkSync(CONFIG.logPath);

  log("═══════════════════════════════════════════════");
  log("  MIGRAÇÃO Digital Bordados — Iniciando...");
  log("═══════════════════════════════════════════════");

  // Verificar CSV
  if (!fs.existsSync(CONFIG.csvPath)) {
    log(`❌ Arquivo CSV não encontrado: ${CONFIG.csvPath}`);
    log("   Exporte os produtos do WooCommerce e salve como 'produtos.csv'");
    process.exit(1);
  }

  // Login
  await login();

  // Carregar categorias e tags existentes
  await buscarCategorias();
  await buscarTags();

  // Ler CSV com separador ";" e aspas duplas protegendo campos com HTML/quebras de linha
  const csvContent = fs.readFileSync(CONFIG.csvPath, "utf-8");

  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: ";",
    quote: '"',
    escape: '"',
    relax_column_count: true,
    relax_quotes: true,
    record_delimiter: "\n",
  });

  log(`\n📄 ${rows.length} produtos encontrados no CSV\n`);

  // Estatísticas
  let sucesso = 0;
  let erro = 0;

  for (let i = 0; i < rows.length; i++) {
    try {
      await importarProduto(rows[i], i, rows.length);
      sucesso++;
    } catch (e) {
      log(`  💥 Exceção inesperada no produto ${i + 1}: ${e.message}`);
      erro++;
    }

    // Delay para não sobrecarregar
    if (i < rows.length - 1) await sleep(CONFIG.delayEntreProdutos);
  }

  log("\n═══════════════════════════════════════════════");
  log(`  MIGRAÇÃO CONCLUÍDA`);
  log(`  ✅ Importados com sucesso: ${sucesso}`);
  log(`  ❌ Com erro: ${erro}`);
  log(`  📄 Log completo salvo em: ${CONFIG.logPath}`);
  log("═══════════════════════════════════════════════");
}

main().catch((e) => {
  log(`\n💥 ERRO FATAL: ${e.message}`);
  log(e.stack);
  process.exit(1);
});
