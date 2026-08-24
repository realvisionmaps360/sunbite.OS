import type { Sale, ToppingId } from "./types";
import { isActive } from "./types";

export interface DayRow {
  date: string;
  sales: number;
  cups: number;
  total: number;
  cash: number;
  twint: number;
  /** canceladas nao entram em nenhum numero acima, mas aparecem para conferencia */
  cancelled: number;
}

/**
 * Um resumo por dia, do mais recente para o mais antigo.
 * Venda cancelada so alimenta o contador `cancelled` — nunca os totais.
 */
export function byDay(sales: Sale[]): DayRow[] {
  const mapa = new Map<string, DayRow>();

  for (const s of sales) {
    let d = mapa.get(s.local_date);
    if (!d) {
      d = {
        date: s.local_date,
        sales: 0,
        cups: 0,
        total: 0,
        cash: 0,
        twint: 0,
        cancelled: 0,
      };
      mapa.set(s.local_date, d);
    }

    if (!isActive(s)) {
      d.cancelled += 1;
      continue;
    }

    d.sales += 1;
    d.cups += s.cup_count;
    d.total += s.total;
    if (s.payment === "cash") d.cash += s.total;
    else d.twint += s.total;
  }

  return [...mapa.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export interface ToppingRow {
  id: ToppingId;
  count: number;
  pct: number;
}

/**
 * Quantas vezes cada topping foi pedido.
 * Alimenta o item em aberto do Master Context secao 9: decidir toppings novos
 * por demanda observada, e nao por palpite.
 */
export function toppingRanking(sales: Sale[]): ToppingRow[] {
  const conta = new Map<ToppingId, number>();

  for (const s of sales) {
    if (!isActive(s)) continue;
    for (const cup of s.cups) {
      for (const t of cup.toppings) {
        conta.set(t, (conta.get(t) ?? 0) + 1);
      }
    }
  }

  const total = [...conta.values()].reduce((a, b) => a + b, 0);

  return [...conta.entries()]
    .map(([id, count]) => ({
      id,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export interface Summary {
  sales: number;
  cups: number;
  total: number;
  cash: number;
  twint: number;
  cancelled: number;
  /** ticket medio: quanto cada cliente gasta */
  avgSale: number;
  cupsPerSale: number;
  bestDay: DayRow | null;
  days: number;
}

export function summarize(sales: Sale[]): Summary {
  const dias = byDay(sales);
  const ativas = sales.filter(isActive);

  const total = ativas.reduce((sum, s) => sum + s.total, 0);
  const cups = ativas.reduce((sum, s) => sum + s.cup_count, 0);
  const cash = ativas
    .filter((s) => s.payment === "cash")
    .reduce((sum, s) => sum + s.total, 0);

  return {
    sales: ativas.length,
    cups,
    total,
    cash,
    twint: total - cash,
    cancelled: sales.length - ativas.length,
    avgSale: ativas.length === 0 ? 0 : total / ativas.length,
    cupsPerSale: ativas.length === 0 ? 0 : cups / ativas.length,
    bestDay:
      dias.length === 0
        ? null
        : dias.reduce((melhor, d) => (d.total > melhor.total ? d : melhor)),
    days: dias.filter((d) => d.sales > 0).length,
  };
}

/** "2026-08-18" -> "18/08" · usado nas listas, onde o ano so atrapalha */
export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
