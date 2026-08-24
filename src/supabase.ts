import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./sync";

/**
 * Client do Supabase Auth, carregado sob demanda.
 *
 * A biblioteca so entra no bundle quando alguem chama getSupabase() de
 * verdade — login, refresh de sessao, ou um modulo administrativo futuro.
 * O caminho da venda (App.tsx, order.ts, db.ts, sync.ts) nunca importa este
 * arquivo, entao nunca paga o custo dela.
 *
 * Reaproveita loadConfig() de sync.ts: mesma URL/chave que a sincronizacao
 * ja usa (Ajustes, ou as env vars da Vercel), uma fonte so.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const cfg = loadConfig();
      if (!cfg) throw new Error("Supabase não configurado");
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    })().catch((err: unknown) => {
      // Falha (ex: ainda sem config) nao fica memoizada para sempre — a
      // proxima chamada, depois de configurar em Ajustes, tenta de novo.
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}
