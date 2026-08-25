import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { money } from "../config";
import { LangToggle, useLang } from "../i18n";
import { applyPriceUpdate, getCupPrice, getToppingPrice } from "../prices";
import { getSupabase } from "../supabase";
import type { PriceHistoryRow } from "../types";
import LoginScreen from "./LoginScreen";

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

function PricesBody({ onClose, identity }: { onClose: () => void; identity: Identity }) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [cup, setCup] = useState(String(getCupPrice()));
  const [topping, setTopping] = useState(String(getToppingPrice()));
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [msg, setMsg] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data: rows } = await supabase.from("prices").select("*");
      for (const r of (rows ?? []) as { item_key: string; value: number }[]) {
        if (r.item_key === "cup") setCup(String(r.value));
        if (r.item_key === "topping") setTopping(String(r.value));
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

  async function save(itemKey: "cup" | "topping", raw: string) {
    const value = Number(raw);
    if (!value) return;
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from("prices")
        .update({ value, updated_by: identity.userId, updated_at: new Date().toISOString() })
        .eq("item_key", itemKey);
      if (error) throw new Error(error.message);
      applyPriceUpdate(itemKey, value);
      setMsg(t("prices.saved"));
      void load();
    } catch (e) {
      setMsg(t("prices.error", { msg: (e as Error).message }));
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold">
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("prices.title")}</h1>
        <LangToggle />
      </header>

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("prices.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-4 p-4">
          <section className="space-y-3 rounded-2xl bg-white p-4">
            <div>
              <label className="block text-sm font-semibold">{t("prices.cup")}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={cup}
                  disabled={!online}
                  onChange={(e) => setCup(e.target.value)}
                  className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
                />
                <button
                  onClick={() => void save("cup", cup)}
                  disabled={!online}
                  className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
                >
                  {t("prices.save")}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold">{t("prices.topping")}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={topping}
                  disabled={!online}
                  onChange={(e) => setTopping(e.target.value)}
                  className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
                />
                <button
                  onClick={() => void save("topping", topping)}
                  disabled={!online}
                  className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
                >
                  {t("prices.save")}
                </button>
              </div>
            </div>

            {msg && <p className="rounded-lg bg-brand/10 p-3 text-center text-brand">{msg}</p>}
          </section>

          <section>
            <h2 className="mb-2 font-display text-xl">{t("prices.history")}</h2>
            <ul className="divide-y divide-black/10 rounded-2xl bg-white">
              {history.length === 0 && (
                <li className="p-4 text-center text-ink-muted">{t("prices.historyEmpty")}</li>
              )}
              {history.map((h) => (
                <li key={h.id} className="p-3 text-sm">
                  <span className="font-semibold">{h.item_key === "cup" ? t("prices.cup") : t("prices.topping")}</span>{" "}
                  {money(h.old_value ?? 0)} → {money(h.new_value)}
                  <span className="ml-2 text-ink-muted">
                    {new Date(h.changed_at).toLocaleString(lang === "de" ? "de-CH" : "pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
