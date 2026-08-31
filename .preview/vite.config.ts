/**
 * Config descartavel so para VER telas que exigem login (Financeiro, Estoque).
 *
 * A tela exige sessao no Supabase, que nao existe na maquina de quem
 * desenvolve. Em vez de conferir o calculo "por sonda" — que foi o que
 * deixou a tela de fechamento sem nunca ter sido vista —, este config troca
 * `src/auth.ts` e `src/supabase.ts` por versoes de mentira **no momento de
 * carregar**, sem alterar uma linha do codigo real.
 *
 * Os numeros sao o pior caso de largura: CHF 1234.50 em todas as linhas.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const MOCK_AUTH = `
import { useState } from "react";
export function useAuth() {
  return { kind: "ativo", identity: { userId: "u-teste", email: "teste@sunbite.ch" } };
}
export async function ensureFreshSession() {}
export async function login() {}
export async function logout() {}
`;

const ROWS = {
  expenses: [
    { id: "e1", type: "despesa", category: "ingredientes", description: "Erdbeeren / Morangos 6 kg", value: 1234.5, occurred_at: "2026-08-26", operation_id: "op1", created_by: null, created_at: "" },
    { id: "e2", type: "movimento_caixa", category: "ajuste", description: "Diferenca no fechamento", value: -12.5, occurred_at: "2026-08-25", operation_id: "op1", created_by: null, created_at: "" },
    { id: "e3", type: "movimento_caixa", category: null, description: "Levado ao banco", value: -300, occurred_at: "2026-08-25", operation_id: "op1", created_by: null, created_at: "" },
    { id: "e4", type: "entrada", category: "operacional", description: "Reforco de troco", value: 100, occurred_at: "2026-08-24", operation_id: "op1", created_by: null, created_at: "" },
  ],
  v_finance_daily: [
    { local_date: new Date().toISOString().slice(0, 10), receita_dinheiro: 1234.5, receita_twint: 1234.5, receita_total: 2469, despesas: 1234.5, entradas: 100, movimentos_caixa: -312.5 },
    { local_date: "2026-08-25", receita_dinheiro: 210, receita_twint: 88, receita_total: 298, despesas: 0, entradas: 0, movimentos_caixa: 0 },
  ],
  // `status: "open"` de proposito: e o unico estado em que a fase Operacao e
  // o Encerramento mostram o que tem para mostrar. As colunas sao as mesmas
  // de producao — mock com meia linha esconde exatamente o que se quer ver.
  operations: [
    {
      id: "op1",
      local_date: new Date().toISOString().slice(0, 10),
      place_id: "pl1",
      event_id: "ev1",
      status: "open",
      cash_initial: 1234.5,
      cash_final: null,
      opened_by: "u-teste",
      opened_at: "2026-08-28T09:12:00Z",
      closed_by: null,
      closed_at: null,
      created_at: "2026-08-28T08:00:00Z",
    },
  ],
  places: [
    { id: "pl1", name: "Aarau Färberplatz", city: "Aarau" },
    { id: "pl2", name: "Zofingen Altstadt", city: "Zofingen" },
  ],
  events: [
    { id: "ev1", starts_at: "2026-08-28T10:00:00Z", label_de: "Wochenmarkt Aarau", label_en: "Aarau Market" },
  ],
  // Os 40 itens reais do banco (ops13-checklist-rodar-no-supabase.sql), com o
  // apelido do desenho. O alemao aqui e o pior caso de largura de proposito —
  // "Verwendbares Produkt sicher lagern" e o rotulo mais longo do checklist.
  checklist_templates: [
    ["preparacao", "Caixa vermelha", "Rote Kiste", "caixa-vermelha", false],
    ["preparacao", "Dinheiro contado dentro da caixa", "Geld in der Kiste gezählt", "dinheiro", false],
    ["preparacao", "Duas colheres de chocolate", "Zwei Schokoladenlöffel", "colher-chocolate", false],
    ["preparacao", "Dois recipientes para chocolate", "Zwei Schokoladenbehälter", "recipiente-chocolate", false],
    ["preparacao", "Duas tampas dos recipientes", "Zwei Behälterdeckel", "tampa", false],
    ["preparacao", "Tripé para celular", "Handystativ", "tripe", false],
    ["preparacao", "Carregador do celular", "Handyladegerät", "carregador", false],
    ["preparacao", "Celular carregado", "Handy geladen", "celular", false],
    ["preparacao", "Luvas pretas", "Schwarze Handschuhe", "luvas", false],
    ["preparacao", "Sacos de lixo", "Abfallsäcke", "saco-lixo", false],
    ["preparacao", "Caixa de som", "Lautsprecher", "caixa-som", false],
    ["preparacao", "Caixa de som carregada", "Lautsprecher geladen", "caixa-som-bateria", false],
    ["preparacao", "Bateria da geladeira carregada", "Kühlschrankbatterie geladen", "bateria-geladeira", true],
    ["preparacao", "Bateria do motor carregada", "Motorbatterie geladen", "bateria-motor", true],
    ["preparacao", "Pacotes de gelo", "Eispackungen", "gelo", false],
    ["preparacao", "Gelo no congelador na véspera", "Eis am Vortag ins Gefrierfach", "congelador", false],
    ["preparacao", "Material/QR Code TWINT", "TWINT-Material/QR-Code", "twint", false],
    ["preparacao", "4 barras de ferro", "4 Eisenstangen", "barra-ferro", false],
    ["saida", "Local confirmado", "Ort bestätigt", "local", false],
    ["saida", "Horário confirmado", "Zeit bestätigt", "horario", false],
    ["saida", "Autorização verificada", "Bewilligung geprüft", "autorizacao", true],
    ["saida", "Morangos", "Erdbeeren", "morango", true],
    ["saida", "Chocolate", "Schokolade", "chocolate", true],
    ["saida", "Toppings", "Toppings", "topping", false],
    ["saida", "Chantilly", "Schlagrahm", "chantilly", false],
    ["saida", "Copos", "Becher", "copo", true],
    ["saida", "Freio", "Bremse", "freio", true],
    ["saida", "Bateria", "Batterie", "bateria", true],
    ["operacao", "Abrir o teto para o painel solar", "Dach für das Solarpanel öffnen", "teto-solar", true],
    ["encerramento", "Parar novos pedidos", "Keine neuen Bestellungen", "parar-pedidos", false],
    ["encerramento", "Contabilizar ingredientes restantes", "Restliche Zutaten zählen", "contar-ingredientes", false],
    ["encerramento", "Identificar produto descartável", "Wegwerfware bestimmen", "descartar", false],
    ["encerramento", "Guardar produto aproveitável de forma segura", "Verwendbares Produkt sicher lagern", "guardar", false],
    ["encerramento", "Fechar caixa", "Kasse abschliessen", "fechar-caixa", true],
    ["encerramento", "Conferir TWINT", "TWINT prüfen", "conferir-twint", true],
    ["encerramento", "Desligar equipamentos", "Geräte ausschalten", "desligar", false],
    ["encerramento", "Limpar superfícies", "Oberflächen reinigen", "limpar", false],
    ["encerramento", "Desmontar materiais", "Material abbauen", "desmontar", false],
    ["encerramento", "Carregar equipamentos", "Geräte einladen", "carregar-bike", false],
    ["encerramento", "Verificar se nada ficou no local", "Prüfen, ob nichts liegen bleibt", "nada-esquecido", false],
  ].map(([phase, label_pt, label_de, icon, critical], i) => ({
    id: "tp" + i,
    phase,
    label_pt,
    label_de,
    icon,
    critical,
    sort_order: i * 10,
    active: true,
  })),
  sales: [
    { total: 1234.5, payment: "cash", cancelled: false },
    { total: 1234.5, payment: "twint", cancelled: false },
    { total: 99, payment: "cash", cancelled: true },
  ],
  // Fatia 5. Os numeros saem do teste em Postgres de verdade (PGlite), mais
  // dois casos que a tela precisa saber mostrar: item fora da ficha, e item
  // que ficou negativo por nunca ter tido compra lancada.
  v_stock_status: [
    { id: "s1", name: "Morango", unit: "kg", low_stock_threshold: 2, entradas: 1234.5, consumido: 1.872, calculado: 1232.628, por_copo: 0.156, copos_restantes: 7901, ultima_contagem: "2026-08-25T18:00:00Z" },
    { id: "s2", name: "Chocolate", unit: "kg", low_stock_threshold: 2.5, entradas: 10, consumido: 0.396, calculado: 9.604, por_copo: 0.033, copos_restantes: 291, ultima_contagem: null },
    { id: "s3", name: "Copo 300ml rPET", unit: "unidade", low_stock_threshold: 100, entradas: 0, consumido: 12, calculado: -12, por_copo: 1, copos_restantes: -12, ultima_contagem: null },
    { id: "s4", name: "Amendoa tostada", unit: "kg", low_stock_threshold: 0.5, entradas: 1, consumido: 0.165, calculado: 0.335, por_copo: null, copos_restantes: null, ultima_contagem: null },
  ],
  stock_items: [
    { id: "s1", name: "Morango", unit: "kg" },
    { id: "s2", name: "Chocolate", unit: "kg" },
    { id: "s3", name: "Copo 300ml rPET", unit: "unidade" },
    { id: "s4", name: "Amendoa tostada", unit: "kg" },
  ],
  // Colunas completas: o card de Fornecedores mostra produto, contato e nota,
  // e mock com so `name` esconde exatamente o que se quer julgar. O nome longo
  // e o pior caso de largura.
  suppliers: [
    { id: "f1", name: "A confirmar — morango", product: "Erdbeeren / Morangos", contact: "+41 76 583 52 22", notes: "Ainda sem contrato; comprar avulso ate fechar." },
    { id: "f2", name: "Denner Aarau Bahnhofstrasse", product: "Schokolade, Becher", contact: "062 823 11 22", notes: null },
    { id: "f3", name: "Migros", product: "Rahm", contact: null, notes: null },
  ],
  equipment: [
    { id: "eq1", name: "Freio da foodbike", status: "issue", critical: true, notes: "Freio fraco — problema de seguranca ativo." },
    { id: "eq2", name: "Bateria do motor", status: "issue", critical: true, notes: "Descarrega apesar de indicar 100%." },
  ],
  pendencies: [
    { id: "pd1", description: "Confirmar local da venda de 15.08.2026", critical: false, status: "aberta", origin: "seed" },
  ],
  purchases: [
    { id: "p1", supplier_id: "f2", purchased_at: "2026-08-25", total: 1234.5, notes: null, created_by: null, created_at: "" },
    { id: "p2", supplier_id: "f1", purchased_at: "2026-08-20", total: 55, notes: null, created_by: null, created_at: "" },
  ],
  // Fatia 6. Historico de chat com os tres casos que a tela precisa saber
  // mostrar: pergunta respondida so em texto, frase que virou cards (um ja
  // aplicado, um ja descartado, um ainda pendente), e o pior caso de largura
  // — texto longo em alemao com CHF 1234.50 dentro.
  ai_messages: [
    {
      id: "m1",
      input_text: "quanto vendemos hoje?",
      reply_text: "Hoje: CHF 1234.50 em 15 vendas, 27 copos. Dinheiro CHF 1234.50, TWINT CHF 1234.50. Uma venda cancelada.",
      error: null,
      created_at: "2026-08-26T10:00:00Z",
      ai_suggestions: [],
    },
    {
      id: "m2",
      input_text: "acabou o marshmallow, comprei 2,5kg de chocolate por 20 na Denner, a colher nova nao chegou e o freio continua ruim",
      reply_text: "Anotado. O marshmallow zerei pelo saldo atual — confere se bate.",
      error: null,
      created_at: "2026-08-26T10:05:00Z",
      ai_suggestions: [
        { id: "c1", message_id: "m2", target_table: "stock_movements", operation: "insert", summary: "Baixa de marshmallow (acabou o estoque)", payload: { stock_item_name: "Marshmallow", quantity_delta: -3, reason: "ajuste", notes: "Saldo zerado conforme relato de fim do dia" }, uncertain: true, status: "pending" },
        { id: "c2", message_id: "m2", target_table: "purchases", operation: "insert", summary: "Compra de 2,5kg de chocolate na Denner por CHF 1234.50", payload: { supplier_name: "Denner Aarau", purchased_at: "2026-08-26", total: 1234.5, itens: [{ descricao: "Chocolate", quantidade: 2.5, custo_unitario: 493.8, stock_item_name: "Chocolate" }] }, uncertain: false, status: "applied" },
        { id: "c3", message_id: "m2", target_table: "pendencies", operation: "insert", summary: "Colher nova nao chegou", payload: { description: "Colher nova pendente de entrega", critical: false, origin: "compra" }, uncertain: false, status: "rejected" },
        { id: "c4", message_id: "m2", target_table: "equipment", operation: "insert", summary: "Freio da foodbike continua com problema", payload: { name: "Freio da foodbike", status: "issue", critical: true, notes: "Relato de fim de dia: problema persiste" }, uncertain: false, status: "pending" },
      ],
    },
  ],
};

const MOCK_SUPABASE = `
const ROWS = ${JSON.stringify(ROWS)};

// ?checked= decide quanto do checklist ja esta marcado, porque a trava de
// fase so da para fotografar em mais de um estado:
//   (vazio) 12 de 18 na preparacao -> Saida, Operacao e Encerramento travadas
//   prep    preparacao inteira     -> Saida aberta, Operacao travada
//   all     tudo marcado           -> nada travado, da para ver o Encerramento
const _marcado = new URLSearchParams(location.search).get("checked");
ROWS.checklist_state = ROWS.checklist_templates
  .filter((tp) =>
    _marcado === "all" ||
    (_marcado === "prep" && tp.phase === "preparacao") ||
    (!_marcado && tp.phase === "preparacao" && tp.sort_order < 120))
  .map((tp) => ({
    id: "st-" + tp.id,
    operation_id: "op1",
    template_id: tp.id,
    checked: true,
    checked_by: "u-teste",
    checked_at: "2026-08-28T08:30:00Z",
  }));

const result = (table) => {
  // order() ordena de verdade: enquanto era no-op, o preview nao conseguia
  // pegar erro de ordenacao — e chat sem ordem certa e chat errado.
  let rows = [...(ROWS[table] ?? [])];
  // insert() precisa devolver a linha criada com id, como o Supabase de
  // verdade faz. Sem isto, aprovar um card estourava no preview por um
  // motivo que nao existe em producao.
  let inserted = null;
  let sorts = [];
  const q = {
    select: () => q, eq: () => q, neq: () => q,
    insert: (row) => { inserted = { id: "novo-" + table, ...row }; return q; },
    // Multi-chave de verdade. Era uma ordenacao so, e a ultima chamada
    // desfazia a anterior — .order("phase").order("sort_order") do checklist
    // perdia o agrupamento por fase, que em producao existe. Mock que ordena
    // diferente do Postgres e mock que mente.
    order: (col, opts) => {
      sorts.push([col, opts?.ascending !== false]);
      rows.sort((a, b) => {
        for (const [c, asc] of sorts) {
          const d = a?.[c] > b?.[c] ? 1 : a?.[c] < b?.[c] ? -1 : 0;
          if (d) return d * (asc ? 1 : -1);
        }
        return 0;
      });
      return q;
    },
    // A tela de Operacao grava por queueWrite -> outbox -> upsert. Sem isto,
    // marcar um item do checklist estourava "q.upsert is not a function" —
    // erro que nao existe em producao. Grava na copia em memoria, para o
    // item continuar marcado se a tela recarregar os dados.
    upsert: (row) => {
      const lista = ROWS[table] ?? (ROWS[table] = []);
      const i = lista.findIndex((r) => r.id === row.id);
      if (i >= 0) lista[i] = { ...lista[i], ...row };
      else lista.push(row);
      return Promise.resolve({ data: [row], error: null });
    },
    limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
    single: () => Promise.resolve({ data: inserted ?? rows[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    update: () => q,
    ilike: () => q,
    then: (f, r) => Promise.resolve({ data: rows, error: null }).then(f, r),
    catch: (f) => Promise.resolve({ data: rows, error: null }).catch(f),
    finally: (f) => Promise.resolve({ data: rows, error: null }).finally(f),
  };
  return q;
};
export function getSupabase() {
  return Promise.resolve({
    from: (table) => result(table),
    // A tela de Operacao chama subscribeRealtime() ao montar. Sem channel()
    // aqui, ela estourava "supabase.channel is not a function" — um erro que
    // NAO existe em producao, e que so aparecia porque o mock nao sabia fazer
    // isto. Ensinar o mock, nunca contornar: assina de mentira, nao emite
    // evento nenhum, e devolve o mesmo formato que removeChannel() espera.
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: (cb) => { cb?.("SUBSCRIBED"); return ch; },
        send: () => Promise.resolve("ok"),
      };
      return ch;
    },
    removeChannel: () => Promise.resolve("ok"),
    // Fatia 6: a IA responde de mentira, para a tela poder ser vista sem
    // gastar chamada de verdade nem sujar o banco.
    functions: {
      invoke: (_name, opts) => {
        const texto = opts?.body?.texto ?? "";
        const pergunta = /\\?|quanto|wie viel|wieviel/i.test(texto);
        return Promise.resolve({
          data: pergunta
            ? { message_id: "novo", reply_text: "Hoje: CHF 1234.50 em 15 vendas, 27 copos. Dinheiro CHF 1234.50, TWINT CHF 1234.50.", cards: [] }
            : {
                message_id: "novo",
                reply_text: "Anotado.",
                cards: [{ id: "novo1", message_id: "novo", target_table: "pendencies", operation: "insert", summary: texto.slice(0, 60), payload: { description: texto.slice(0, 80), critical: false, origin: "ia" }, uncertain: false, status: "pending" }],
              },
          error: null,
        });
      },
    },
  });
}
`;


const MOCK_MAIN = `
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FinanceScreen from "./components/FinanceScreen.tsx";
import StockScreen from "./components/StockScreen.tsx";
import AIScreen from "./components/AIScreen.tsx";
import OperationScreen from "./components/OperationScreen.tsx";
// Parte 3: as duas telas de bastidor que exigem sessao. Vendas e Ajustes NAO
// entram aqui de proposito — nao pedem login, entao sao vistas no app de
// verdade em :5173, onde Vendas ainda le as vendas reais do IndexedDB.
import EquipmentScreen from "./components/EquipmentScreen.tsx";
import SuppliersScreen from "./components/SuppliersScreen.tsx";
import { LangProvider } from "./i18n.tsx";

// Abre direto na tela do ?screen=, no idioma do ?lang= — o unico jeito de
// fotografar sem sessao no Supabase. Nada disto existe no app real.
const params = new URLSearchParams(location.search);
const lang = params.get("lang");
if (lang === "de" || lang === "pt") localStorage.setItem("sunbite.lang", lang);
const SCREENS = { stock: StockScreen, ai: AIScreen, finance: FinanceScreen, operation: OperationScreen, equipment: EquipmentScreen, suppliers: SuppliersScreen };
const Tela = SCREENS[params.get("screen")] ?? FinanceScreen;

// ?click=N abre sozinho o N-esimo "?" da tela, para fotografar a caixinha
// do tutorial sem um dedo humano.
const click = Number(params.get("click") ?? -1);
if (click >= 0) setTimeout(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "?")[click]?.click(), 800);


// ?count=N&val=X abre a contagem do N-esimo item e digita X, para fotografar
// a linha da diferenca sem um dedo humano.
const count = Number(params.get("count") ?? -1);
if (count >= 0) setTimeout(() => {
  const bs = [...document.querySelectorAll("button")].filter((b) => /Contei|Gez/.test(b.innerText));
  bs[count]?.click();
  setTimeout(() => {
    const inp = document.querySelector("input[type=number]");
    if (!inp) return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(inp, params.get("val") ?? "0");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, 200);
}, 700);

// ?tap=texto clica o primeiro botao cujo rotulo casa, para fotografar uma aba.
const tap = params.get("tap");
if (tap) setTimeout(() => {
  [...document.querySelectorAll("button")].find((b) => b.innerText.includes(tap))?.click();
}, 700);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LangProvider>
      <Tela onClose={() => {}} />
    </LangProvider>
  </StrictMode>,
);
`;

const root = path.resolve(import.meta.dirname, "..");
const norm = (id: string) => id.replace(/\\/g, "/");

export default defineConfig({
  root,
  configFile: false,
  plugins: [
    {
      name: "sunbite-preview-mocks",
      enforce: "pre",
      load(id) {
        const f = norm(id);
        if (f.endsWith("/src/auth.ts")) return MOCK_AUTH;
        if (f.endsWith("/src/supabase.ts")) return MOCK_SUPABASE;
        if (f.endsWith("/src/main.tsx")) return MOCK_MAIN;
        return null;
      },
    },
    react(),
    tailwindcss(),
  ],
  define: { __APP_VERSION__: JSON.stringify("preview") },
  server: { port: 5233 },
});
