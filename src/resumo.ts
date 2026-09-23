import type { CashExpectation } from "./cashbox";
import type { Sale } from "./types";

/*
 * Os dados do resumo do dia (ops 24), separados da folha que os desenha em
 * components/ResumoDoDia.tsx. Arquivo puro: nada de "./supabase" nem
 * "./auth", porque a tela Vendas, que esta no pacote da venda, le daqui.
 */

/**
 * O dia inteiro num objeto so, congelado no momento do encerramento (ops 24).
 *
 * ⚠️ Congelado e a palavra: assim que a operacao vira `closed`, o realtime
 * manda `load()` reler, e a tela deixa de ter os mesmos numeros na mao. Se o
 * resumo dependesse do estado vivo, ele piscaria e sumiria bem na hora em que
 * a Romana esta lendo. Por isso vai tudo para ca de uma vez.
 */
export interface ResumoDoDia {
  inicio: string | null;
  /** Quando `inicio` veio da primeira venda, e nao de uma abertura de verdade. */
  inicioEstimado: boolean;
  fim: string;
  /** Dia que nunca foi encerrado: o fim veio da ultima venda. */
  fimEstimado?: boolean;
  /** A data do dia, quando a folha abre de Vendas (dia passado). */
  data?: string;
  /** Nao ha operacao registrada neste dia — so vendas (ex.: 22/08). */
  semOperacao?: boolean;
  /** O servidor nao respondeu: os numeros sao so deste aparelho. */
  soLocal?: boolean;
  placeName: string | null;
  eventName: string | null;
  cups: number;
  vendas: number;
  revenue: number;
  cash: number;
  twint: number;
  tips: number;
  expected: CashExpectation | null;
  counted: number | null;
  diff: number | null;
  reason: string;
  semAbertura: boolean;
  orfas: number;
  /** Havia rede na hora de fechar. Sem ela, os numeros podem estar velhos. */
  online: boolean;
}

/** "2026-09-18T17:47:00Z" -> "17:47". */
export function hora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}


/**
 * O resumo de um dia so com o que ESTE aparelho sabe — o caminho sem
 * internet ou sem login. Sem operacao, sem local e sem caixa, e marcado
 * `soLocal` para a folha dizer isso em vez de mostrar numeros que parecem o
 * dia inteiro.
 */
export function resumoLocal(data: string, sales: Sale[]): ResumoDoDia {
  const doDia = sales.filter((s) => s.local_date === data);
  const ativas = doDia.filter((s) => !s.cancelled);
  const horarios = ativas.map((s) => s.created_at).sort();
  const soma = (p: string) =>
    ativas.filter((s) => s.payment === p).reduce((n, s) => n + s.total, 0);
  return {
    data,
    inicio: horarios[0] ?? null,
    inicioEstimado: horarios.length > 0,
    fim: horarios[horarios.length - 1] ?? `${data}T00:00:00`,
    fimEstimado: horarios.length > 0,
    soLocal: true,
    placeName: null,
    eventName: null,
    cups: ativas.reduce((n, s) => n + s.cup_count, 0),
    vendas: ativas.length,
    revenue: ativas.reduce((n, s) => n + s.total, 0),
    cash: soma("cash"),
    twint: soma("twint"),
    tips: ativas.reduce((n, s) => n + (s.tip ?? 0), 0),
    expected: null,
    counted: null,
    diff: null,
    reason: "",
    semAbertura: false,
    orfas: 0,
    online: true,
  };
}
