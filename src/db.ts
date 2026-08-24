import { openDB, type IDBPDatabase } from "idb";
import type { Sale } from "./types";

const DB_NAME = "sunbite-pdv";
const STORE = "sales";

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        const s = d.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("by_synced", "synced");
        s.createIndex("by_local_date", "local_date");
      },
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
 * Apaga as vendas de hoje. Serve para limpar teste antes de abrir a temporada.
 * So mexe no dia corrente — historico de dias anteriores fica fora de alcance.
 */
export async function deleteToday(): Promise<number> {
  const d = await db();
  const rows: Sale[] = await d.getAll(STORE);
  const alvo = rows.filter((s) => s.local_date === today());
  const tx = d.transaction(STORE, "readwrite");
  for (const s of alvo) await tx.store.delete(s.id);
  await tx.done;
  return alvo.length;
}
