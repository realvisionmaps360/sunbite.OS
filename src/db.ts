import { openDB, type IDBPDatabase } from "idb";
import type { Sale } from "./types";

const DB_NAME = "sunbite-pdv";
const STORE = "sales";
const DB_VERSION = 2;

let dbp: Promise<IDBPDatabase> | null = null;

/**
 * true se a migracao para v2 falhou e o banco caiu de volta para v1.
 * Sales continua funcionando; os modulos novos (Etapa 6+) nao tem onde
 * gravar fila/cache/log ate o celular conseguir migrar de verdade.
 * A tela de Sistema (Etapa 5) le esta flag.
 */
export let dbDegraded = false;

function createSalesStore(d: IDBPDatabase) {
  const s = d.createObjectStore(STORE, { keyPath: "id" });
  s.createIndex("by_synced", "synced");
  s.createIndex("by_local_date", "local_date");
}

function warnDegraded() {
  if (typeof document === "undefined" || document.getElementById("db-degraded-warning")) return;
  const el = document.createElement("div");
  el.id = "db-degraded-warning";
  el.textContent =
    "Atualização com problema — vendas preservadas, módulos novos indisponíveis. / Aktualisierung fehlgeschlagen — Verkäufe bleiben erhalten, neue Module nicht verfügbar.";
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;" +
    "color:#fff;font-size:12px;line-height:1.4;padding:6px 10px;text-align:center;";
  document.body.appendChild(el);
}

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) createSalesStore(d);
        if (oldVersion < 2) {
          d.createObjectStore("outbox", { keyPath: "id" });
          d.createObjectStore("cache", { keyPath: "key" });
          d.createObjectStore("log", { keyPath: "id" });
        }
      },
    }).catch((err) => {
      // A transacao de upgrade do IndexedDB e atomica: se ela falhou, o
      // banco no navegador ainda esta na versao anterior (0 ou 1), intacta.
      // Cair para v1 aqui e seguro nos dois casos — celular novo (cria
      // sales pela primeira vez) ou celular antigo (sales ja existe e nao
      // e tocado).
      console.error("Falha na migracao do IndexedDB, caindo para v1:", err);
      dbDegraded = true;
      warnDegraded();
      return openDB(DB_NAME, 1, {
        upgrade(d, oldVersion) {
          if (oldVersion < 1) createSalesStore(d);
        },
      });
    });
  }
  return dbp;
}

