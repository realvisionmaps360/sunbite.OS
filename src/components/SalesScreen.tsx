import { motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TOPPINGS, money } from "../config";
import { allSales, cancelSale, today } from "../db";
import { LangToggle, useLang } from "../i18n";
import { byDay, shortDate, summarize, toppingRanking } from "../sales";
import { syncNow } from "../sync";
import { useSwipe } from "../useSwipe";
import { Valor } from "./Valor";
import { isActive, type Sale } from "../types";

type Tab = "today" | "days" | "summary";

export function SalesScreen({
  onClose,
  onDataChanged,
}: {
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const { t } = useLang();
  const [sales, setSales] = useState<Sale[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [asking, setAsking] = useState<string | null>(null);

  const load = useCallback(async () => setSales(await allSales()), []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCancel(id: string) {
    await cancelSale(id);
    setAsking(null);
    await load(); // números se refazem na hora

    // Leva o cancelamento ao Supabase agora, sem esperar o ciclo de 2 minutos:
    // correção que fica dois minutos só no celular é correção que pode se perder
    // junto com o aparelho.
    void syncNow().then(async (r) => {
      if (r.ok && r.sent > 0) {
        await load();
        onDataChanged();
      }
    });
  }

  // Veio da esquerda: para dispensar, empurra de volta para a esquerda.
  useSwipe({ onEsquerda: onClose });

  const todayRows = sales.filter((s) => s.local_date === today());

  return (
    <motion.div
      className="fixed inset-0 z-20 flex flex-col bg-cream-soft"
      /* Entra pela esquerda acompanhando o dedo: o gesto que abre esta tela é
         arrastar da esquerda para a direita, então ela vem de lá. */
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
    >
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-cream">
        <h1 className="font-display text-2xl">{t("sales.title")}</h1>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button onClick={onClose} className="px-3 py-1 text-3xl leading-none">
            ×
          </button>
        </div>
      </header>

      <nav className="flex gap-1 bg-brand px-3 pb-3">
        {(["today", "days", "summary"] as Tab[]).map((v) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              tab === v ? "bg-cream text-brand-dark" : "bg-black/20 text-cream"
            }`}
          >
            {t(`tab.${v === "today" ? "today" : v === "days" ? "days" : "summary"}`)}
          </button>
        ))}
      </nav>

      {tab === "today" && (
        <TodayTab
          rows={todayRows}
          asking={asking}
          onAsk={setAsking}
          onCancel={handleCancel}
        />
      )}
      {tab === "days" && <DaysTab sales={sales} />}
      {tab === "summary" && <SummaryTab sales={sales} />}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Hoje */

function TodayTab({
  rows,
  asking,
  onAsk,
  onCancel,
}: {
  rows: Sale[];
  asking: string | null;
  onAsk: (id: string | null) => void;
  onCancel: (id: string) => void;
}) {
  const { t } = useLang();
  const ativas = rows.filter(isActive);
  const total = ativas.reduce((s, v) => s + v.total, 0);
  const cups = ativas.reduce((s, v) => s + v.cup_count, 0);
  const cash = ativas
    .filter((s) => s.payment === "cash")
    .reduce((s, v) => s + v.total, 0);

  return (
    <>
      <div className="bg-brand-dark px-4 pb-4 text-cream">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t("stat.sales")} value={String(ativas.length)} />
          <Stat label={t("stat.cups")} value={String(cups)} />
          <Stat label={t("stat.total")} value={<Valor chf={total} />} />
        </div>
        <p className="mt-2 text-center text-sm opacity-70">
          {t("stat.cashbox", { cash: money(cash), twint: money(total - cash) })}
        </p>
      </div>

      <ul className="flex-1 divide-y divide-black/10 overflow-y-auto">
        {rows.length === 0 && (
          <li className="p-6 text-center text-ink-muted">{t("sales.empty")}</li>
        )}

        {rows.map((s) => {
          const cancelada = !isActive(s);
          return (
            <li key={s.id} className={`p-4 ${cancelada ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className={`font-semibold ${cancelada ? "line-through" : ""}`}>
                    {s.local_time.slice(0, 5)} · {s.cup_count}{" "}
                    {t(s.cup_count === 1 ? "order.cup" : "order.cups")}
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {t(s.payment === "cash" ? "pay.cash" : "pay.twint")}
                    </span>
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {s.cups
                      .map(
                        (c, i) =>
                          `${i + 1}: ${
                            c.toppings.length
                              ? c.toppings.map((x) => t(`topping.${x}`)).join("+")
                              : t("sales.pure")
                          }`,
                      )
                      .join(" | ")}
                  </p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <p
                    className={`tabular-nums font-semibold ${
                      cancelada ? "line-through" : ""
                    }`}
                  >
                    {money(s.total)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {cancelada
                      ? t("sale.cancelled")
                      : t(s.synced ? "sale.synced" : "sale.pending")}
                  </p>
                </div>
              </div>

              {!cancelada &&
                (asking === s.id ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-sm font-semibold text-brand">
                      {t("sale.cancelAsk")}
                    </span>
                    <button
                      onClick={() => onCancel(s.id)}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-cream"
                    >
                      {t("sale.cancelYes")}
                    </button>
                    <button
                      onClick={() => onAsk(null)}
                      className="rounded-lg border border-black/20 px-4 py-2 text-sm"
                    >
                      {t("sale.cancelNo")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onAsk(s.id)}
                    className="mt-2 text-sm text-ink-muted underline underline-offset-4"
                  >
                    {t("sale.cancel")}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------- Por dia */

function DaysTab({ sales }: { sales: Sale[] }) {
  const { t } = useLang();
  const dias = byDay(sales).filter((d) => d.sales > 0 || d.cancelled > 0);

  return (
    <ul className="flex-1 divide-y divide-black/10 overflow-y-auto bg-cream-soft">
      {dias.length === 0 && (
        <li className="p-6 text-center text-ink-muted">{t("sales.empty")}</li>
      )}

      {dias.map((d) => (
        <li key={d.date} className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl">{shortDate(d.date)}</span>
            <Valor chf={d.total} tamanho="grande" className="text-right" />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {d.sales} {t("day.sales")} · {d.cups} {t("day.cups")}
            {d.cancelled > 0 &&
              ` · ${t(d.cancelled === 1 ? "day.cancelled" : "day.cancelled_other", {
                n: d.cancelled,
              })}`}
          </p>
          <div className="mt-2 flex gap-2 text-sm">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-brand">
              💵 {money(d.cash)}
            </span>
            <span className="rounded-full bg-brand/10 px-3 py-1 text-brand">
              📱 {money(d.twint)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- Resumo */

function SummaryTab({ sales }: { sales: Sale[] }) {
  const { t } = useLang();
  const s = summarize(sales);
  const ranking = toppingRanking(sales);
  const maior = ranking[0]?.count ?? 0;

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      <section className="rounded-2xl bg-brand-dark p-4 text-cream">
        <p className="text-xs uppercase tracking-widest opacity-70">
          {t("sum.season")}
        </p>
        <Valor chf={s.total} tamanho="gigante" />
        <p className="mt-1 opacity-80">
          {s.sales} {t("day.sales")} · {s.cups} {t("day.cups")} · {s.days}{" "}
          {t("sum.days")}
        </p>
        <p className="mt-2 text-sm opacity-70">
          {t("stat.cashbox", { cash: money(s.cash), twint: money(s.twint) })}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Card label={t("sum.avgSale")} value={<Valor chf={s.avgSale} tamanho="grande" />} />
        <Card label={t("sum.cupsPerSale")} value={s.cupsPerSale.toFixed(1)} />
        <Card
          label={t("sum.bestDay")}
          value={s.bestDay ? shortDate(s.bestDay.date) : "—"}
          hint={s.bestDay ? money(s.bestDay.total) : undefined}
        />
        <Card label={t("sum.cancelled")} value={String(s.cancelled)} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">{t("sum.toppings")}</h2>
        {ranking.length === 0 ? (
          <p className="text-ink-muted">{t("sum.noToppings")}</p>
        ) : (
          <ul className="space-y-3">
            {ranking.map((r) => {
              const def = TOPPINGS.find((x) => x.id === r.id);
              return (
                <li key={r.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">
                      {def?.emoji} {t(`topping.${r.id}`)}
                    </span>
                    <span className="tabular-nums text-ink-muted">
                      {r.count} · {r.pct}%
                    </span>
                  </div>
                  {/* barra proporcional ao mais pedido, não ao total */}
                  <div className="h-3 overflow-hidden rounded-full bg-brand/10">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{
                        width: `${maior === 0 ? 0 : (r.count / maior) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- peças */

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    // px-1: sem respiro lateral o numero encosta na borda e parece quebrado
    <div className="rounded-xl bg-black/20 px-1 py-2">
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <div className="font-display text-xl tabular-nums">{value}</div>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-cream p-4">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <div className="font-display text-3xl tabular-nums">{value}</div>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
