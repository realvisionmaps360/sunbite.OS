/**
 * Config descartavel so para VER a tela de Financeiro (Fatia 4).
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
import { LangProvider } from "./i18n.tsx";

// Abre direto no Financeiro, no idioma do ?lang= — o unico jeito de fotografar
// a tela sem sessao no Supabase. Nada disto existe no app real.
const lang = new URLSearchParams(location.search).get("lang");
if (lang === "de" || lang === "pt") localStorage.setItem("sunbite.lang", lang);

// ?click=N abre sozinho o N-esimo "?" da tela, para fotografar a caixinha
// do tutorial sem um dedo humano.
const click = Number(new URLSearchParams(location.search).get("click") ?? -1);
if (click >= 0) setTimeout(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "?")[click]?.click(), 800);


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LangProvider>
      <FinanceScreen onClose={() => {}} />
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
