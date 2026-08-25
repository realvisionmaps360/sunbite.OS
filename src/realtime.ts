import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export type RealtimeTable = "operations" | "checklist_state" | "pendencies";

/**
 * Assinatura de tempo real (Etapa 6) — as tres tabelas ja estao na
 * publicacao `supabase_realtime` desde a Etapa 1. So a tela de Operacao
 * chama isto, nunca App.tsx: e o que mantem o caminho da venda livre do
 * peso do client Supabase.
 *
 * Volume de um dia de mercado e baixo (dezenas de linhas): recarregar tudo a
 * cada evento e mais simples do que aplicar patch por patch no estado local,
 * e nao pesa.
 */
export async function subscribeRealtime(
  tables: RealtimeTable[],
  onChange: (table: RealtimeTable) => void,
): Promise<() => void> {
  const supabase = await getSupabase();
  let channel: RealtimeChannel = supabase.channel("operacao");
  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => onChange(table),
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
