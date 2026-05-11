/**
 * ============================================================
 *  SCRIPT — Importar 23 clientes faltantes + vincular pedidos
 *  Agência Goodea
 * ============================================================
 *
 * COMO USAR:
 *  1. Coloque este script na pasta migracao
 *  2. node migrar-23-clientes.mjs
 * ============================================================
 */

import fetch from "node-fetch";

// ─── CONFIGURAÇÕES ────────────────────────────────────────────
const CONFIG = {
  baseUrl: "http://localhost:3000",
  adminEmail: "contato@agenciagoodea.com",
  adminPassword: "04039866",
  senhaPadrao: "Digital@2025",
};

// ─── OS 23 CLIENTES FALTANTES ─────────────────────────────────
const CLIENTES = [
  { email: "bachegabordados@outlook.com",   nome: "Allan Bachega",                   endereco: "Avenida Fortaleza" },
  { email: "contato@digitalbordados.com.br",nome: "Adriano Souza",                   endereco: "Rua Major Gabriel, Nº 641" },
  { email: "jaque_gprado@hotmail.com",      nome: "Jaqueline Prado",                 endereco: "" },
  { email: "bachegav3n0xxx@gmail.com",      nome: "Eduardo Silva",                   endereco: "Avenida Lografia" },
  { email: "prismabordados@outlook.com",    nome: "Marcelo Correia",                 endereco: "Avenida Soares" },
  { email: "lmbordadosroo@hotmail.com",     nome: "LM Bordados",                     endereco: "R. Gen. Mascarenhas de Morais, 2021" },
  { email: "zuleicabalduino@hotmail.com",   nome: "Zuleica Da Silva Balduino Fernandes", endereco: "" },
  { email: "rreboucas@hotmail.com",         nome: "Rosana VanVleet",                 endereco: "" },
  { email: "camila.vitoria18@outlook.com",  nome: "Camila Rocha",                    endereco: "" },
  { email: "cuadobordado8@gmai.com",        nome: "Gisele Martins",                  endereco: "" },
  { email: "contato@angelbordados.com.br",  nome: "Fernando Carneiro",               endereco: "" },
  { email: "mendes_milene@hotmail.com",     nome: "Milene Mendes",                   endereco: "" },
  { email: "rute_decastro@hotmail.com",     nome: "Rute De Oliveira Castro Passos",  endereco: "" },
  { email: "day-d.a.c@hotmail.com",         nome: "Dayanne Alves da Cunha",          endereco: "" },
  { email: "famabordados1@yahoo.com",       nome: "Ana Luiza Martins",               endereco: "" },
  { email: "bachegas@ig.com.br",            nome: "Allan Bachega",                   endereco: "Avenida Fortaleza" },
  { email: "sthezinha20@outlook.com",       nome: "Sthefanie Melo",                  endereco: "Rua Benedito Luiz Dias q12 l2" },
  { email: "allbachega@hotmail.com",        nome: "Maria Soares",                    endereco: "Avenida Brasil AP" },
  { email: "adrianawt78@yahoo.com",         nome: "Adriana Witt",                    endereco: "Rua 305" },
  { email: "jaciane.menezes@hotmail.com",   nome: "Jaciane de Menezes",              endereco: "" },
  { email: "hellenssp@outlook.com",         nome: "Hellen Suelly Santos Paulo",      endereco: "" },
  { email: "nutriclapis12@gmail.com",       nome: "Carla Clapis",                    endereco: "Rua Pernambuco" },
  { email: "ph_uniformes@hotmail.com",      nome: "Rosangela Andrade Teixeira",      endereco: "Rua Padre Pedro Pinto 2276 loja 02" },
];

// ──────────────────────────────────────────────────────────────

let cookieJar = "";

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

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
  log("🔐 Fazendo login...");
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CONFIG.adminEmail, password: CONFIG.adminPassword }),
  });
  if (!res.ok) throw new Error(`Login falhou: ${await res.text()}`);
  log("✅ Login OK");
}

