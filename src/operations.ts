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
  /**
   * Apelido do desenho do item (`barra-ferro`, `luvas`, `gelo`), resolvido
   * por `src/components/ilustracoes.tsx`. Nunca uma URL: o app abre offline,
   * e desenho que depende de rede vira buraco branco na barraca. Apelido
   * desconhecido nao quebra nada — cai no emoji.
   */
  icon: string | null;
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
const OPEN_OP_VIEW_KEY = "sunbite.operation.open_view";

/**
 * O que a Home mostra sobre a operacao aberta, sem chamar o servidor (V2).
 *
 * Os dois primeiros campos vem da leitura anonima abaixo. `opened_at` e
 * `place_name` NAO cabem ali: a Etapa 6 fechou `operations` para o anon em
 * cinco colunas (id, status, local_date, place_id, event_id) e `places`
 * inteira exige sessao. Quem consegue le-los e a tela de Operacao, ja
 * logada — e ela deposita aqui pela `cacheOpenOperationView`. Por isso os
 * dois sao opcionais: a Home mostra a duracao e o local quando existem, e
 * segue funcionando sem eles.
 */
export interface OpenOperationView {
  id: string;
  local_date: string;
  opened_at?: string | null;
  place_name?: string | null;
}

/**
 * Busca a operacao aberta (se houver) e guarda o id em cache local. Chamada
 * pelo mesmo efeito de sincronizacao de App.tsx (abrir, voltar rede, 2 em 2
 * min) — nunca bloqueia, nunca lanca: offline e config ausente sao estados
 * normais, o cache so fica desatualizado ate o proximo ciclo.
 *
 * Escreve DUAS chaves: o id cru, que o caminho da venda le para carimbar
 * `operation_id`, e a vista da Home. O id continua sozinho na sua chave de
 * proposito — mudar o formato do que a venda le seria arriscar o unico
 * caminho que nao pode falhar.
 */
export async function refreshOpenOperationId(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || !navigator.onLine) return;
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/operations?select=id,status,local_date&status=eq.open&limit=1`,
      { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } },
    );
    if (!res.ok) return;
    const rows = (await res.json()) as { id: string; local_date: string }[];
    if (rows.length > 0) {
      const row = rows[0];
      await setCache(OPEN_OP_CACHE_KEY, row.id);
      // Operacao diferente da que estava em cache zera os detalhes: local e
      // hora de abertura da operacao passada nao valem para a nova.
      const anterior = await getCache<OpenOperationView>(OPEN_OP_VIEW_KEY);
      const detalhes = anterior?.id === row.id ? anterior : undefined;
      await setCache(OPEN_OP_VIEW_KEY, {
        id: row.id,
        local_date: row.local_date,
        opened_at: detalhes?.opened_at ?? null,
        place_name: detalhes?.place_name ?? null,
      } satisfies OpenOperationView);
    } else {
      await deleteCache(OPEN_OP_CACHE_KEY);
      await deleteCache(OPEN_OP_VIEW_KEY);
    }
  } catch {
    // Sem rede ou erro de fetch: mantem o valor em cache, tenta de novo depois.
  }
}

/**
 * Completa a vista da Home com o que so quem tem sessao consegue ler.
 * Chamada pela tela de Operacao ao carregar; nunca lanca, porque falhar aqui
 * so custa um detalhe na Home, nunca a operacao em si.
 */
export async function cacheOpenOperationView(
  view: Pick<OpenOperationView, "id"> & Partial<OpenOperationView>,
): Promise<void> {
  try {
    const anterior = await getCache<OpenOperationView>(OPEN_OP_VIEW_KEY);
    await setCache(OPEN_OP_VIEW_KEY, { ...anterior, ...view } as OpenOperationView);
  } catch {
    // Detalhe da Home nao vale derrubar a tela de Operacao.
  }
}

/** Lido pela Home. Devolve nulo quando nao ha operacao aberta. */
export async function getCachedOpenOperation(): Promise<OpenOperationView | null> {
  return (await getCache<OpenOperationView>(OPEN_OP_VIEW_KEY)) ?? null;
}

/** Lido ao gravar uma venda — carimba operation_id mesmo offline. */
export async function getCachedOpenOperationId(): Promise<string | null> {
  return (await getCache<string>(OPEN_OP_CACHE_KEY)) ?? null;
}
