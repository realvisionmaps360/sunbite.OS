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
  operations: [{ id: "op1", cash_initial: 1234.5 }],
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
  suppliers: [
    { id: "f1", name: "A confirmar — morango" },
    { id: "f2", name: "Denner Aarau" },
  ],
  purchases: [
    { id: "p1", supplier_id: "f2", purchased_at: "2026-08-25", total: 1234.5, notes: null, created_by: null, created_at: "" },
    { id: "p2", supplier_id: "f1", purchased_at: "2026-08-20", total: 55, notes: null, created_by: null, created_at: "" },
  ],
};

const MOCK_SUPABASE = `
const ROWS = ${JSON.stringify(ROWS)};
const result = (table) => {
  const p = Promise.resolve({ data: ROWS[table] ?? [], error: null });
  const q = {
    select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => p,
    single: () => Promise.resolve({ data: (ROWS[table] ?? [])[0] ?? null, error: null }),
    insert: () => q,
    then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p),
  };
  return q;
};
export function getSupabase() {
  return Promise.resolve({ from: (table) => result(table) });
}
`;


const MOCK_MAIN = `
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import FinanceScreen from "./components/FinanceScreen.tsx";
import StockScreen from "./components/StockScreen.tsx";
import { LangProvider } from "./i18n.tsx";

// Abre direto na tela do ?screen=, no idioma do ?lang= — o unico jeito de
// fotografar sem sessao no Supabase. Nada disto existe no app real.
const params = new URLSearchParams(location.search);
const lang = params.get("lang");
if (lang === "de" || lang === "pt") localStorage.setItem("sunbite.lang", lang);
const Tela = params.get("screen") === "stock" ? StockScreen : FinanceScreen;

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
