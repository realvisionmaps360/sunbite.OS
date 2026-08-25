import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { LangToggle, useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Supplier } from "../types";
import LoginScreen from "./LoginScreen";

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
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold">
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("suppliers.title")}</h1>
        <LangToggle />
      </header>

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("suppliers.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-4 p-4">
          <ul className="divide-y divide-black/10 rounded-2xl bg-white">
            {items.length === 0 && (
              <li className="p-4 text-center text-ink-muted">{t("suppliers.empty")}</li>
            )}
            {items.map((sup) => (
              <li key={sup.id} className="space-y-2 p-3">
                <p className="font-semibold">{sup.name}</p>
                <input
                  value={sup.product ?? ""}
                  disabled={!online}
                  placeholder={t("suppliers.productPlaceholder")}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, product: e.target.value } : x)))}
                  onBlur={(e) => void updateItem(sup.id, { product: e.target.value })}
                  className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm disabled:opacity-40"
                />
                <input
                  value={sup.contact ?? ""}
                  disabled={!online}
                  placeholder={t("suppliers.contactPlaceholder")}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, contact: e.target.value } : x)))}
                  onBlur={(e) => void updateItem(sup.id, { contact: e.target.value })}
                  className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm disabled:opacity-40"
                />
                <input
                  value={sup.notes ?? ""}
                  disabled={!online}
                  placeholder={t("suppliers.notesPlaceholder")}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === sup.id ? { ...x, notes: e.target.value } : x)))}
                  onBlur={(e) => void updateItem(sup.id, { notes: e.target.value })}
                  className="w-full rounded-lg border border-black/20 bg-white px-3 py-2 text-sm disabled:opacity-40"
                />
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input
              value={newName}
              disabled={!online}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("suppliers.namePlaceholder")}
              className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
            />
            <button
              onClick={() => void addItem()}
              disabled={!online || !newName.trim()}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
            >
              {t("suppliers.add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
