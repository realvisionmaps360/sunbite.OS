import { allOutbox, enqueueOutbox, removeOutbox, type OutboxRow } from "./db";
import { getSupabase } from "./supabase";
import { logEvent } from "./log";

export type OutboxTable =
  | "operations"
  | "checklist_state"
  | "pendencies"
  | "stock_movements";

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
/**
 * O que a fila conseguiu dizer sobre esta escrita.
 *
 * `erro` e a recusa do SERVIDOR, e so ela. Estar offline nao entra aqui: a
 * fila guardar para depois e o comportamento certo, nao uma falha, e pintar
 * a tela de vermelho no meio da feira sem rede seria alarme falso.
 */
export interface ResultadoEscrita {
  erro: string | null;
}

export async function queueWrite<T extends { id: string }>(
  table: OutboxTable,
  row: T,
  onConflict?: string,
): Promise<ResultadoEscrita> {
  const id = crypto.randomUUID();
  await enqueueOutbox({
    id,
    table,
    row: row as unknown as Record<string, unknown>,
    onConflict,
    createdAt: new Date().toISOString(),
  });
  // So a recusa DESTA escrita volta para quem chamou (ops 25). Antes voltava
  // a de qualquer entrada da fila: uma linha presa de outro dia aparecia na
  // tela a cada toque novo, culpando o toque errado.
  return flushOutbox(id);
}

let flushing = false;

/**
 * Envia a fila, uma entrada de cada vez. Uma falha isolada — por exemplo,
 * duas operacoes abertas offline ao mesmo tempo colidindo no indice unico
 * `one_open_operation` quando a segunda sincroniza — nao derruba as outras
 * entradas. Fica visivel na aba Erros (Etapa 5): gravar antes de comemorar
 * vale tambem aqui, nunca esconder a falha atras de uma tela de merge.
 *
 * ⚠️ Devolve a ultima recusa do servidor em vez de engolir tudo. Ate a ops 19
 * o unico destino de uma recusa era o log, e foi assim que o app passou uma
 * feira inteira dizendo "operacao aberta" com o banco recusando toda gravacao
 * (o 23502 do `local_date`). Quem chama tem que poder contar isso na tela.
 */
export async function flushOutbox(soDe?: string): Promise<ResultadoEscrita> {
  if (flushing || !navigator.onLine) return { erro: null };
  flushing = true;
  let erro: string | null = null;
  try {
    const entries: OutboxRow[] = await allOutbox();
    if (entries.length === 0) return { erro: null };
    const supabase = await getSupabase();
    for (const entry of entries) {
      try {
        const { error } = await supabase
          .from(entry.table)
          .upsert(entry.row, entry.onConflict ? { onConflict: entry.onConflict } : undefined);
        if (error?.code === "23502" && !entry.onConflict) {
          /**
           * Linha pela metade (ops 25). O upsert tenta o INSERT primeiro, e
           * o INSERT exige todas as colunas NOT NULL — mesmo quando a linha
           * ja existe e a intencao era so atualizar. Uma entrada assim nunca
           * passaria: ficava presa na fila para sempre, e a recusa dela
           * aparecia na tela a cada gravacao seguinte, como se fosse nova.
           *
           * Aqui ela tenta de novo como UPDATE da linha pelo `id`, que nao
           * precisa das colunas ausentes. E o que conserta sozinho, no
           * celular, os "Concluir" de ocorrencia que ja estao presos na fila.
           * Se a linha nao existir, a recusa continua valendo e aparece.
           */
          const { id, ...resto } = entry.row;
          const { data, error: e2 } = await supabase
            .from(entry.table)
            .update(resto)
            .eq("id", id as string)
            .select("id");
          if (e2) throw new Error(e2.message);
          if (!data || data.length === 0) throw new Error(error.message);
        } else if (error) {
          throw new Error(error.message);
        }
        await removeOutbox(entry.id);
      } catch (e) {
        if (!soDe || entry.id === soDe) erro = (e as Error).message;
        void logEvent("error", `Falha ao sincronizar ${entry.table}: ${(e as Error).message}`);
      }
    }
  } finally {
    flushing = false;
  }
  return { erro };
}
