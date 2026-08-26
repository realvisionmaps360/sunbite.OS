import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { money } from "../config";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Expense, ExpenseType } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, SegmentedPicker, TileButton } from "./ui";

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
}

/**
 * Tela Financeiro (Etapa 7, Parte B) — exige sessao, so com internet, sem
 * fila. Receita de venda nao e redigitada aqui — vive em `sales`; esta tela
 * so grava despesa/entrada/movimento de caixa e le o resumo ja pronto em
 * `v_finance_daily` (Etapa 1), que junta as duas sem duplicar nada.
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
                    <p className="font-display text-lg">
                      {new Date(d.local_date).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR")}
                    </p>
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
                {expenses.map((e) => (
                  <Card key={e.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">
                        {CATEGORY_EMOJI[e.category ?? ""] ?? "🧾"} {t(`finance.type.${e.type}`)} ·{" "}
                        {new Date(e.occurred_at).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR")}
                      </span>
                      <span className="font-display text-lg text-brand">{money(e.value)}</span>
                    </div>
                    {e.description && <p className="text-sm text-ink-muted">{e.description}</p>}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
