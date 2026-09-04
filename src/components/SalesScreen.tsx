import { motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TOPPINGS, money, toppingEmoji } from "../config";
import { allSales, cancelSale, correctSale, today } from "../db";
import { LangToggle, useLang } from "../i18n";
import { byDay, shortDate, summarize, toppingRanking } from "../sales";
import { syncNow } from "../sync";
import { Valor } from "./Valor";
import { isActive, isCorrected, tipOf, type Payment, type Sale } from "../types";

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
  const [correcting, setCorrecting] = useState<string | null>(null);

  const load = useCallback(async () => setSales(await allSales()), []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Leva a mudança ao Supabase agora, sem esperar o ciclo de 2 minutos:
   * correção que fica dois minutos só no celular é correção que pode se
   * perder junto com o aparelho.
   */
  const empurrar = useCallback(async () => {
    await load(); // números se refazem na hora
    void syncNow().then(async (r) => {
      if (r.ok && r.sent > 0) {
        await load();
        onDataChanged();
      }
    });
  }, [load, onDataChanged]);

  async function handleCancel(id: string) {
    await cancelSale(id);
    setAsking(null);
    await empurrar();
  }

  async function handleCorrect(
    id: string,
    patch: { total: number; payment: Payment; reason: string },
  ) {
    await correctSale(id, patch);
    setCorrecting(null);
    await empurrar();
  }

  // Veio da esquerda: para dispensar, empurra de volta para a esquerda.

  const todayRows = sales.filter((s) => s.local_date === today());

  return (
    <motion.div
      className="tela-sobreposta z-20 flex flex-col bg-cream-soft"
      /* Entra pela esquerda: a animação dá direção à abertura e o × devolve
         para o mesmo lado. */
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
          correcting={correcting}
          onCorrectStart={setCorrecting}
          onCorrect={handleCorrect}
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
  correcting,
  onCorrectStart,
  onCorrect,
}: {
  rows: Sale[];
  asking: string | null;
  onAsk: (id: string | null) => void;
  onCancel: (id: string) => void;
  correcting: string | null;
  onCorrectStart: (id: string | null) => void;
  onCorrect: (
    id: string,
    patch: { total: number; payment: Payment; reason: string },
  ) => void;
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
          <Stat label={t("stat.total")} value={<Valor chf={total} tamanho="cartao" />} />
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${cancelada ? "line-through" : ""}`}>
                    {s.local_time.slice(0, 5)} · {s.cup_count}{" "}
                    {t(s.cup_count === 1 ? "order.cup" : "order.cups")}
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {t(s.payment === "cash" ? "pay.cash" : "pay.twint")}
                    </span>
                  </p>
                </div>
                {/* Largura propria (w-28 = 112px), nao `shrink-0` cego: a coluna
                    precisa caber "CHF 1234.50" (~88px em text-base) e
                    "synchronisiert" (~78px em text-xs) sem roubar o resto da
                    linha nem esmagar o cabecalho da venda. */}
                <div className="w-28 shrink-0 text-right">
                  <p
                    className={`whitespace-nowrap tabular-nums font-semibold ${
                      cancelada ? "line-through" : ""
                    }`}
                  >
                    {money(s.total)}
                  </p>
                  {/* O valor de antes fica legível ao lado: é o que separa
                      "corrigir" de "sumir com dinheiro". */}
                  {isCorrected(s) && s.original_total !== undefined && (
                    <p className="text-xs tabular-nums text-ink-muted line-through">
                      {t("sale.correctedFrom", { value: money(s.original_total) })}
                    </p>
                  )}
                  {/* Gorjeta ao lado do valor, nunca somada nele — o numero
                      de cima continua sendo o que a Sunbite vendeu (ops 17). */}
                  {tipOf(s) > 0 && (
                    <p className="text-xs tabular-nums font-semibold text-brand">
                      + {money(tipOf(s))} {t("review.tip").toLowerCase()}
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">
                    {cancelada
                      ? t("sale.cancelled")
                      : t(s.synced ? "sale.synced" : "sale.pending")}
                  </p>
                </div>
              </div>

              {/* Os copos como fichas, na largura toda da linha — no espirito
                  do que o iPad do cliente ja faz (`Display.tsx`). Era uma
                  linha `truncate`, e com 3 copos em alemao ela mostrava so o
                  primeiro ("1: Mandeln+Kokos | 2:…"): conferir uma venda
                  olhando a lista era impossivel. Uma ficha por copo, com o
                  numero no circulo, quebrando em quantas linhas precisar.
                  `break-words` porque topping em alemao pode estourar a ficha
                  sozinho. */}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.cups.map((c, i) => (
                  <li
                    key={i}
                    className="flex max-w-full items-center gap-1.5 rounded-full bg-black/5 py-1 pl-1 pr-2.5"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                      {i + 1}
                    </span>
                    <span className="min-w-0 break-words text-sm leading-tight text-ink-muted">
                      {c.toppings.length
                        ? c.toppings
                            .map((x) => `${toppingEmoji(x)} ${t(`topping.${x}`)}`)
                            .join(" + ")
                        : t("sales.pure")}
                    </span>
                  </li>
                ))}
              </ul>

              {isCorrected(s) && !cancelada && (
                <p className="mt-1 text-sm text-brand">
                  ✎ {t("sale.corrected")} · {s.correction_reason}
                </p>
              )}

              {!cancelada && correcting === s.id && (
                <CorrectForm
                  sale={s}
                  onCancel={() => onCorrectStart(null)}
                  onSave={(patch) => onCorrect(s.id, patch)}
                />
              )}

              {!cancelada &&
                correcting !== s.id &&
                !isCorrected(s) &&
                asking !== s.id && (
                  <button
                    onClick={() => onCorrectStart(s.id)}
                    className="mt-2 mr-4 text-sm text-ink-muted underline underline-offset-4"
                  >
                    {t("sale.correct")}
                  </button>
                )}

              {!cancelada &&
                correcting !== s.id &&
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

/**
 * Corrigir venda (Fatia 3 da V2, decisao 8 / PRD 6.3).
 *
 * Muda so o valor e a forma de pagamento — os copos ficam como foram
 * registrados. O que a Romana erra no balcao e o numero e o botao de
 * pagamento; refazer o pedido inteiro custaria mais toques e mexeria no
 * ranking de toppings retroativamente.
 *
 * Motivo obrigatorio: sem ele, "corrigir" seria so uma forma educada de
 * reescrever o faturamento.
 */
function CorrectForm({
  sale,
  onCancel,
  onSave,
}: {
  sale: Sale;
  onCancel: () => void;
  onSave: (patch: { total: number; payment: Payment; reason: string }) => void;
}) {
  const { t } = useLang();
  const [total, setTotal] = useState(sale.total.toFixed(2));
  const [payment, setPayment] = useState<Payment>(sale.payment);
  const [reason, setReason] = useState("");

  const valor = Number(total);
  const podeSalvar = Number.isFinite(valor) && valor >= 0 && reason.trim().length > 0;

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-cream p-3">
      <p className="font-display text-lg">{t("sale.correctTitle")}</p>

      <label className="block text-sm font-semibold">{t("sale.correctValue")}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
        className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-3 text-xl tabular-nums"
      />

      <label className="block text-sm font-semibold">{t("sale.correctPayment")}</label>
      <div className="flex gap-2">
        {(["cash", "twint"] as Payment[]).map((p) => (
          <button
            key={p}
            onClick={() => setPayment(p)}
            className={`flex-1 rounded-2xl border-2 py-3 font-semibold transition ${
              payment === p
                ? "border-brand bg-brand text-cream"
                : "border-black/15 text-ink-muted"
            }`}
          >
            {p === "cash" ? "💵" : "📱"} {t(p === "cash" ? "pay.cash" : "pay.twint")}
          </button>
        ))}
      </div>

      <label className="block text-sm font-semibold">{t("sale.correctReason")}</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("sale.correctReasonPlaceholder")}
        className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
      />

      <div className="flex gap-2">
        <button
          onClick={() => onSave({ total: valor, payment, reason: reason.trim() })}
          disabled={!podeSalvar}
          className="flex-1 rounded-2xl bg-brand py-3 font-semibold text-cream disabled:opacity-40"
        >
          {t("sale.correctSave")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-2xl border border-black/20 px-4 text-lg"
        >
          ×
        </button>
      </div>

      <p className="text-xs text-ink-muted">{t("sale.correctOnce")}</p>
    </div>
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

/**
 * Um dos tres numeros do topo. Em 360px cada um tem ~104px, ~96px uteis
 * depois do `px-1` — e o rotulo alemao ("Verkäufe") nao tinha protecao de
 * largura nenhuma. Hoje o rotulo quebra em vez de vazar (`break-words`,
 * `leading-tight`, `tracking-wide` em vez de `tracking-wider`) e o valor em
 * CHF vem por `<Valor>`, que escolhe o tamanho da fonte pelo comprimento do
 * texto — "CHF 1234.50" cai sozinho para `text-base`.
 */
function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    // px-1: sem respiro lateral o numero encosta na borda e parece quebrado
    <div className="min-w-0 rounded-xl bg-black/20 px-1 py-2">
      <p className="break-words text-xs uppercase leading-tight tracking-wide opacity-70">
        {label}
      </p>
      <div className="min-w-0 font-display text-xl tabular-nums">{value}</div>
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
