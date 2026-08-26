import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { today } from "../db";
import { money } from "../config";
import { useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import { AdminHeader, TileButton } from "./ui";
import {
  cacheOpenOperationView,
  phaseFor,
  type ChecklistStateRow,
  type ChecklistTemplate,
  type Operation,
  type Pendency,
  type Phase,
} from "../operations";
import { subscribeRealtime } from "../realtime";
import { getSupabase } from "../supabase";
import type { Place, SunbiteEvent } from "../types";
import LoginScreen from "./LoginScreen";
import { OccurrenceSheet } from "./OccurrenceSheet";

/** yyyymmddThhmmssZ, como o Google Calendar exige na URL de "adicionar evento". */
function toGCalStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * URL padrao do Google Calendar (acao=TEMPLATE) — sem lib nova, sem OAuth,
 * sem servidor guardando acesso. Duracao fixa de 3h porque o schema nao
 * guarda hora de termino do evento.
 */
function googleCalendarUrl(ev: SunbiteEvent, lang: "pt" | "de", place: Place | null): string {
  const title = (lang === "de" ? ev.label_de : ev.label_en) || place?.name || "Sunbite";
  const start = new Date(ev.starts_at);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Sunbite — ${title}`,
    dates: `${toGCalStamp(start.toISOString())}/${toGCalStamp(end.toISOString())}`,
  });
  if (place?.name) params.set("location", place.city ? `${place.name}, ${place.city}` : place.name);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const PHASES: Phase[] = ["preparacao", "saida", "operacao", "encerramento"];

/**
 * Caixa esperado no fechamento (PRD 7.3):
 *
 *   inicial + vendas em dinheiro + entradas - despesas + movimentos de caixa
 *
 * TWINT fica fora de proposito (7.4): nao passa pela caixa fisica, entao
 * some do calculo e aparece so como informacao ao lado. "Retirada" nao tem
 * tipo proprio — e um `movimento_caixa` com valor negativo, por isso entra
 * somando.
 *
 * Este calculo vive aqui, e nao em operations.ts, porque precisa do cliente
 * autenticado: operations.ts e importado por App.tsx e nao pode arrastar
 * ./supabase para o pacote da venda.
 */
interface CashExpectation {
  initial: number;
  cashSales: number;
  twintSales: number;
  entries: number;
  costs: number;
  movements: number;
  expected: number;
}

function expectedCash(
  operation: Operation,
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

/** Arredonda para o rappen antes de comparar — 0.1 + 0.2 nao pode travar o fechamento. */
const rappen = (n: number) => Math.round(n * 100) / 100;

/**
 * Tela de Operacao (Etapa 6) — exige sessao, por isso entra no barril
 * adminScreens.ts como as outras telas administrativas. Diferente delas,
 * quando deslogada mostra a LoginScreen embutida em vez de so um aviso: sem
 * login nao ha "quem fez" para gravar em opened_by/checked_by/created_by.
 */
export default function OperationScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <OperationBody onClose={onClose} identity={auth.identity} />;
}

function prepDone(templates: ChecklistTemplate[], states: ChecklistStateRow[]): boolean {
  const prepIds = templates.filter((tp) => tp.phase === "preparacao").map((tp) => tp.id);
  if (prepIds.length === 0) return true;
  const byTemplate = new Map(states.map((s) => [s.template_id, s]));
  return prepIds.every((id) => byTemplate.get(id)?.checked);
}

function OperationBody({
  onClose,
  identity,
}: {
  onClose: () => void;
  identity: Identity;
}) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [states, setStates] = useState<ChecklistStateRow[]>([]);
  const [pendencies, setPendencies] = useState<Pendency[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<SunbiteEvent[]>([]);
  const [tab, setTab] = useState<Phase>("preparacao");
  const [cashInitial, setCashInitial] = useState("");
  const [cashFinal, setCashFinal] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [occurrence, setOccurrence] = useState(false);
  /** Caixa esperado (PRD 7.3) — nulo enquanto nao deu para calcular. */
  const [expected, setExpected] = useState<CashExpectation | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();

      const { data: tpl } = await supabase
        .from("checklist_templates")
        .select("*")
        .eq("active", true)
        .order("phase")
        .order("sort_order");
      if (tpl) setTemplates(tpl as ChecklistTemplate[]);

      const { data: op } = await supabase
        .from("operations")
        .select("*")
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1);
      const current = (op?.[0] as Operation | undefined) ?? null;
      setOperation(current);

      if (current) {
        const { data: st } = await supabase
          .from("checklist_state")
          .select("*")
          .eq("operation_id", current.id);
        if (st) setStates(st as ChecklistStateRow[]);

        // Caixa esperado: le o que ja existe nas duas tabelas, sem redigitar
        // nada. Venda cancelada nao entra — a mesma regra do resto do app.
        const [{ data: sl }, { data: ex }] = await Promise.all([
          supabase
            .from("sales")
            .select("total,payment,cancelled")
            .eq("operation_id", current.id),
          supabase.from("expenses").select("type,value").eq("operation_id", current.id),
        ]);
        setExpected(
          expectedCash(
            current,
            (sl as { total: number; payment: string; cancelled: boolean }[]) ?? [],
            (ex as { type: string; value: number }[]) ?? [],
          ),
        );
      } else {
        setStates([]);
        setExpected(null);
      }

      const { data: pend } = await supabase
        .from("pendencies")
        .select("*")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });
      if (pend) setPendencies(pend as Pendency[]);

      const { data: pl } = await supabase.from("places").select("*").order("name");
      if (pl) setPlaces(pl as Place[]);
      const { data: ev } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (ev) setEvents(ev as SunbiteEvent[]);

      // Deposita na vista da Home o que so daqui da para ler: `opened_at` e o
      // nome do local ficam fora do que o anon enxerga (ver operations.ts).
      // Sem isto a Home mostra "Operacao em andamento" sem local nem duracao.
      if (current?.status === "open") {
        const local = (pl as Place[] | null)?.find((p) => p.id === current.place_id);
        void cacheOpenOperationView({
          id: current.id,
          local_date: current.local_date,
          opened_at: current.opened_at,
          place_name: local?.name ?? null,
        });
      }
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem no estado local.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelado = false;
    void subscribeRealtime(["operations", "checklist_state", "pendencies"], () => {
      if (!cancelado) void load();
    }).then((fn) => {
      if (cancelado) fn();
      else unsub = fn;
    });
    return () => {
      cancelado = true;
      unsub?.();
    };
  }, [load]);

  useEffect(() => {
    const onOnline = () => void flushOutbox();
    window.addEventListener("online", onOnline);
    void flushOutbox();
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    if (operation) setTab(phaseFor(operation.status, prepDone(templates, states)));
  }, [operation, templates, states]);

  async function startOperation() {
    const row: Operation = {
      id: crypto.randomUUID(),
      local_date: today(),
      place_id: null,
      event_id: null,
      status: "planned",
      cash_initial: null,
      cash_final: null,
      opened_by: null,
      opened_at: null,
      closed_by: null,
      closed_at: null,
      created_at: new Date().toISOString(),
    };
    setOperation(row);
    await queueWrite("operations", row);
  }

  async function toggleItem(template: ChecklistTemplate) {
    if (!operation) return;
    const existing = states.find((s) => s.template_id === template.id);
    const next: ChecklistStateRow = {
      id: existing?.id ?? crypto.randomUUID(),
      operation_id: operation.id,
      template_id: template.id,
      checked: !(existing?.checked ?? false),
      checked_by: identity.userId,
      checked_at: new Date().toISOString(),
    };
    setStates((prev) => [...prev.filter((s) => s.template_id !== template.id), next]);
    await queueWrite("checklist_state", next, "operation_id,template_id");
  }

  async function linkPlaceEvent(patch: { place_id?: string | null; event_id?: string | null }) {
    if (!operation) return;
    const row = { id: operation.id, ...patch };
    setOperation({ ...operation, ...patch });
    await queueWrite("operations", row);
  }

  async function openOperation() {
    if (!operation) return;
    const patch = {
      id: operation.id,
      status: "open" as const,
      opened_by: identity.userId,
      opened_at: new Date().toISOString(),
      cash_initial: cashInitial ? Number(cashInitial) : null,
    };
    setOperation({ ...operation, ...patch });
    await queueWrite("operations", patch);
  }

  /**
   * Fecha a operacao (decisao 7). A diferenca entre o caixa esperado e o
   * contado nao pode morrer numa coluna: vira lancamento no Financeiro,
   * amarrado a esta operacao, com o motivo escrito pela Romana.
   *
   * O tipo e `movimento_caixa` com categoria `ajuste`, e nao um tipo
   * `ajuste` proprio: o check de `expenses` so aceita tres tipos, e criar um
   * quarto exigiria alterar uma restricao de tabela em producao. O efeito e
   * o mesmo, e `v_finance_daily` ja soma isso sem alteracao nenhuma.
   */
  async function closeOperation() {
    if (!operation) return;
    const contado = cashFinal ? Number(cashFinal) : null;
    const diff = diferenca;

    if (diff !== null && diff !== 0 && !closeReason.trim()) return;

    const patch = {
      id: operation.id,
      status: "closed" as const,
      closed_by: identity.userId,
      closed_at: new Date().toISOString(),
      cash_final: contado,
    };
    setOperation({ ...operation, ...patch });
    await queueWrite("operations", patch);

    if (diff !== null && diff !== 0) {
      try {
        const supabase = await getSupabase();
        await supabase.from("expenses").insert({
          type: "movimento_caixa",
          category: "ajuste",
          description: closeReason.trim(),
          value: diff,
          occurred_at: operation.local_date,
          operation_id: operation.id,
          created_by: identity.userId,
        });
      } catch {
        // Sem rede na hora do fechamento: a operacao ja fechou pela fila, e o
        // ajuste fica registrado no motivo. Nao vale travar o encerramento.
      }
      setCloseReason("");
    }
  }

  /** Chega pronta da folha de Ocorrencia — aqui so entra na lista da tela. */
  function onOccurrenceSaved(row: Pendency) {
    setPendencies((prev) => [row, ...prev]);
  }

  async function resolvePendency(p: Pendency) {
    const patch = {
      id: p.id,
      status: "concluida" as const,
      resolved_by: identity.userId,
      resolved_at: new Date().toISOString(),
    };
    setPendencies((prev) => prev.filter((x) => x.id !== p.id));
    await queueWrite("pendencies", patch);
  }

  const contado = cashFinal.trim() === "" ? null : Number(cashFinal);
  /** Nulo enquanto nao da para comparar — sem esperado ou sem contado. */
  const diferenca =
    expected && contado !== null && Number.isFinite(contado)
      ? rappen(contado - expected.expected)
      : null;
  const precisaMotivo = diferenca !== null && diferenca !== 0;

  const phaseTemplates = templates.filter((tp) => tp.phase === tab);
  const stateByTemplate = new Map(states.map((s) => [s.template_id, s]));

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("operation.title")} onClose={onClose} />

      {!navigator.onLine && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("operation.offlineNotice")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && !operation && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-ink-muted">{t("operation.none")}</p>
          <button
            onClick={() => void startOperation()}
            className="rounded-2xl bg-brand px-6 py-4 font-semibold text-cream"
          >
            {t("operation.start")}
          </button>
        </div>
      )}

      {!loading && operation && (
        <>
          <nav className="grid grid-cols-2 gap-2 bg-brand px-3 pb-3">
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => setTab(p)}
                className={`min-w-0 truncate rounded-full px-2 py-2 text-sm font-semibold transition ${
                  tab === p ? "bg-cream text-brand-dark" : "bg-black/20 text-cream"
                }`}
              >
                {t(`operation.phase.${p}`)}
              </button>
            ))}
          </nav>

          <div className="flex-1 space-y-4 p-4">
            {tab !== "operacao" && (
              <ul className="divide-y divide-black/10 rounded-2xl bg-cream">
                {phaseTemplates.length === 0 && (
                  <li className="p-4 text-center text-ink-muted">{t("checklist.empty")}</li>
                )}
                {phaseTemplates.map((tpl) => {
                  const st = stateByTemplate.get(tpl.id);
                  return (
                    <li key={tpl.id}>
                      <button
                        onClick={() => void toggleItem(tpl)}
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                            st?.checked ? "border-brand bg-brand text-cream" : "border-black/20"
                          }`}
                        >
                          {st?.checked ? "✓" : ""}
                        </span>
                        <span className={st?.checked ? "line-through opacity-50" : ""}>
                          {lang === "de" ? tpl.label_de : tpl.label_pt}
                        </span>
                        {tpl.critical && (
                          <span className="ml-auto shrink-0 rounded-full bg-red-700/10 px-2 py-0.5 text-xs font-semibold text-red-800">
                            {t("checklist.critical")}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {tab === "saida" && (
              <div className="space-y-2 rounded-2xl bg-cream p-4">
                <label className="block text-sm font-semibold">{t("operation.place")}</label>
                <select
                  value={operation.place_id ?? ""}
                  onChange={(e) => void linkPlaceEvent({ place_id: e.target.value || null })}
                  className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
                >
                  <option value="">{t("places.noPlace")}</option>
                  {places.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>

                <label className="block text-sm font-semibold">{t("operation.event")}</label>
                <select
                  value={operation.event_id ?? ""}
                  onChange={(e) => void linkPlaceEvent({ event_id: e.target.value || null })}
                  className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
                >
                  <option value="">{t("operation.noEvent")}</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {new Date(ev.starts_at).toLocaleDateString()} · {(lang === "de" ? ev.label_de : ev.label_en) || t("operation.event")}
                    </option>
                  ))}
                </select>

                {(() => {
                  const linkedEvent = events.find((ev) => ev.id === operation.event_id);
                  if (!linkedEvent) return null;
                  const linkedPlace = places.find((pl) => pl.id === operation.place_id) ?? null;
                  return (
                    <a
                      href={googleCalendarUrl(linkedEvent, lang, linkedPlace)}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full rounded-2xl border-2 border-brand py-3 text-center font-semibold text-brand"
                    >
                      {t("operation.addToCalendar")}
                    </a>
                  );
                })()}
              </div>
            )}

            {tab === "saida" && operation.status === "planned" && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold">
                  {t("operation.cashInitial")}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashInitial}
                  onChange={(e) => setCashInitial(e.target.value)}
                  className="w-full rounded-lg border border-black/20 bg-cream px-3 py-2"
                />
                <button
                  onClick={() => void openOperation()}
                  className="w-full rounded-2xl bg-brand py-4 font-semibold text-cream"
                >
                  {t("operation.open")}
                </button>
              </div>
            )}

            {tab === "operacao" && (
              <div className="space-y-3 rounded-2xl bg-cream p-4">
                <h2 className="font-display text-xl">{t("operation.summary")}</h2>
                {operation.opened_at && (
                  <p className="text-sm text-ink-muted">
                    {t("operation.openedInfo", {
                      time: new Date(operation.opened_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                      who: operation.opened_by === identity.userId ? identity.email : "—",
                    })}
                  </p>
                )}
                <button
                  onClick={() => setTab("encerramento")}
                  className="w-full rounded-2xl border-2 border-brand py-3 font-semibold text-brand"
                >
                  {t("operation.goToClose")}
                </button>
              </div>
            )}

            {tab === "encerramento" && operation.status === "open" && (
              <div className="space-y-3 rounded-2xl bg-cream p-4">
                <h2 className="font-display text-xl">{t("close.title")}</h2>

                <label className="block text-sm font-semibold">{t("operation.cashFinal")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashFinal}
                  onChange={(e) => setCashFinal(e.target.value)}
                  className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-3 text-xl tabular-nums"
                />

                {expected && (
                  <div className="space-y-1">
                    {/* Esperado × contado × diferenca (PRD 7.3). Cada linha e
                        uma grade de duas colunas: o valor nunca disputa
                        largura com o rotulo. */}
                    <Linha label={t("close.expected")} value={money(expected.expected)} />
                    <Linha
                      label={t("close.counted")}
                      value={contado === null ? "—" : money(contado)}
                    />
                    <Linha
                      label={t("close.difference")}
                      value={diferenca === null ? "—" : money(diferenca)}
                      destaque={precisaMotivo}
                    />
                    <p className="pt-1 text-xs text-ink-muted">
                      {t("close.breakdown", {
                        initial: money(expected.initial),
                        sales: money(expected.cashSales),
                      })}
                      {(expected.entries || expected.costs || expected.movements) !== 0 &&
                        ` · ${t("close.adjustments", {
                          value: money(
                            expected.entries - expected.costs + expected.movements,
                          ),
                        })}`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t("close.twintNote", { value: money(expected.twintSales) })}
                    </p>
                  </div>
                )}

                {precisaMotivo && (
                  <>
                    <label className="block text-sm font-semibold">{t("close.reason")}</label>
                    <input
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      placeholder={t("close.reasonPlaceholder")}
                      className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
                    />
                    {!closeReason.trim() && (
                      <p className="text-sm font-semibold text-red-800">
                        {t("close.reasonRequired")}
                      </p>
                    )}
                  </>
                )}

                <button
                  onClick={() => void closeOperation()}
                  disabled={precisaMotivo && !closeReason.trim()}
                  className="w-full rounded-2xl bg-brand py-4 font-semibold text-cream disabled:opacity-40"
                >
                  {t("close.confirm")}
                </button>
              </div>
            )}

            <section className="space-y-3">
              <h2 className="font-display text-xl">{t("pendency.title")}</h2>
              {/* Mesma folha que abre de dentro do PDV — um caminho so para
                  registrar ocorrencia, aqui e la. */}
              <TileButton
                emoji="⚠️"
                label={t("pendency.add")}
                variant="dashed"
                onClick={() => setOccurrence(true)}
              />

              <ul className="divide-y divide-black/10 rounded-2xl bg-cream">
                {pendencies.length === 0 && (
                  <li className="p-4 text-center text-ink-muted">{t("pendency.empty")}</li>
                )}
                {pendencies.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    <span className="flex-1">
                      {p.description}
                      {p.critical && (
                        <span className="ml-2 rounded-full bg-red-700/10 px-2 py-0.5 text-xs font-semibold text-red-800">
                          {t("pendency.critical")}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => void resolvePendency(p)}
                      className="shrink-0 rounded-lg border border-brand px-3 py-1 text-sm font-semibold text-brand"
                    >
                      {t("pendency.resolve")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {occurrence && (
        <OccurrenceSheet
          onClose={() => setOccurrence(false)}
          createdBy={identity.userId}
          onSaved={onOccurrenceSaved}
        />
      )}
    </div>
  );
}

/** Linha rotulo × valor do fechamento. Grade de duas colunas: o valor tem
 *  largura propria e nunca briga com o rotulo, mesmo em CHF 1234.50. */
function Linha({
  label,
  value,
  destaque,
}: {
  label: string;
  value: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${destaque ? "font-semibold text-red-800" : "text-ink-muted"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          destaque ? "font-semibold text-red-800" : "font-semibold"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
