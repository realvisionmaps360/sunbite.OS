import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { today } from "../db";
import { LangToggle, useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import {
  phaseFor,
  type ChecklistStateRow,
  type ChecklistTemplate,
  type Operation,
  type Pendency,
  type Phase,
} from "../operations";
import { subscribeRealtime } from "../realtime";
import { getSupabase } from "../supabase";
import LoginScreen from "./LoginScreen";

const PHASES: Phase[] = ["preparacao", "saida", "operacao", "encerramento"];

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
  const [tab, setTab] = useState<Phase>("preparacao");
  const [cashInitial, setCashInitial] = useState("");
  const [cashFinal, setCashFinal] = useState("");
  const [newPendency, setNewPendency] = useState("");
  const [newPendencyCritical, setNewPendencyCritical] = useState(false);

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
      } else {
        setStates([]);
      }

      const { data: pend } = await supabase
        .from("pendencies")
        .select("*")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });
      if (pend) setPendencies(pend as Pendency[]);
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

  async function closeOperation() {
    if (!operation) return;
    const patch = {
      id: operation.id,
      status: "closed" as const,
      closed_by: identity.userId,
      closed_at: new Date().toISOString(),
      cash_final: cashFinal ? Number(cashFinal) : null,
    };
    setOperation({ ...operation, ...patch });
    await queueWrite("operations", patch);
  }

  async function addPendency() {
    if (!newPendency.trim()) return;
    const row: Pendency = {
      id: crypto.randomUUID(),
      description: newPendency.trim(),
      critical: newPendencyCritical,
      status: "aberta",
      origin: operation ? `operacao:${operation.id}` : null,
      operation_id: operation?.id ?? null,
      created_by: identity.userId,
      created_at: new Date().toISOString(),
      resolved_by: null,
      resolved_at: null,
    };
    setPendencies((prev) => [row, ...prev]);
    setNewPendency("");
    setNewPendencyCritical(false);
    await queueWrite("pendencies", row);
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

  const phaseTemplates = templates.filter((tp) => tp.phase === tab);
  const stateByTemplate = new Map(states.map((s) => [s.template_id, s]));

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold"
        >
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("operation.title")}</h1>
        <LangToggle />
      </header>

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
              <ul className="divide-y divide-black/10 rounded-2xl bg-white">
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
                  className="w-full rounded-lg border border-black/20 bg-white px-3 py-2"
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
              <div className="space-y-3 rounded-2xl bg-white p-4">
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
              <div className="space-y-2">
                <label className="block text-sm font-semibold">{t("operation.cashFinal")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashFinal}
                  onChange={(e) => setCashFinal(e.target.value)}
                  className="w-full rounded-lg border border-black/20 bg-white px-3 py-2"
                />
                <button
                  onClick={() => void closeOperation()}
                  className="w-full rounded-2xl bg-brand py-4 font-semibold text-cream"
                >
                  {t("operation.close")}
                </button>
              </div>
            )}

            <section className="space-y-3">
              <h2 className="font-display text-xl">{t("pendency.title")}</h2>
              <div className="flex gap-2">
                <input
                  value={newPendency}
                  onChange={(e) => setNewPendency(e.target.value)}
                  placeholder={t("pendency.placeholder")}
                  className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2"
                />
                <button
                  onClick={() => void addPendency()}
                  disabled={!newPendency.trim()}
                  className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
                >
                  {t("pendency.add")}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newPendencyCritical}
                  onChange={(e) => setNewPendencyCritical(e.target.checked)}
                />
                {t("pendency.critical")}
              </label>

              <ul className="divide-y divide-black/10 rounded-2xl bg-white">
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
    </div>
  );
}
