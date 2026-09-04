import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { expectedCash, type CashExpectation } from "../cashbox";
import { money } from "../config";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Expense, ExpenseType } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, Explain, Linha, SegmentedPicker, TileButton } from "./ui";

const TYPES: { value: ExpenseType; emoji: string }[] = [
  { value: "despesa", emoji: "🧾" },
  { value: "entrada", emoji: "💵" },
  { value: "movimento_caixa", emoji: "🔁" },
];

const CATEGORY_EMOJI: Record<string, string> = {
  ingredientes: "🍓",
  embalagem: "📦",
  operacional: "🎪",
  equipamentos: "🔧",
  marketing: "📣",
  administrativo: "🗂️",
};
const CATEGORIES = Object.keys(CATEGORY_EMOJI);

interface DailyRow {
  local_date: string;
  receita_dinheiro: number;
  receita_twint: number;
  receita_total: number;
  despesas: number;
  entradas: number;
  movimentos_caixa: number;
  /**
   * Gorjeta do dia (ops 17). Coluna propria na view, fora de
   * `receita_total`: gorjeta nao e faturamento da Sunbite, e o resultado
   * operacional aqui embaixo continua sendo faturamento menos despesa.
   */
  gorjetas_total: number;
}

/**
 * De onde veio o lancamento (PRD V2 7.5). A tabela guarda tres tipos, mas o
 * que a Romana precisa ler na lista e a **origem**: uma "retirada" e um
 * movimento de caixa negativo, e um "ajuste" e o movimento que o fechamento
 * cria sozinho quando o caixa nao bate (Fatia 3). Sem isto, as tres coisas
 * apareciam com o mesmo rotulo e a lista nao explicava nada.
 */
function origem(e: Pick<Expense, "type" | "value" | "category">): string {
  if (e.type === "despesa") return e.category === "ingredientes" ? "compra" : "despesa";
  if (e.type === "entrada") return "entrada";
  if (e.category === "ajuste") return "ajuste";
  return Number(e.value) < 0 ? "retirada" : "movimento_caixa";
}

const ORIGEM_EMOJI: Record<string, string> = {
  compra: "🛒",
  despesa: "🧾",
  entrada: "💵",
  retirada: "🏧",
  ajuste: "⚖️",
  movimento_caixa: "🔁",
};

/**
 * Tela Financeiro — exige sessao, so com internet, sem fila. Receita de
 * venda nao e redigitada aqui: vive em `sales`, e o resumo por dia vem
 * pronto de `v_finance_daily` (Etapa 1), que junta as duas sem duplicar.
 *
 * Fatia 4 (PRD V2 7.2-7.7) acrescentou tres coisas, e nenhuma delas grava
 * nada nova no banco — sao leitura e explicacao:
 *   1. **Resultado de hoje**, tirado da linha de hoje de `v_finance_daily`;
 *   2. **a conta do caixa aberta linha por linha**, a mesma do fechamento,
 *      agora vinda de `cashbox.ts` para nao existirem duas versoes dela;
 *   3. o **"?"** ao lado de cada numero (`Explain`), porque o PRD 7.1 exige
 *      que numero que precisa de raciocinio contabil venha com tutorial.
 *
 * "Lucro liquido" nao aparece em lugar nenhum de proposito (7.2): enquanto
 * custo de ingrediente e perda nao estiverem modelados, esse numero
 * mentiria. O que a tela mostra e **resultado operacional**.
 */
export default function FinanceScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <FinanceBody onClose={onClose} identity={auth.identity} />;
}

