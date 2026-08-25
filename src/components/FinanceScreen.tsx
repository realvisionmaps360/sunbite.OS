import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { LangToggle, useLang } from "../i18n";
import { getSupabase } from "../supabase";
import { money } from "../config";
import type { Expense, ExpenseType } from "../types";
import LoginScreen from "./LoginScreen";

const TYPES: ExpenseType[] = ["despesa", "entrada", "movimento_caixa"];
const CATEGORIES = ["ingredientes", "embalagem", "operacional", "equipamentos", "marketing", "administrativo"];

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
        void load();
      }
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold">
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("finance.title")}</h1>
        <LangToggle />
      </header>

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("finance.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-4 p-4">
          <p className="rounded-lg bg-brand/10 p-3 text-sm text-brand-dark">{t("finance.rule")}</p>

          <section className="space-y-2 rounded-2xl bg-white p-3">
            <p className="text-sm font-semibold">{t("finance.newExpense")}</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={type}
                disabled={!online}
                onChange={(e) => setType(e.target.value as ExpenseType)}
                className="rounded-lg border border-black/20 bg-white px-2 py-2 text-sm"
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`finance.type.${ty}`)}
                  </option>
                ))}
              </select>
              <select
                value={category}
                disabled={!online}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-black/20 bg-white px-2 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`finance.category.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={description}
              disabled={!online}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("finance.descriptionPlaceholder")}
              className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
            />
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={value}
                disabled={!online}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("finance.valuePlaceholder")}
                className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
              />
              <button
                onClick={() => void addExpense()}
                disabled={!online || !value}
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
              >
                {t("finance.save")}
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-display text-xl">{t("finance.summary")}</h2>
            <ul className="divide-y divide-black/10 rounded-2xl bg-white">
              {daily.length === 0 && (
                <li className="p-4 text-center text-ink-muted">{t("finance.summaryEmpty")}</li>
              )}
              {daily.map((d) => (
                <li key={d.local_date} className="space-y-1 p-3 text-sm">
                  <p className="font-semibold">
                    {new Date(d.local_date).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR")}
                  </p>
                  <p className="text-ink-muted">
                    {t("stat.cashbox", { cash: money(d.receita_dinheiro), twint: money(d.receita_twint) })}
                  </p>
                  {(d.despesas > 0 || d.entradas > 0 || d.movimentos_caixa > 0) && (
                    <p className="text-ink-muted">
                      {t("finance.dayExtra", {
                        despesas: money(d.despesas),
                        entradas: money(d.entradas),
                        caixa: money(d.movimentos_caixa),
                      })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-display text-xl">{t("finance.recent")}</h2>
            <ul className="divide-y divide-black/10 rounded-2xl bg-white">
              {expenses.length === 0 && (
                <li className="p-4 text-center text-ink-muted">{t("finance.empty")}</li>
              )}
              {expenses.map((e) => (
                <li key={e.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {t(`finance.type.${e.type}`)} · {new Date(e.occurred_at).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR")}
                    </span>
                    <span className="font-semibold">{money(e.value)}</span>
                  </div>
                  {e.description && <p className="text-ink-muted">{e.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
