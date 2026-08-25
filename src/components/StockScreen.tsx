import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { deviceId } from "../db";
import { LangToggle, useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import { getSupabase } from "../supabase";
import type { StockItem, StockMovement, StockMovementReason } from "../types";
import LoginScreen from "./LoginScreen";

const REASONS: StockMovementReason[] = ["compra", "uso", "ajuste", "perda"];

/**
 * Tela de Estoque (Etapa 7) — exige sessao. Diferente de Equipamento/
 * Fornecedores: o item em si (nome/unidade/limite) e "sentado com wifi",
 * mas registrar um MOVIMENTO (baixa/contagem) e tocado em pe na barraca —
 * por isso e a unica tabela desta etapa com fila offline (outbox.ts).
 * `quantity` nunca e enviada direto: so o gatilho apply_stock_movement
 * (Etapa 1) muda essa coluna, a partir dos movimentos.
 */
export default function StockScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <StockBody onClose={onClose} identity={auth.identity} />;
}

function StockBody({ onClose, identity }: { onClose: () => void; identity: Identity }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [reason, setReason] = useState<StockMovementReason>("uso");
  const [qty, setQty] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("stock_items").select("*").order("name");
      if (data) setItems(data as StockItem[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOnline = () => {
      void flushOutbox();
      void load();
    };
    window.addEventListener("online", onOnline);
    void flushOutbox();
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  async function addItem() {
    if (!newName.trim() || !newUnit.trim()) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("stock_items")
        .insert({ name: newName.trim(), unit: newUnit.trim() })
        .select()
        .single();
      if (data) setItems((prev) => [...prev, data as StockItem]);
      setNewName("");
      setNewUnit("");
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  async function registerMovement(item: StockItem) {
    const n = Number(qty);
    if (!n) return;
    const delta = reason === "uso" || reason === "perda" ? -Math.abs(n) : Math.abs(n);
    const row: StockMovement = {
      id: crypto.randomUUID(),
      stock_item_id: item.id,
      quantity_delta: delta,
      reason,
      operation_id: null,
      notes: null,
      created_by: identity.userId,
      device_id: deviceId(),
      created_at: new Date().toISOString(),
    };
    // Otimista: soma local ja, o gatilho no servidor confirma quando sincronizar.
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, quantity: x.quantity + delta } : x)));
    setMovingId(null);
    setQty("");
    await queueWrite("stock_movements", row);
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold">
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("stock.title")}</h1>
        <LangToggle />
      </header>

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("operation.offlineNotice")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-4 p-4">
          <ul className="divide-y divide-black/10 rounded-2xl bg-white">
            {items.length === 0 && (
              <li className="p-4 text-center text-ink-muted">{t("stock.empty")}</li>
            )}
            {items.map((item) => {
              const low = item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
              return (
                <li key={item.id} className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-semibold">{item.name}</span>
                    <span className={low ? "font-semibold text-red-700" : "text-ink-muted"}>
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                  {low && <p className="text-xs font-semibold text-red-700">{t("stock.lowStockWarning")}</p>}

                  {movingId === item.id ? (
                    <div className="space-y-2 rounded-lg bg-cream-soft p-2">
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={reason}
                          onChange={(e) => setReason(e.target.value as StockMovementReason)}
                          className="rounded-lg border border-black/20 bg-white px-2 py-1 text-sm"
                        >
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {t(`stock.reason.${r}`)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          placeholder={t("stock.movementQty")}
                          className="w-24 rounded-lg border border-black/20 bg-white px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void registerMovement(item)}
                          disabled={!qty}
                          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-cream disabled:opacity-40"
                        >
                          {t("stock.movementSave")}
                        </button>
                        <button
                          onClick={() => setMovingId(null)}
                          className="rounded-lg border border-black/20 px-4 py-2 text-sm"
                        >
                          {t("pay.back")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setMovingId(item.id);
                        setQty("");
                      }}
                      className="w-full rounded-lg border border-brand py-2 text-sm font-semibold text-brand"
                    >
                      {t("stock.registerMovement")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 rounded-2xl bg-white p-3">
            <p className="text-sm font-semibold">{t("stock.addItem")}</p>
            <div className="flex gap-2">
              <input
                value={newName}
                disabled={!online}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("equipment.namePlaceholder")}
                className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
              />
              <input
                value={newUnit}
                disabled={!online}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder={t("stock.unitPlaceholder")}
                className="w-24 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
              />
              <button
                onClick={() => void addItem()}
                disabled={!online || !newName.trim() || !newUnit.trim()}
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
              >
                {t("equipment.add")}
              </button>
            </div>
            {!online && <p className="text-xs text-ink-muted">{t("stock.needsInternet")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
