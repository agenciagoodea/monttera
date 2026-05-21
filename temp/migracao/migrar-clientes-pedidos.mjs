/**
 * ============================================================
 *  SCRIPT DE MIGRAÇÃO — Clientes e Pedidos
 *  WooCommerce → Digital Bordados (Antigravity)
 *  Agência Goodea
 * ============================================================
 *
 * COMO USAR:
 *  1. Coloque este script na mesma pasta que:
 *     - clientes.csv
 *     - pedidos.csv
 *  2. npm install node-fetch csv-parse bcryptjs
 *  3. node migrar-clientes-pedidos.mjs
 * ============================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIGURAÇÕES ────────────────────────────────────────────
const CONFIG = {
  baseUrl: "http://localhost:3000",
  adminEmail: "contato@agenciagoodea.com",
  adminPassword: "04039866",
  clientesCsv: path.join(__dirname, "clientes.csv"),
  pedidosCsv: path.join(__dirname, "pedidos.csv"),
  logPath: path.join(__dirname, "migracao-clientes.log"),
  // Senha padrão para clientes sem senha cadastrada
  senhaPadrao: "Digital@2025",
  // Delay entre operações (ms)
  delay: 100,
};
// ──────────────────────────────────────────────────────────────

let cookieJar = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (msg) => {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  console.log(linha);
  fs.appendFileSync(CONFIG.logPath, linha + "\n");
};

// ─── MAPEAMENTO DE STATUS ─────────────────────────────────────
function mapearStatus(wooStatus) {
  const mapa = {
    "wc-completed":  "paid",
    "wc-processing": "processing",
    "wc-pending":    "pending",
    "wc-cancelled":  "cancelled",
    "wc-refunded":   "refunded",
    "wc-failed":     "failed",
  };
  return mapa[wooStatus] || "pending";
}

// ─── MAPEAMENTO MÉTODO DE PAGAMENTO ───────────────────────────
function mapearPagamento(metodo) {
  if (!metodo) return "outros";
  const m = metodo.toLowerCase();
  if (m.includes("pix")) return "pix";
  if (m.includes("crédito") || m.includes("credito") || m.includes("credit")) return "credit_card";
  if (m.includes("débito") || m.includes("debito") || m.includes("debit")) return "debit_card";
  if (m.includes("paypal")) return "paypal";
  if (m.includes("mercado")) return "mercado_pago";
  return "outros";
}

// ─── AUTENTICAÇÃO ─────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${CONFIG.baseUrl}${endpoint}`, {
    ...options,
    headers: { ...(options.headers || {}), Cookie: cookieJar },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/auth_token=[^;]+/);
    if (match) cookieJar = match[0];
  }
  return res;
}

async function login() {
  log("🔐 Fazendo login como admin...");
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CONFIG.adminEmail, password: CONFIG.adminPassword }),
  });
  if (!res.ok) throw new Error(`Login falhou: ${res.status} — ${await res.text()}`);
  const data = await res.json();
  log(`✅ Login OK — ${data.user?.email}`);
}

// ─── LER CSV ──────────────────────────────────────────────────
function lerCsv(arquivo) {
  const content = fs.readFileSync(arquivo, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    on_record_mismatch: "skip",
  });
}

// ─── MIGRAR CLIENTES ──────────────────────────────────────────
async function migrarClientes() {
  log("\n══════════════════════════════════════");
  log("  ETAPA 1 — CLIENTES");
  log("══════════════════════════════════════");

  const rows = lerCsv(CONFIG.clientesCsv);
  log(`📄 ${rows.length} clientes encontrados no CSV`);

  let sucesso = 0, erro = 0, pulado = 0;

  // Mapa email → user_id (para usar na migração de pedidos)
  const emailParaId = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = (row["user_mail"] || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      log(`⏭️  [${i + 1}/${rows.length}] Email inválido, pulando`);
      pulado++;
      continue;
    }

    const firstName = (row["first_name"] || "").trim();
    const lastName  = (row["last_name"]  || "").trim();
    const nome = (row["name"] || `${firstName} ${lastName}`).trim() || email.split("@")[0];

    // Gerar hash da senha
    const senhaOriginal = (row["senha"] || "").trim();
    const senhaFinal = senhaOriginal || CONFIG.senhaPadrao;
    const senhaHash = await bcrypt.hash(senhaFinal, 10);

    const payload = {
      name: nome,
      email: email,
      password: senhaHash,
      role: "customer",
      status: "ativo",
      phone:    (row["billing_phone"]    || "").trim(),
      cpf:      (row["billing_cpf"]      || "").trim(),
      address:  (row["billing_address_1"]|| "").trim(),
      city:     (row["billing_city"]     || "").trim(),
      state:    (row["billing_state"]    || "").trim(),
      zip:      (row["billing_postcode"] || "").trim(),
      country:  (row["billing_country"]  || "BR").trim(),
      date_registered: row["User Registered"] || null,
      first_name: firstName,
      last_name:  lastName,
      woo_user_id: row["ID"] || null,
    };

    try {
      const res = await apiFetch("/api/admin/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const userId = data.id || data.user?.id;
        emailParaId[email] = userId;
        log(`  ✅ [${i + 1}/${rows.length}] ${nome} <${email}> → ID: ${userId}`);
        sucesso++;
      } else {
        const txt = await res.text();
        // Se já existe (409), tenta buscar o ID existente
        if (res.status === 409) {
          const busca = await apiFetch(`/api/admin/users?email=${encodeURIComponent(email)}`);
          if (busca.ok) {
            const lista = await busca.json();
            const user = Array.isArray(lista) ? lista.find(u => u.email === email) : lista;
            if (user?.id) {
              emailParaId[email] = user.id;
              log(`  ♻️  [${i + 1}/${rows.length}] ${email} já existe → ID: ${user.id}`);
              pulado++;
              continue;
            }
          }
        }
        log(`  ❌ [${i + 1}/${rows.length}] Erro ao importar ${email}: ${res.status} — ${txt}`);
        erro++;
      }
    } catch (e) {
      log(`  💥 [${i + 1}/${rows.length}] Exceção: ${e.message}`);
      erro++;
    }

    await sleep(CONFIG.delay);
  }

  log(`\n📊 Clientes — ✅ ${sucesso} | ♻️  ${pulado} | ❌ ${erro}`);
  return emailParaId;
}

// ─── MIGRAR PEDIDOS ───────────────────────────────────────────
async function migrarPedidos(emailParaId) {
  log("\n══════════════════════════════════════");
  log("  ETAPA 2 — PEDIDOS");
  log("══════════════════════════════════════");

  const rows = lerCsv(CONFIG.pedidosCsv);
  log(`📄 ${rows.length} linhas de pedidos encontradas no CSV`);

  // Agrupar linhas por Order ID (pedidos multi-item)
  const pedidosMap = {};
  for (const row of rows) {
    const orderId = String(row["Order ID"] || "").trim();
    if (!orderId) continue;
    if (!pedidosMap[orderId]) {
      pedidosMap[orderId] = {
        order_id:             orderId,
        customer_email:       (row["customer_email"] || "").trim().toLowerCase(),
        customer_first_name:  (row["customer_first_name"] || "").trim(),
        customer_last_name:   (row["customer_last_name"] || "").trim(),
        order_total:          parseFloat(row["order_total"]) || 0,
        order_status:         row["order_status"] || "wc-pending",
        payment_method:       row["payment_method"] || "",
        transaction_id:       row["transaction_id"] || "",
        date_created:         row["date_created"] || null,
        date_paid:            row["date_paid"] || null,
        billing_address:      row["billing_address"] || "",
        items: [],
      };
    }
    // Adicionar item ao pedido
    const productId = row["item_product_id"];
    if (productId) {
      pedidosMap[orderId].items.push({
        woo_product_id: String(productId).replace(".0", ""),
        product_name:   row["item_name"] || "",
        quantity:       parseInt(row["item_quantity"]) || 1,
        price:          parseFloat(row["item_total"]) || 0,
      });
    }
  }

  const pedidos = Object.values(pedidosMap);
  log(`📦 ${pedidos.length} pedidos únicos agrupados`);

  // Buscar mapa de slug/woo_id → novo product_id
  log("🔍 Buscando produtos no novo sistema...");
  const produtoMap = await buscarMapaProdutos();
  log(`  → ${Object.keys(produtoMap).length} produtos mapeados`);

  let sucesso = 0, erro = 0, pulado = 0;

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const email = pedido.customer_email;

    // Buscar user_id pelo email
    let userId = emailParaId[email];
    if (!userId) {
      // Tentar buscar na API
      try {
        const res = await apiFetch(`/api/admin/users?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const lista = await res.json();
          const user = Array.isArray(lista) ? lista.find(u => u.email === email) : lista;
          if (user?.id) userId = user.id;
        }
      } catch (_) {}
    }

    if (!userId) {
      log(`  ⚠️  [${i + 1}/${pedidos.length}] Cliente não encontrado: ${email} — criando como guest`);
      userId = null;
    }

    // Mapear itens para product_id do novo sistema
    const itens = pedido.items.map((item) => {
      const novoId = produtoMap[item.woo_product_id] || null;
      return {
        product_id:   novoId,
        product_name: item.product_name,
        quantity:     item.quantity,
        price:        item.price,
      };
    });

    const payload = {
      user_id:          userId,
      customer_email:   email,
      customer_name:    `${pedido.customer_first_name} ${pedido.customer_last_name}`.trim(),
      total:            pedido.order_total,
      status:           mapearStatus(pedido.order_status),
      payment_method:   mapearPagamento(pedido.payment_method),
      transaction_id:   pedido.transaction_id,
      billing_address:  pedido.billing_address,
      woo_order_id:     pedido.order_id,
      created_at:       pedido.date_created,
      paid_at:          pedido.date_paid || null,
      items:            itens,
    };

    try {
      const res = await apiFetch("/api/admin/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        log(`  ✅ [${i + 1}/${pedidos.length}] Pedido #${pedido.order_id} → ID: ${data.id || data.order?.id} | Status: ${payload.status} | Total: R$${pedido.order_total}`);
        sucesso++;
      } else {
        const txt = await res.text();
        log(`  ❌ [${i + 1}/${pedidos.length}] Erro pedido #${pedido.order_id}: ${res.status} — ${txt}`);
        erro++;
      }
    } catch (e) {
      log(`  💥 [${i + 1}/${pedidos.length}] Exceção pedido #${pedido.order_id}: ${e.message}`);
      erro++;
    }

    await sleep(CONFIG.delay);
  }

  log(`\n📊 Pedidos — ✅ ${sucesso} | ❌ ${erro} | ⏭️  ${pulado}`);
}

// ─── BUSCAR MAPA DE PRODUTOS ──────────────────────────────────
// Retorna { woo_product_id: novo_id } usando o campo woo_id
// (se não existir na API, retorna mapa vazio — itens ficam sem product_id)
async function buscarMapaProdutos() {
  try {
    const res = await apiFetch("/api/admin/products?per_page=9999");
    if (!res.ok) return {};
    const data = await res.json();
    const lista = Array.isArray(data) ? data : (data.products || []);
    const mapa = {};
    for (const p of lista) {
      // Tenta mapear pelo woo_id se existir, senão pelo nome
      if (p.woo_id) mapa[String(p.woo_id)] = p.id;
    }
    return mapa;
  } catch (_) {
    return {};
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  if (fs.existsSync(CONFIG.logPath)) fs.unlinkSync(CONFIG.logPath);

  log("═══════════════════════════════════════════════");
  log("  MIGRAÇÃO Clientes + Pedidos — Iniciando...");
  log("═══════════════════════════════════════════════");

  if (!fs.existsSync(CONFIG.clientesCsv)) {
    log("❌ clientes.csv não encontrado!"); process.exit(1);
  }
  if (!fs.existsSync(CONFIG.pedidosCsv)) {
    log("❌ pedidos.csv não encontrado!"); process.exit(1);
  }

  await login();

  // Etapa 1: Clientes
  const emailParaId = await migrarClientes();

  // Etapa 2: Pedidos
  await migrarPedidos(emailParaId);

  log("\n═══════════════════════════════════════════════");
  log("  MIGRAÇÃO CONCLUÍDA!");
  log(`  📄 Log salvo em: ${CONFIG.logPath}`);
  log("═══════════════════════════════════════════════");
}

main().catch((e) => {
  log(`\n💥 ERRO FATAL: ${e.message}\n${e.stack}`);
  process.exit(1);
});
