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
  entries: number;
  costs: number;
  movements: number;
  expected: number;
}

/** Arredonda para o rappen antes de comparar — 0.1 + 0.2 nao pode travar o fechamento. */
export const rappen = (n: number) => Math.round(n * 100) / 100;

export function expectedCash(
  operation: { cash_initial: number | null },
  sales: { total: number; payment: string; cancelled: boolean }[],
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
  const entries = soma(expenses.filter((e) => e.type === "entrada"));
  const costs = soma(expenses.filter((e) => e.type === "despesa"));
  const movements = soma(expenses.filter((e) => e.type === "movimento_caixa"));

  return {
    initial,
    cashSales,
    twintSales,
    entries,
    costs,
    movements,
    expected: initial + cashSales + entries - costs + movements,
  };
}
