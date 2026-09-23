import { expectedCash, rappen } from "./cashbox";
import type { ResumoDoDia } from "./resumo";
import { byDay, type DayRow } from "./sales";
import { getSupabase } from "./supabase";
import type { Sale, SunbiteEvent } from "./types";

/**
 * Os dias de operacao lidos do SERVIDOR, para a tela Vendas (ops 24).
 *
 * ⚠️ Este modulo importa "./supabase" e por isso so pode ser carregado por
 * `import()` dinamico. A tela Vendas esta no pacote da venda (App.tsx a
 * importa direto), e um import estatico daqui arrastaria o cliente do
 * Supabase para o caminho que tem que abrir sem internet e sem login —
 * quebrando a decisao 1. Conferir sempre: `phx_join` = 0 no `main-*.js`.
 *
 * Ler `sales` exige sessao: a policy de leitura esta fechada para a chave
 * anon de proposito. Sem login, as consultas voltam vazias ou com erro, e
 * quem chama cai de volta nos dias deste aparelho.
 */

type LinhaVenda = Pick<
  Sale,
  "id" | "local_date" | "cup_count" | "total" | "payment" | "cancelled" | "created_at"
> & { tip: number | null; operation_id: string | null };

const COLUNAS = "id,local_date,cup_count,total,payment,cancelled,created_at,tip,operation_id";

/**
 * Um resumo por dia, de todos os aparelhos. Nulo quando o servidor nao
 * respondeu — e diferente de lista vazia, que quer dizer "nenhuma venda".
 */
export async function carregarDias(): Promise<DayRow[] | null> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("sales")
      .select(COLUNAS)
      .order("local_date", { ascending: false });
    if (error || !data) return null;
    // byDay so le local_date, cup_count, total, payment e cancelled — as
    // mesmas colunas, com o mesmo nome. Uma conta so para os dois lados.
    // Number() porque coluna numeric pode chegar como texto, e byDay soma
    // com "+=": "7.50" + "8.00" viraria "7.508.00" sem erro nenhum.
    const linhas = (data as unknown as LinhaVenda[]).map((v) => ({
      ...v,
      total: Number(v.total),
      cup_count: Number(v.cup_count),
    }));
    return byDay(linhas as unknown as Sale[]);
  } catch {
    return null;
  }
}

/**
 * O resumo completo de um dia qualquer: a operacao daquele dia (se houver),
 * as vendas, os lancamentos do caixa, o local e o evento. Nulo quando o
 * servidor nao respondeu.
 */
export async function carregarResumoDoDia(
  data: string,
  nomeDoEvento: (ev: SunbiteEvent | undefined) => string | null,
): Promise<ResumoDoDia | null> {
  try {
    const supabase = await getSupabase();
    const [{ data: ops, error: e1 }, { data: sl, error: e2 }] = await Promise.all([
      supabase.from("operations").select("*").eq("local_date", data).limit(1),
      supabase.from("sales").select(COLUNAS).eq("local_date", data),
    ]);
    if (e1 || e2) return null;

    const op = (ops?.[0] ?? null) as {
      id: string;
      place_id: string | null;
      event_id: string | null;
      cash_initial: number | null;
      cash_final: number | null;
      opened_at: string | null;
      closed_at: string | null;
    } | null;
    const todas = (sl as LinhaVenda[] | null) ?? [];
    const ativas = todas.filter((v) => !v.cancelled);
    const horarios = ativas.map((v) => v.created_at).sort();

    let expected = null;
    let placeName: string | null = null;
    let eventName: string | null = null;
    if (op) {
      const [{ data: ex }, { data: pl }, { data: ev }] = await Promise.all([
        supabase.from("expenses").select("type,value").eq("operation_id", op.id),
        op.place_id
          ? supabase.from("places").select("id,name").eq("id", op.place_id).limit(1)
          : Promise.resolve({ data: [] }),
        op.event_id
          ? supabase.from("events").select("*").eq("id", op.event_id).limit(1)
          : Promise.resolve({ data: [] }),
      ]);
      // O caixa conta so as vendas DESTA operacao, como no fechamento: venda
      // orfa nao passou pelo caixa daquele dia aos olhos do sistema.
      expected = expectedCash(
        op,
        todas
          .filter((v) => v.operation_id === op.id)
          .map((v) => ({ ...v, cancelled: !!v.cancelled })),
        (ex as { type: string; value: number }[] | null) ?? [],
      );
      placeName = (pl as { name: string }[] | null)?.[0]?.name ?? null;
      eventName = nomeDoEvento((ev as SunbiteEvent[] | null)?.[0]);
    }

    const counted = op?.cash_final == null ? null : Number(op.cash_final);
    const soma = (p: string) =>
      ativas.filter((v) => v.payment === p).reduce((n, v) => n + Number(v.total), 0);

    return {
      data,
      inicio: op?.opened_at ?? horarios[0] ?? null,
      inicioEstimado: !op?.opened_at && horarios.length > 0,
      fim: op?.closed_at ?? horarios[horarios.length - 1] ?? `${data}T00:00:00`,
      fimEstimado: !op?.closed_at && horarios.length > 0,
      semOperacao: !op,
      placeName,
      eventName,
      cups: ativas.reduce((n, v) => n + (v.cup_count ?? 0), 0),
      vendas: ativas.length,
      revenue: ativas.reduce((n, v) => n + Number(v.total), 0),
      cash: soma("cash"),
      twint: soma("twint"),
      tips: ativas.reduce((n, v) => n + Number(v.tip ?? 0), 0),
      expected,
      counted,
      diff: expected && counted !== null ? rappen(counted - expected.expected) : null,
      reason: "",
      semAbertura: !!op && !op.opened_at,
      orfas: op ? todas.filter((v) => !v.operation_id).length : 0,
      online: true,
    };
  } catch {
    return null;
  }
}
