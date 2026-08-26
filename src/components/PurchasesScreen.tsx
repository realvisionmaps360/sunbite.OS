import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { money } from "../config";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Purchase, StockItem, Supplier } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, TileButton } from "./ui";

interface DraftItem {
  stock_item_id: string;
  quantity: string;
  unit_cost: string;
}

/**
 * Tela de Compras (Etapa 7, Parte B) — exige sessao, so com internet, sem
 * fila: e mexida sentada com wifi, nao em pe na barraca. Registrar uma
 * compra grava `purchases` + `purchase_items` e, para cada item, um
 * `stock_movements` com reason='compra' — mesma tabela/gatilho que o
 * Estoque usa, para o total do item subir sozinho.
 */
export default function PurchasesScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <PurchasesBody onClose={onClose} identity={auth.identity} />;
}

function PurchasesBody({ onClose, identity }: { onClose: () => void; identity: Identity }) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const [{ data: sup }, { data: stk }, { data: pur }] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("stock_items").select("*").order("name"),
        supabase.from("purchases").select("*").order("purchased_at", { ascending: false }).limit(20),
      ]);
      if (sup) setSuppliers(sup as Supplier[]);
      if (stk) setStockItems(stk as StockItem[]);
      if (pur) setPurchases(pur as Purchase[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function addDraftItem() {
    if (stockItems.length === 0) return;
    setItems((prev) => [...prev, { stock_item_id: stockItems[0].id, quantity: "", unit_cost: "" }]);
  }

  function updateDraftItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeDraftItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0);

  async function save() {
    const validItems = items.filter((it) => Number(it.quantity) > 0);
    if (validItems.length === 0) return;
    setSaving(true);
    try {
      const supabase = await getSupabase();
      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          supplier_id: supplierId || null,
          purchased_at: new Date().toISOString().slice(0, 10),
          total,
          created_by: identity.userId,
        })
        .select()
        .single();
      if (pErr || !purchase) throw new Error(pErr?.message ?? "Falha ao gravar compra");

      const rows = validItems.map((it) => ({
        purchase_id: purchase.id as string,
        stock_item_id: it.stock_item_id,
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost) || null,
      }));
      await supabase.from("purchase_items").insert(rows);

      await supabase.from("stock_movements").insert(
        validItems.map((it) => ({
          stock_item_id: it.stock_item_id,
          quantity_delta: Number(it.quantity),
          reason: "compra" as const,
          created_by: identity.userId,
        })),
      );

      setItems([]);
      setSupplierId("");
      setCreating(false);
      await load();
    } catch {
      // Falha de rede a meio do salvamento: o usuario ve que nada mudou na
      // lista e tenta de novo — sem fila aqui, e acao rara e sentada.
    } finally {
      setSaving(false);
    }
  }

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("purchases.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("purchases.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {creating ? (
            <Card>
              <p className="font-display text-lg">{t("purchases.new")}</p>
              <select
                value={supplierId}
                disabled={!online}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 disabled:opacity-40"
              >
                <option value="">{t("purchases.noSupplier")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-soft p-2">
                  <select
                    value={it.stock_item_id}
                    disabled={!online}
                    onChange={(e) => updateDraftItem(i, { stock_item_id: e.target.value })}
                    className="flex-1 rounded-lg border border-black/10 bg-cream px-2 py-1 text-sm"
                  >
                    {stockItems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={it.quantity}
                    disabled={!online}
                    onChange={(e) => updateDraftItem(i, { quantity: e.target.value })}
                    placeholder={t("purchases.quantity")}
                    className="w-20 rounded-lg border border-black/10 bg-cream px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={it.unit_cost}
                    disabled={!online}
                    onChange={(e) => updateDraftItem(i, { unit_cost: e.target.value })}
                    placeholder={t("purchases.unitCost")}
                    className="w-24 rounded-lg border border-black/10 bg-cream px-2 py-1 text-sm"
                  />
                  <button onClick={() => removeDraftItem(i)} className="px-2 text-xl text-red-700">
                    ×
                  </button>
                </div>
              ))}

              <TileButton
                emoji="➕"
                label={t("purchases.addItem")}
                variant="dashed"
                onClick={addDraftItem}
                disabled={!online || stockItems.length === 0}
              />

              {items.length > 0 && (
                <p className="text-right font-display text-2xl tabular-nums text-brand">
                  {t("purchases.total", { total: money(total) })}
                </p>
              )}

              <div className="flex gap-2">
                <TileButton
                  emoji="✓"
                  label={t("purchases.save")}
                  onClick={() => void save()}
                  disabled={!online || saving || items.every((it) => !Number(it.quantity))}
                />
                <button onClick={() => setCreating(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="🛒" label={t("purchases.new")} variant="dashed" onClick={() => setCreating(true)} disabled={!online} />
          )}

          <section>
            <h2 className="mb-2 mt-2 font-display text-xl">{t("purchases.recent")}</h2>
            {purchases.length === 0 ? (
              <EmptyState emoji="🛒" text={t("purchases.empty")} />
            ) : (
              <div className="space-y-2">
                {purchases.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-cream p-4 shadow-sm"
                  >
                    <span className="text-sm">
                      {new Date(p.purchased_at).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR")} ·{" "}
                      {supplierName(p.supplier_id)}
                    </span>
                    <span className="font-display text-lg text-brand">{p.total != null ? money(p.total) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