async function importarClientes() {
  log("\n══════════════════════════════════════");
  log("  ETAPA 1 — Importar 23 clientes");
  log("══════════════════════════════════════\n");

  const emailParaId = {};
  let sucesso = 0, existia = 0, erro = 0;

  for (let i = 0; i < CLIENTES.length; i++) {
    const c = CLIENTES[i];
    const partes = c.nome.trim().split(" ");
    const firstName = partes[0];
    const lastName = partes.slice(1).join(" ");

    const payload = {
      name: c.nome,
      email: c.email,
      password: CONFIG.senhaPadrao, // a rota faz o hash internamente
      role: "customer",
      status: "ativo",
      first_name: firstName,
      last_name: lastName,
      address: c.endereco || "",
    };

    const res = await apiFetch("/api/admin/users/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const id = data.id || data.user?.id;
      emailParaId[c.email] = id;
      log(`  ✅ [${i + 1}/23] ${c.nome} <${c.email}> → ID: ${id}`);
      sucesso++;
    } else if (res.status === 409) {
      const data = await res.json();
      emailParaId[c.email] = data.id;
      log(`  ♻️  [${i + 1}/23] ${c.email} já existe → ID: ${data.id}`);
      existia++;
    } else {
      const txt = await res.text();
      log(`  ❌ [${i + 1}/23] Erro ${c.email}: ${res.status} — ${txt}`);
      erro++;
    }
  }

  log(`\n📊 Clientes — ✅ ${sucesso} criados | ♻️  ${existia} já existiam | ❌ ${erro} erros`);
  return emailParaId;
}

async function vincularPedidos(emailParaId) {
  log("\n══════════════════════════════════════");
  log("  ETAPA 2 — Vincular pedidos guest");
  log("══════════════════════════════════════\n");

  // Buscar todos os pedidos guest (user_id null)
  const res = await apiFetch("/api/admin/orders?user_id=null&per_page=9999");
  if (!res.ok) {
    log("❌ Não foi possível buscar pedidos guest. Verifique se a rota aceita filtro user_id=null.");
    log("   Alternativa: execute o SQL abaixo no phpMyAdmin:\n");
    
    // Gerar SQL direto como fallback
    const emails = Object.keys(emailParaId);
    log("── SQL PARA EXECUTAR NO phpMyAdmin (digitalbordados_novo) ──\n");
    for (const [email, userId] of Object.entries(emailParaId)) {
      if (userId) {
        console.log(`UPDATE orders SET user_id = ${userId} WHERE customer_email = '${email}' AND user_id IS NULL;`);
      }
    }
    log("\n── FIM DO SQL ──");
    return;
  }

  const data = await res.json();
  const pedidosGuest = Array.isArray(data) ? data : (data.orders || []);
  const pedidosParaVincular = pedidosGuest.filter(p => emailParaId[p.customer_email]);

  log(`📦 ${pedidosGuest.length} pedidos guest encontrados`);
  log(`🔗 ${pedidosParaVincular.length} podem ser vinculados\n`);

  let vinculados = 0;

  for (const pedido of pedidosParaVincular) {
    const userId = emailParaId[pedido.customer_email];
    const res2 = await apiFetch(`/api/admin/orders/${pedido.id}/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });

    if (res2.ok) {
      log(`  ✅ Pedido #${pedido.id} (woo: ${pedido.woo_order_id}) → vinculado ao user_id: ${userId}`);
      vinculados++;
    } else {
      log(`  ⚠️  Pedido #${pedido.id} — rota PUT /orders/:id/user não disponível`);
      break;
    }
  }

  if (vinculados === 0) {
    // Fallback: gerar SQL para executar manualmente
    log("\n⚠️  Rota de vínculo não disponível. Execute o SQL abaixo no phpMyAdmin:\n");
    log("── SQL PARA EXECUTAR NO phpMyAdmin (digitalbordados_novo) ──\n");
    for (const [email, userId] of Object.entries(emailParaId)) {
      if (userId) {
        console.log(`UPDATE orders SET user_id = ${userId} WHERE customer_email = '${email}' AND user_id IS NULL;`);
      }
    }
    log("\n── FIM DO SQL ──");
  } else {
    log(`\n📊 Pedidos vinculados: ${vinculados}`);
  }
}

async function main() {
  log("═══════════════════════════════════════════════");
  log("  Migração 23 clientes faltantes");
  log("═══════════════════════════════════════════════\n");

  await login();
  const emailParaId = await importarClientes();
  await vincularPedidos(emailParaId);

  log("\n═══════════════════════════════════════════════");
  log("  CONCLUÍDO!");
  log("═══════════════════════════════════════════════");
}

main().catch(e => {
  console.error(`\n💥 ERRO FATAL: ${e.message}`);
  process.exit(1);
});
