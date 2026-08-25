import { CUP_PRICE, TOPPING_PRICE } from "./config";
import { getCache, setCache } from "./db";
import { loadConfig } from "./sync";

/**
 * Preco de venda, migrado do codigo para o banco (DEC-2026-005, Etapa 7).
 *
 * Este arquivo NAO importa "./auth" nem "./supabase", no mesmo espirito de
 * operations.ts — so `fetch` puro com a chave anon. E o que permite App.tsx/
 * order.ts chamarem getCupPrice()/getToppingPrice() no caminho da venda sem
 * quebrar a garantia "vender nunca depende de login". Escrever um preco novo
 * (setPrice) exige sessao e mora em PricesScreen.tsx, que ja e lazy.
 *
 * getCupPrice()/getToppingPrice() sao sincronas de proposito: o reducer do
 * pedido (order.ts) precisa de um numero na hora, nao uma Promise. Os
 * modulos comecam com o valor de config.ts (partida) e sao atualizados em
 * segundo plano — pelo cache do IndexedDB ao abrir, e pela rede quando
 * disponivel. O app nunca fica sem saber quanto custa um copo.
 */

let cupPrice = CUP_PRICE;
let toppingPrice = TOPPING_PRICE;

export function getCupPrice(): number {
  return cupPrice;
}

export function getToppingPrice(): number {
  return toppingPrice;
}

const CUP_CACHE_KEY = "sunbite.price.cup";
const TOPPING_CACHE_KEY = "sunbite.price.topping";

/**
 * Atualiza a memoria + o cache local para um item de preco. Usada pelo
 * fetch de refreshPrices() abaixo e por PricesScreen.tsx depois de gravar
 * um preco novo no Supabase — um so lugar decide o que "item_key" quer dizer.
 */
export function applyPriceUpdate(itemKey: string, value: number): void {
  if (itemKey === "cup") {
    cupPrice = value;
    void setCache(CUP_CACHE_KEY, value);
  } else if (itemKey === "topping") {
    toppingPrice = value;
    void setCache(TOPPING_CACHE_KEY, value);
  }
}

// Le o cache local assim que o modulo carrega — antes de qualquer rede,
// ainda mais cedo que o primeiro ciclo de sincronizacao de App.tsx.
void (async () => {
  const c = await getCache<number>(CUP_CACHE_KEY);
  const t = await getCache<number>(TOPPING_CACHE_KEY);
  if (typeof c === "number") cupPrice = c;
  if (typeof t === "number") toppingPrice = t;
})();

/**
 * Busca o preco atual no Supabase e atualiza a memoria + o cache. Chamada
 * pelo mesmo efeito de sincronizacao de App.tsx (abrir, voltar rede, 2 em 2
 * min) — nunca bloqueia, nunca lanca.
 */
export async function refreshPrices(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg || !navigator.onLine) return;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/prices?select=item_key,value`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
    if (!res.ok) return;
    const rows = (await res.json()) as { item_key: string; value: number }[];
    for (const r of rows) applyPriceUpdate(r.item_key, r.value);
  } catch {
    // Sem rede ou erro de fetch: mantem o valor atual, tenta de novo depois.
  }
}