/** Identificador do aparelho. V1 roda em um celular so, mas o campo ja viaja. */
export function deviceId(): string {
  const k = "sunbite.device_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}

/** Data de hoje no fuso do celular, no mesmo formato gravado nas vendas. */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function saveSale(sale: Sale) {
  await (await db()).put(STORE, sale);
}

export async function allSales(): Promise<Sale[]> {
  const rows: Sale[] = await (await db()).getAll(STORE);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function pendingSales(): Promise<Sale[]> {
  return (await allSales()).filter((s) => !s.synced);
}

export async function markSynced(ids: string[]) {
  const d = await db();
  const tx = d.transaction(STORE, "readwrite");
  for (const id of ids) {
    const s = (await tx.store.get(id)) as Sale | undefined;
    if (s) await tx.store.put({ ...s, synced: true });
  }
  await tx.done;
}

/**
 * Cancela uma venda. Nao apaga: marca.
 *
 * `synced` volta para false de proposito — o Supabase precisa saber que a venda
 * foi cancelada, e o upsert por id atualiza a linha que ja estava la.
 */
export async function cancelSale(id: string) {
  const d = await db();
  const s = (await d.get(STORE, id)) as Sale | undefined;
  if (!s || s.cancelled) return;
  await d.put(STORE, {
    ...s,
    cancelled: true,
    cancelled_at: new Date().toISOString(),
    synced: false,
  });
}

/**
 * Corrige o valor e/ou a forma de pagamento de uma venda (Fatia 3 da V2).
 *
 * Espelha `cancelSale` de proposito: grava e volta `synced` para false, para
 * que o PATCH de sync.ts leve a correcao ao servidor. A diferenca e que aqui
 * a venda continua contando — `total` passa a ser o valor certo, e o valor
 * de antes fica em `original_total`.
 *
 * Uma so vez por venda: com `corrected_at` ja gravado, a policy do banco
 * recusaria a segunda correcao, entao nem chega a tentar. Errou de novo,
 * cancela.
 */
export async function correctSale(
  id: string,
  patch: { total: number; payment: Sale["payment"]; reason: string },
) {
  const d = await db();
  const s = (await d.get(STORE, id)) as Sale | undefined;
  if (!s || s.cancelled || s.corrected_at) return;
  await d.put(STORE, {
    ...s,
    // Guarda o valor de antes, nunca o de duas correcoes atras: como so
    // existe uma correcao por venda, `s.total` aqui e sempre o original.
    original_total: s.total,
    total: patch.total,
    payment: patch.payment,
    correction_reason: patch.reason,
    corrected_at: new Date().toISOString(),
    synced: false,
  });
}

/*
 * `deleteToday()` morava aqui e foi removida em 28/08, junto com o bloco
 * "Limpeza" dos Ajustes, a pedido do Felipe. Era o unico apagar de verdade
 * do app inteiro — todo o resto e cancelamento, que nunca some dos totais.
 * Limpar teste antes da temporada continua possivel, mas pelo SQL Editor do
 * Supabase, que e onde essa decisao deve doer um pouco antes de acontecer.
 */

/**
 * Espelho local das tabelas que precisam funcionar sem internet — hoje, a
 * identidade da sessao (Etapa 4). O store `cache` ja existe desde a Etapa 3.
 * Se `dbDegraded` (migracao para v2 falhou), essas funcoes silenciosamente
 * nao fazem nada: o mirror e redundancia, nunca fonte obrigatoria.
 */
export async function getCache<T>(key: string): Promise<T | undefined> {
  if (dbDegraded) return undefined;
  const row = (await (await db()).get("cache", key)) as { key: string; value: T } | undefined;
  return row?.value;
}

export async function setCache(key: string, value: unknown): Promise<void> {
  if (dbDegraded) return;
  await (await db()).put("cache", { key, value });
}

export async function deleteCache(key: string): Promise<void> {
  if (dbDegraded) return;
  await (await db()).delete("cache", key);
}

export interface OutboxRow {
  id: string;
  table: string;
  row: Record<string, unknown>;
  onConflict?: string;
  /** ISO, hora do aparelho — ordena o envio. */
  createdAt: string;
}

/**
 * Fila offline generica (Etapa 6) — store `outbox`, ja criado na Etapa 3.
 * Mesma regra do cache: se `dbDegraded`, nao faz nada em silencio.
 */
export async function enqueueOutbox(row: OutboxRow): Promise<void> {
  if (dbDegraded) return;
  await (await db()).put("outbox", row);
}

export async function allOutbox(): Promise<OutboxRow[]> {
  if (dbDegraded) return [];
  const rows: OutboxRow[] = await (await db()).getAll("outbox");
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOutbox(id: string): Promise<void> {
  if (dbDegraded) return;
  await (await db()).delete("outbox", id);
}

export interface LogRow {
  id: string;
  /** ISO, relogio do aparelho — um evento offline guarda a hora real. */
  at: string;
  kind: "error" | "recovery" | "info";
  /** Frase ja pronta, PT fixo — a tela de Sistema nao faz nenhuma juncao. */
  message: string;
}

/**
 * Log local (Etapa 5) — store `log`, ja criado na Etapa 3. Nunca propaga
 * erro: gravar/ler/podar o log nao pode virar uma segunda falha visivel por
 * cima da falha original que estava sendo registrada.
 */
export async function appendLog(row: LogRow): Promise<void> {
  if (dbDegraded) return;
  try {
    await (await db()).add("log", row);
  } catch {
    // silencioso de proposito
  }
}

export async function allLog(): Promise<LogRow[]> {
  if (dbDegraded) return [];
  try {
    const rows: LogRow[] = await (await db()).getAll("log");
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}

export async function pruneLog(olderThanDays: number): Promise<void> {
  if (dbDegraded) return;
  try {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    const d = await db();
    const rows: LogRow[] = await d.getAll("log");
    const tx = d.transaction("log", "readwrite");
    for (const r of rows) {
      if (new Date(r.at).getTime() < cutoff) await tx.store.delete(r.id);
    }
    await tx.done;
  } catch {
    // silencioso de proposito
  }
}
