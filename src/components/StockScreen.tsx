import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { deviceId } from "../db";
import { useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import { getSupabase } from "../supabase";
import type { StockItem, StockMovement, StockMovementReason } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, SegmentedPicker, StatusPill, TileButton } from "./ui";

const REASONS: { value: StockMovementReason; emoji: string }[] = [
  { value: "compra", emoji: "🛒" },
  { value: "uso", emoji: "🔧" },
  { value: "ajuste", emoji: "⚖️" },
  { value: "perda", emoji: "📉" },
];

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
  const [adding, setAdding] = useState(false);
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
      setAdding(false);
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
      <AdminHeader title={t("stock.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("operation.offlineNotice")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {items.length === 0 && <EmptyState emoji="📦" text={t("stock.empty")} />}

          {items.map((item) => {
            const low = item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex-1 font-display text-lg leading-tight">{item.name}</p>
                  {low && <StatusPill tone="danger">{t("stock.lowStockWarning")}</StatusPill>}
                </div>
                <p className="font-display text-4xl tabular-nums text-brand">
                  {item.quantity} <span className="text-xl text-ink-muted">{item.unit}</span>
                </p>

                {movingId === item.id ? (
                  <div className="space-y-3 rounded-xl bg-cream-soft p-3">
                    <SegmentedPicker
                      options={REASONS.map((r) => ({ ...r, label: t(`stock.reason.${r.value}`) }))}
                      value={reason}
                      onChange={setReason}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder={t("stock.movementQty")}
                      className="w-full rounded-lg border border-black/10 bg-cream px-3 py-2"
                    />
                    <div className="flex gap-2">
                      <TileButton
                        emoji="✓"
                        label={t("stock.movementSave")}
                        onClick={() => void registerMovement(item)}
                        disabled={!qty}
                      />
                      <button onClick={() => setMovingId(null)} className="rounded-2xl border border-black/20 px-4">
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <TileButton
                    emoji="📝"
                    label={t("stock.registerMovement")}
                    variant="outline"
                    onClick={() => {
                      setMovingId(item.id);
                      setQty("");
                    }}
                  />
                )}
              </Card>
            );
          })}

          {adding ? (
            <Card>
              <p className="text-sm font-semibold">{t("stock.addItem")}</p>
              <input
                value={newName}
                autoFocus
                disabled={!online}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("equipment.namePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 disabled:opacity-40"
              />
              <input
                value={newUnit}
                disabled={!online}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder={t("stock.unitPlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 disabled:opacity-40"
              />
              <div className="flex gap-2">
                <TileButton
                  emoji="✓"
                  label={t("equipment.add")}
                  onClick={() => void addItem()}
                  disabled={!online || !newName.trim() || !newUnit.trim()}
                />
                <button onClick={() => setAdding(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("stock.addItem")} variant="dashed" onClick={() => setAdding(true)} disabled={!online} />
          )}
        </div>
      )}
    </div>
  );
}
