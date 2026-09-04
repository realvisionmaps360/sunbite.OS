/**
 * A conta do caixa fisico (PRD V2 7.3) — um lugar so.
 *
 *   inicial + vendas em dinheiro + entradas - despesas ± movimentos = esperado
 *
 * Nasceu dentro de OperationScreen.tsx, no fechamento. A Fatia 4 mostra a
 * mesma conta na tela de Financeiro, e duas copias da mesma formula e um
 * jeito garantido de um dia elas discordarem — entao a formula saiu das duas
 * telas e veio para ca.
 *
 * Este arquivo e **puro de proposito**: nao importa `./supabase` nem
 * `./auth`. Quem le do banco e a tela; aqui so entra numero. Isso o mantem
 * fora do pacote pesado e seguro de importar de qualquer lugar.
 *
 * TWINT fica fora da conta de proposito (7.4): nao passa pela caixa fisica,
 * entao some do calculo e volta so como informacao ao lado. "Retirada" nao
 * tem tipo proprio — e um `movimento_caixa` de valor negativo, por isso
 * entra somando.
 */

export interface CashExpectation {
  initial: number;
  cashSales: number;
  twintSales: number;
  /** Gorjeta recebida em dinheiro. Esta na caixa, entao conta (ops 17). */
  cashTips: number;
  /** Gorjeta recebida por TWINT. Nao passa pela caixa; so informa. */
  twintTips: number;
  entries: number;
  costs: number;
  movements: number;
  expected: number;
}

/** Arredonda para o rappen antes de comparar — 0.1 + 0.2 nao pode travar o fechamento. */
export const rappen = (n: number) => Math.round(n * 100) / 100;

export function expectedCash(
  operation: { cash_initial: number | null },
  sales: { total: number; payment: string; cancelled: boolean; tip?: number | null }[],
  expenses: { type: string; value: number }[],
): CashExpectation {
  const ativas = sales.filter((s) => !s.cancelled);
  const soma = (xs: { value: number }[]) => xs.reduce((a, x) => a + Number(x.value), 0);

  const initial = Number(operation.cash_initial ?? 0);
  const cashSales = ativas
    .filter((s) => s.payment === "cash")
    .reduce((a, s) => a + Number(s.total), 0);
  const twintSales = ativas
    .filter((s) => s.payment === "twint")
    .reduce((a, s) => a + Number(s.total), 0);

  // Gorjeta (ops 17). Segue a mesma regra da venda: a de dinheiro esta
  // fisicamente na caixa e por isso entra no esperado; a de TWINT nao passa
  // pela caixa e fica so como informacao ao lado. Gorjeta que a Romana
  // recebe e o app nao soma vira "sobra" no fechamento, e sobra sem
  // explicacao e exatamente o que este calculo existe para evitar.
  const gorjeta = (p: string) =>
    ativas.filter((s) => s.payment === p).reduce((a, s) => a + Number(s.tip ?? 0), 0);
  const cashTips = gorjeta("cash");
  const twintTips = gorjeta("twint");

  const entries = soma(expenses.filter((e) => e.type === "entrada"));
  const costs = soma(expenses.filter((e) => e.type === "despesa"));
  const movements = soma(expenses.filter((e) => e.type === "movimento_caixa"));

  return {
    initial,
    cashSales,
    twintSales,
    cashTips,
    twintTips,
    entries,
    costs,
    movements,
    expected: initial + cashSales + cashTips + entries - costs + movements,
  };
}