function FinanceBody({ onClose, identity }: { onClose: () => void; identity: Identity }) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  /** Caixa fisico da operacao aberta — nulo quando nao ha operacao aberta. */
  const [cash, setCash] = useState<CashExpectation | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<ExpenseType>("despesa");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const [{ data: exp }, { data: dai }] = await Promise.all([
        supabase.from("expenses").select("*").order("occurred_at", { ascending: false }).limit(30),
        supabase.from("v_finance_daily").select("*").limit(14),
      ]);
      if (exp) setExpenses(exp as Expense[]);
      if (dai) setDaily(dai as DailyRow[]);

      // Caixa fisico: so faz sentido enquanto ha operacao aberta, porque o
      // caixa inicial mora nela. Fechada a operacao, a conta ja foi feita no
      // fechamento e o cartao some em vez de mostrar numero sem dono.
      const { data: op } = await supabase
        .from("operations")
        .select("id,cash_initial")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);
      const aberta = op?.[0] as { id: string; cash_initial: number | null } | undefined;
      if (aberta) {
        const [{ data: sl }, { data: ex }] = await Promise.all([
          supabase.from("sales").select("total,payment,cancelled,tip").eq("operation_id", aberta.id),
          supabase.from("expenses").select("type,value").eq("operation_id", aberta.id),
        ]);
        setCash(
          expectedCash(
            aberta,
            (sl as { total: number; payment: string; cancelled: boolean; tip: number | null }[]) ?? [],
            (ex as { type: string; value: number }[]) ?? [],
          ),
        );
      } else {
        setCash(null);
      }
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addExpense() {
    const n = Number(value);
    if (!n) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("expenses")
        .insert({
          type,
          category,
          description: description.trim() || null,
          value: n,
          occurred_at: new Date().toISOString().slice(0, 10),
          created_by: identity.userId,
        })
        .select()
        .single();
      if (data) {
        setExpenses((prev) => [data as Expense, ...prev]);
        setDescription("");
        setValue("");
        setCreating(false);
        void load();
      }
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const dia = daily.find((d) => d.local_date === hoje) ?? null;
  /** Resultado operacional (7.2) — faturamento menos despesas. Nao e lucro. */
  const resultado = dia ? Number(dia.receita_total) - Number(dia.despesas) : 0;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR");

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("finance.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("finance.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {/* 1. Resultado de hoje (PRD 7.2) — o primeiro numero que a tela
              mostra, porque e a pergunta que se faz ao abrir o Financeiro. */}
          <Card>
            <h2 className="font-display text-xl">{t("finance.todayTitle")}</h2>
            {dia === null ? (
              <p className="text-sm text-ink-muted">{t("finance.todayEmpty")}</p>
            ) : (
              <div className="space-y-1">
                <Linha label={t("finance.revenue")} value={money(dia.receita_total)} />
                {/* So aparece quando houve gorjeta: linha zerada todo dia
                    vira ruido, e esta tela ja tem numero demais. */}
                {Number(dia.gorjetas_total) > 0 && (
                  <Linha label={t("finance.tips")} value={money(dia.gorjetas_total)} />
                )}
                <Linha
                  label={t("finance.cash")}
                  value={money(dia.receita_dinheiro)}
                  explain="cashVsTwint"
                />
                <Linha label={t("finance.twint")} value={money(dia.receita_twint)} />
                <Linha
                  label={t("finance.expenses")}
                  value={money(dia.despesas)}
                  explain="despesa"
                />
                <div className="mt-2 border-t border-black/10 pt-2">
                  <Linha
                    label={t("finance.operatingResult")}
                    value={money(resultado)}
                    explain="resultado"
                  />
                </div>
              </div>
            )}
          </Card>

          {/* 2. Caixa fisico (PRD 7.3), com a conta aberta linha por linha —
              a mesma formula do fechamento, vinda de cashbox.ts. */}
          {cash && (
            <Card>
              <h2 className="font-display text-xl">
                {t("finance.cashboxTitle")}
                <Explain topic="caixa" />
              </h2>
              <div className="space-y-1">
                <Linha label={t("finance.cashInitial")} value={money(cash.initial)} />
                <Linha label={t("finance.cashSales")} value={`+ ${money(cash.cashSales)}`} />
                <Linha label={t("finance.entries")} value={`+ ${money(cash.entries)}`} />
                <Linha label={t("finance.cashCosts")} value={`− ${money(cash.costs)}`} />
                {/* Sem prefixo "±": retirada ja e um valor negativo, e
                    "± CHF -312.50" mostrava dois sinais na mesma linha. */}
                <Linha
                  label={t("finance.movements")}
                  value={money(cash.movements)}
                  explain="retirada"
                />
                {/* Gorjeta em dinheiro: ja somada no esperado (cashbox.ts),
                    mostrada como linha propria para o numero nao aparecer do
                    nada. A de TWINT nao entra aqui — nao passa pela caixa. */}
                {cash.cashTips > 0 && (
                  <Linha label={t("close.tipsCash")} value={money(cash.cashTips)} />
                )}
                <div className="mt-2 border-t border-black/10 pt-2">
                  <Linha label={t("close.expected")} value={money(cash.expected)} />
                </div>
              </div>
              <p className="text-xs text-ink-muted">
                {t("close.twintNote", { value: money(cash.twintSales) })}
              </p>
              <p className="text-xs text-ink-muted">
                {t("finance.closingNote")}
                <Explain topic="fechamento" />
              </p>
            </Card>
          )}

          <p className="rounded-2xl bg-brand/10 p-3 text-center text-sm font-semibold text-brand-dark">
            {t("finance.rule")}
          </p>

          {creating ? (
            <Card>
              <p className="font-display text-lg">{t("finance.newExpense")}</p>
              <SegmentedPicker
                options={TYPES.map((ty) => ({ ...ty, label: t(`finance.type.${ty.value}`) }))}
                value={type}
                onChange={setType}
              />
              <SegmentedPicker
                options={CATEGORIES.map((c) => ({ value: c, emoji: CATEGORY_EMOJI[c], label: t(`finance.category.${c}`) }))}
                value={category}
                onChange={setCategory}
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("finance.descriptionPlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("finance.valuePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("finance.save")} onClick={() => void addExpense()} disabled={!value} />
                <button onClick={() => setCreating(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="🧾" label={t("finance.newExpense")} variant="dashed" onClick={() => setCreating(true)} disabled={!online} />
          )}

          <section>
            <h2 className="mb-2 mt-2 font-display text-xl">{t("finance.summary")}</h2>
            {daily.length === 0 ? (
              <EmptyState emoji="📊" text={t("finance.summaryEmpty")} />
            ) : (
              <div className="space-y-2">
                {daily.map((d) => (
                  <Card key={d.local_date}>
                    <p className="font-display text-lg">{fmtDate(d.local_date)}</p>
                    <p className="text-sm text-ink-muted">
                      {t("stat.cashbox", { cash: money(d.receita_dinheiro), twint: money(d.receita_twint) })}
                    </p>
                    {(d.despesas > 0 || d.entradas > 0 || d.movimentos_caixa > 0) && (
                      <p className="text-sm text-ink-muted">
                        {t("finance.dayExtra", {
                          despesas: money(d.despesas),
                          entradas: money(d.entradas),
                          caixa: money(d.movimentos_caixa),
                        })}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 mt-2 font-display text-xl">{t("finance.recent")}</h2>
            {expenses.length === 0 ? (
              <EmptyState emoji="🧾" text={t("finance.empty")} />
            ) : (
              <div className="space-y-2">
                {expenses.map((e) => {
                  const src = origem(e);
                  return (
                    <Card key={e.id}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 flex-1 text-sm">
                          {ORIGEM_EMOJI[src]} {t(`finance.origin.${src}`)} ·{" "}
                          {fmtDate(e.occurred_at)}
                        </span>
                        <span className="shrink-0 font-display text-lg tabular-nums text-brand">
                          {money(e.value)}
                        </span>
                      </div>
                      {e.description && <p className="text-sm text-ink-muted">{e.description}</p>}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
