import { markSynced, pendingSales } from "./db";
import type { Sale } from "./types";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const CFG_KEY = "sunbite.supabase";

/**
 * Conexao padrao, vinda das variaveis de ambiente da Vercel.
 * A chave anon e publica por design — quem protege os dados e o RLS, que so
 * permite gravar. Vir embutida evita digitar um JWT no teclado do celular.
 */
const DEFAULTS: SupabaseConfig | null = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
})();

export function loadConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULTS;
    const c = JSON.parse(raw) as SupabaseConfig;
    // O que foi digitado nos Ajustes manda; senao, cai no padrao.
    return c.url && c.anonKey ? c : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveConfig(c: SupabaseConfig | null) {
  if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
  else localStorage.removeItem(CFG_KEY);
}

function row(s: Sale) {
  return {
    id: s.id,
    created_at: s.created_at,
    local_date: s.local_date,
    local_time: s.local_time,
    cup_count: s.cup_count,
    cups: s.cups,
    total: s.total,
    // Coluna propria, nunca somada ao total (ops 17). O grant de INSERT em
    // `sales` e coluna a coluna: se `tip` perder o grant, este insert passa a
    // falhar e a sincronizacao inteira para — nao e so esta coluna que some.
    tip: s.tip ?? 0,
    payment: s.payment,
    device_id: s.device_id,
    operation_id: s.operation_id ?? null,
    cancelled: s.cancelled ?? false,
    cancelled_at: s.cancelled_at ?? null,
    original_total: s.original_total ?? null,
    correction_reason: s.correction_reason ?? null,
    corrected_at: s.corrected_at ?? null,
  };
}

export type SyncResult =
  | { ok: true; sent: number }
  | { ok: false; reason: "no-config" | "offline" | "error"; message?: string };

/** Codigo do Postgres para chave duplicada. Aqui, isso e sucesso. */
const DUPLICATE = "23505";

/**
 * Envia uma venda.
 *
 * Nao usa upsert de proposito. `INSERT ... ON CONFLICT` precisa ler a linha
 * conflitante, e a politica de leitura esta fechada — o Supabase responde 42501.
 * Manter a leitura fechada importa: a chave anon viaja dentro do app, e com
 * SELECT liberado qualquer um leria o faturamento inteiro.
 *
 * Entao: insere. Se o id ja existe, a venda ja chegou antes — isso e sucesso,
 * nao erro, e e o que garante que reenviar nunca duplica. Em seguida, um PATCH
 * acerta o que pode ter mudado depois (hoje: o cancelamento).
 */
async function sendOne(cfg: SupabaseConfig, sale: Sale): Promise<void> {
  const headers = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    "Content-Type": "application/json",
  };

  const insert = await fetch(`${cfg.url}/rest/v1/sales`, {
    method: "POST",
    headers,
    body: JSON.stringify([row(sale)]),
  });

  if (insert.ok) return;

  const erro = await insert.json().catch(() => null);
  if (erro?.code !== DUPLICATE) {
    throw new Error(erro?.message ?? `HTTP ${insert.status}`);
  }

  // Ja estava la. Atualiza o que mudou desde entao: o cancelamento e, desde
  // a Fatia 3, a correcao. O aparelho sempre manda o estado inteiro dessas
  // colunas, nunca so o que acabou de mudar — assim cancelar uma venda ja
  // corrigida reenvia a correcao junto, em vez de apaga-la no servidor.
  const patch = await fetch(
    `${cfg.url}/rest/v1/sales?id=eq.${encodeURIComponent(sale.id)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        cancelled: sale.cancelled ?? false,
        cancelled_at: sale.cancelled_at ?? null,
        total: sale.total,
        payment: sale.payment,
        original_total: sale.original_total ?? null,
        correction_reason: sale.correction_reason ?? null,
        corrected_at: sale.corrected_at ?? null,
      }),
    },
  );

  if (!patch.ok) {
    const e = await patch.json().catch(() => null);
    throw new Error(e?.message ?? `HTTP ${patch.status}`);
  }
}

/**
 * Envia as vendas pendentes, uma a uma.
 *
 * Uma falha no meio nao derruba as outras: o que passou fica marcado como
 * enviado, o que falhou continua pendente e tenta de novo no proximo ciclo.
 */
export async function syncNow(): Promise<SyncResult> {
  const cfg = loadConfig();
  if (!cfg) return { ok: false, reason: "no-config" };
  if (!navigator.onLine) return { ok: false, reason: "offline" };

  const pending = await pendingSales();
  if (pending.length === 0) return { ok: true, sent: 0 };

  const enviados: string[] = [];
  let falha: string | null = null;

  for (const sale of pending) {
    try {
      await sendOne(cfg, sale);
      enviados.push(sale.id);
    } catch (e) {
      falha = (e as Error).message;
    }
  }

  if (enviados.length > 0) await markSynced(enviados);

  if (falha && enviados.length === 0) {
    return { ok: false, reason: "error", message: falha };
  }
  return { ok: true, sent: enviados.length };
}
