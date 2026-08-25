import { allOutbox, enqueueOutbox, removeOutbox, type OutboxRow } from "./db";
import { getSupabase } from "./supabase";
import { logEvent } from "./log";

export type OutboxTable = "operations" | "checklist_state" | "pendencies";

/**
 * Fila offline para as tabelas administrativas (Etapa 6). Diferente de
 * sync.ts — que e fetch puro, sem sessao, so para `sales` — esta fila grava
 * com o cliente Supabase autenticado, porque quem mexe em operacao/checklist/
 * pendencia ja esta logado (login permanente desde a Etapa 4).
 *
 * `row` carrega so as colunas que mudaram, sempre com `id`: nunca a linha
 * inteira. E isso que garante "ultima escrita vence por campo" por
 * construcao, sem relogio vetorial nem tela de resolver conflito.
 */
export async function queueWrite<T extends { id: string }>(
  table: OutboxTable,
  row: T,
  onConflict?: string,
): Promise<void> {
  await enqueueOutbox({
    id: crypto.randomUUID(),
    table,
    row: row as unknown as Record<string, unknown>,
    onConflict,
    createdAt: new Date().toISOString(),
  });
  void flushOutbox();
}

let flushing = false;

/**
 * Envia a fila, uma entrada de cada vez. Uma falha isolada — por exemplo,
 * duas operacoes abertas offline ao mesmo tempo colidindo no indice unico
 * `one_open_operation` quando a segunda sincroniza — nao derruba as outras
 * entradas. Fica visivel na aba Erros (Etapa 5): gravar antes de comemorar
 * vale tambem aqui, nunca esconder a falha atras de uma tela de merge.
 */
export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const entries: OutboxRow[] = await allOutbox();
    if (entries.length === 0) return;
    const supabase = await getSupabase();
    for (const entry of entries) {
      try {
        const { error } = await supabase
          .from(entry.table)
          .upsert(entry.row, entry.onConflict ? { onConflict: entry.onConflict } : undefined);
        if (error) throw new Error(error.message);
        await removeOutbox(entry.id);
      } catch (e) {
        void logEvent("error", `Falha ao sincronizar ${entry.table}: ${(e as Error).message}`);
      }
    }
  } finally {
    flushing = false;
  }
}
