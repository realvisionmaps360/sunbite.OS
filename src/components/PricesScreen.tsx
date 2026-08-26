import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { money } from "../config";
import { useLang } from "../i18n";
import { applyPriceUpdate, getCupPrice, getToppingPrice } from "../prices";
import { getSupabase } from "../supabase";
import type { PriceHistoryRow } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, TileButton } from "./ui";
import { Valor } from "./Valor";

/**
 * Tela de Preco de venda (Etapa 7, Parte B), aberta a partir de Ajustes —
 * "mora numa tela propria dentro de Ajustes", nao embutida no componente de
 * Ajustes, porque editar preco exige sessao (RLS so authenticated escreve
 * em `prices`) e Ajustes continua carregado direto (nao e lazy), fora do
 * grafo de auth/supabase. Sem confirmacao: muda e salva, como o resto do
 * app — o historico (price_history, gravado por gatilho no banco) e a
 * protecao.
 */
export default function PricesScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <PricesBody onClose={onClose} identity={auth.identity} />;
}

function PriceCard({
  label,
  value,
  editing,
  draft,
  online,
  onEdit,
  onDraftChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: number;
  editing: boolean;
  draft: string;
  online: boolean;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  return (
    <Card>
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      {editing ? (
        <>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-3 text-center font-display text-3xl"
          />
          <div className="flex gap-2">
            <TileButton emoji="✓" label={t("prices.save")} onClick={onSave} />
            <button onClick={onCancel} className="rounded-2xl border border-black/20 px-4">
              ×
            </button>
          </div>
        </>
      ) : (
        <button onClick={onEdit} disabled={!online} className="w-full text-left disabled:opacity-40">
          <Valor chf={value} tamanho="grande" className="text-brand" />
        </button>
      )}
    </Card>
  );
}

function PricesBody({ onClose, identity }: { onClose: () => void; identity: Identity }) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [cup, setCup] = useState(getCupPrice());
  const [topping, setTopping] = useState(getToppingPrice());
  const [editing, setEditing] = useState<"cup" | "topping" | null>(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [msg, setMsg] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data: rows } = await supabase.from("prices").select("*");
      for (const r of (rows ?? []) as { item_key: string; value: number }[]) {
        if (r.item_key === "cup") setCup(r.value);
        if (r.item_key === "topping") setTopping(r.value);
      }
      const { data: hist } = await supabase
        .from("price_history")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(10);
      if (hist) setHistory(hist as PriceHistoryRow[]);
    } catch {
      // Offline ou sem sessao valida: fica com o valor atual (cache/config).
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(key: "cup" | "topping") {
    setEditing(key);
    setDraft(String(key === "cup" ? cup : topping));
  }

  async function save() {
    if (!editing) return;
    const value = Number(draft);
    if (!value) return;
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from("prices")
        .update({ value, updated_by: identity.userId, updated_at: new Date().toISOString() })
        .eq("item_key", editing);
      if (error) throw new Error(error.message);
      applyPriceUpdate(editing, value);
      if (editing === "cup") setCup(value);
      else setTopping(value);
      setMsg(t("prices.saved"));
      setEditing(null);
      void load();
    } catch (e) {
      setMsg(t("prices.error", { msg: (e as Error).message }));
    }
  }

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("prices.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("prices.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          <PriceCard
            label={t("prices.cup")}
            value={cup}
            editing={editing === "cup"}
            draft={draft}
            online={online}
            onEdit={() => startEdit("cup")}
            onDraftChange={setDraft}
            onSave={() => void save()}
            onCancel={() => setEditing(null)}
          />
          <PriceCard
            label={t("prices.topping")}
            value={topping}
            editing={editing === "topping"}
            draft={draft}
            online={online}
            onEdit={() => startEdit("topping")}
            onDraftChange={setDraft}
            onSave={() => void save()}
            onCancel={() => setEditing(null)}
          />

          {msg && <p className="rounded-2xl bg-brand/10 p-3 text-center text-brand">{msg}</p>}

          <section>
            <h2 className="mb-2 mt-2 font-display text-xl">{t("prices.history")}</h2>
            {history.length === 0 ? (
              <EmptyState emoji="🕐" text={t("prices.historyEmpty")} />
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <Card key={h.id}>
                    <p className="text-sm">
                      <span className="font-semibold">{h.item_key === "cup" ? t("prices.cup") : t("prices.topping")}</span>{" "}
                      {money(h.old_value ?? 0)} → {money(h.new_value)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {new Date(h.changed_at).toLocaleString(lang === "de" ? "de-CH" : "pt-BR")}
                    </p>
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
