import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Supplier } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, TileButton } from "./ui";

/**
 * Tela de Fornecedores (Etapa 7) — mesmo padrao de EquipmentScreen: exige
 * sessao, so com internet, sem fila.
 */
export default function SuppliersScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <SuppliersBody onClose={onClose} />;
}

function SuppliersBody({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Supplier[]>([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("suppliers").select("*").order("name");
      if (data) setItems(data as Supplier[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateItem(id: string, patch: Partial<Supplier>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const supabase = await getSupabase();
      await supabase.from("suppliers").update(patch).eq("id", id);
    } catch {
      void load();
    }
  }

  async function addItem() {
    if (!newName.trim()) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("suppliers").insert({ name: newName.trim() }).select().single();
      if (data) setItems((prev) => [...prev, data as Supplier]);
      setNewName("");
      setAdding(false);
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("suppliers.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("suppliers.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {items.length === 0 && <EmptyState emoji="🏭" text={t("suppliers.empty")} />}

          {items.map((sup) => (
            <Card key={sup.id}>
              <p className="font-display text-lg leading-tight">{sup.name}</p>
              <label className="block text-xs font-semibold text-ink-muted">📦 {t("suppliers.productPlaceholder")}</label>
              <input
                value={sup.product ?? ""}
                disabled={!online}
                onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, product: e.target.value } : x)))}
                onBlur={(e) => void updateItem(sup.id, { product: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
              <label className="block text-xs font-semibold text-ink-muted">📞 {t("suppliers.contactPlaceholder")}</label>
              <input
                value={sup.contact ?? ""}
                disabled={!online}
                onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, contact: e.target.value } : x)))}
                onBlur={(e) => void updateItem(sup.id, { contact: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
              <label className="block text-xs font-semibold text-ink-muted">📝 {t("suppliers.notesPlaceholder")}</label>
              <input
                value={sup.notes ?? ""}
                disabled={!online}
                onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, notes: e.target.value } : x)))}
                onBlur={(e) => void updateItem(sup.id, { notes: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
            </Card>
          ))}

          {adding ? (
            <Card>
              <input
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("suppliers.namePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("suppliers.add")} onClick={() => void addItem()} disabled={!newName.trim()} />
                <button onClick={() => setAdding(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("suppliers.add")} variant="dashed" onClick={() => setAdding(true)} disabled={!online} />
          )}
        </div>
      )}
    </div>
  );
}
