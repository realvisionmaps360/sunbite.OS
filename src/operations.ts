import { getCache, setCache, deleteCache } from "./db";
import { loadConfig } from "./sync";

/**
 * Tipos e helpers do modulo de Operacao (Etapa 6). Este arquivo NAO importa
 * "./auth" nem "./supabase" — so `fetch` puro com a chave anon, no mesmo
 * espirito de sync.ts. E o que permite App.tsx chamar
 * refreshOpenOperationId() no efeito de sincronizacao existente sem quebrar
 * a garantia "vender nunca depende de login".
 */

export type OperationStatus = "planned" | "open" | "closed";
export type Phase = "preparacao" | "saida" | "operacao" | "encerramento";

export interface Operation {
  id: string;
  local_date: string;
  place_id: string | null;
  event_id: string | null;
  status: OperationStatus;
  cash_initial: number | null;
  cash_final: number | null;
  opened_by: string | null;
  opened_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  phase: Phase;
  label_pt: string;
  label_de: string;
  critical: boolean;
  sort_order: number;
  active: boolean;
}

export interface ChecklistStateRow {
  id: string;
  operation_id: string;
  template_id: string;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export interface Pendency {
  id: string;
  description: string;
  critical: boolean;
  status: "aberta" | "concluida";
  origin: string | null;
  operation_id: string | null;
  created_by: string | null;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

/**
 * Deriva a fase da UI a partir do status salvo — nao existe coluna propria
 * para isso. `operations.status` so tem planned/open/closed; Preparacao e
 * Saida sao as duas faces de "planned", distinguidas por quanto do
 * checklist da fase preparacao ja foi marcado.
 */
export function phaseFor(status: OperationStatus, prepDone: boolean): Phase {
  if (status === "open") return "operacao";
  if (status === "closed") return "encerramento";
  return prepDone ? "saida" : "preparacao";
}

const OPEN_OP_CACHE_KEY = "sunbite.operation.open_id";

/**
 * Busca a operacao aberta (se houver) e guarda o id em cache local. Chamada
 * pelo mesmo efeito de sincronizacao de App.tsx (abrir, voltar rede, 2 em 2
 * min) — nunca bloqueia, nunca lanca: offline e config ausente sao estados
 * normais, o cache so fica desatualizado ate o proximo ciclo.
 */
export async function refreshOpenOperationId(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || !navigator.onLine) return;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/operations?select=id,status&status=eq.open&limit=1`,
      { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } },
    );
    if (!res.ok) return;
    const rows = (await res.json()) as { id: string }[];
    if (rows.length > 0) await setCache(OPEN_OP_CACHE_KEY, rows[0].id);
    else await deleteCache(OPEN_OP_CACHE_KEY);
  } catch {
    // Sem rede ou erro de fetch: mantem o valor em cache, tenta de novo depois.
  }
}

/** Lido ao gravar uma venda — carimba operation_id mesmo offline. */
export async function getCachedOpenOperationId(): Promise<string | null> {
  return (await getCache<string>(OPEN_OP_CACHE_KEY)) ?? null;
}
