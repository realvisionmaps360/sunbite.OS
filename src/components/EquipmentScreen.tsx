import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { LangToggle, useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Equipment, EquipmentStatus } from "../types";
import LoginScreen from "./LoginScreen";

const STATUSES: EquipmentStatus[] = ["ok", "issue", "broken", "missing"];

/**
 * Tela de Equipamento (Etapa 7) — exige sessao, igual OperationScreen.
 * "So com internet": sem fila, sem cache de escrita — e um modulo mexido
 * sentado com wifi, nao em pe na barraca. Offline, so mostra o aviso.
 */
export default function EquipmentScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <EquipmentBody onClose={onClose} />;
}

function EquipmentBody({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Equipment[]>([]);
  const [newName, setNewName] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("equipment").select("*").order("critical", { ascending: false }).order("name");
      if (data) setItems(data as Equipment[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateItem(id: string, patch: Partial<Equipment>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const supabase = await getSupabase();
      await supabase.from("equipment").update(patch).eq("id", id);
    } catch {
      void load();
    }
  }

  async function addItem() {
    if (!newName.trim()) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("equipment")
        .insert({ name: newName.trim(), status: "ok", critical: false })
        .select()
        .single();
      if (data) setItems((prev) => [...prev, data as Equipment]);
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
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("equipment.title")}</h1>
        <LangToggle />
      </header>

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("equipment.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-4 p-4">
          <ul className="divide-y divide-black/10 rounded-2xl bg-white">
            {items.length === 0 && (
              <li className="p-4 text-center text-ink-muted">{t("equipment.empty")}</li>
            )}
            {items.map((eq) => (
              <li key={eq.id} className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-semibold">{eq.name}</span>
                  {eq.critical && (
                    <span className="shrink-0 rounded-full bg-red-700/10 px-2 py-0.5 text-xs font-semibold text-red-800">
                      {t("checklist.critical")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={eq.status}
                    disabled={!online}
                    onChange={(e) => void updateItem(eq.id, { status: e.target.value as EquipmentStatus })}
                    className="rounded-lg border border-black/20 bg-white px-2 py-1 text-sm disabled:opacity-40"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`equipment.status.${s}`)}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={eq.critical}
                      disabled={!online}
                      onChange={(e) => void updateItem(eq.id, { critical: e.target.checked })}
                    />
                    {t("checklist.critical")}
                  </label>
                </div>
                <input
                  value={eq.notes ?? ""}
                  disabled={!online}
                  placeholder={t("equipment.notesPlaceholder")}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === eq.id ? { ...x, notes: e.target.value } : x)))}
                  onBlur={(e) => void updateItem(eq.id, { notes: e.target.value })}
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
              placeholder={t("equipment.namePlaceholder")}
              className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 disabled:opacity-40"
            />
            <button
              onClick={() => void addItem()}
              disabled={!online || !newName.trim()}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-cream disabled:opacity-40"
            >
              {t("equipment.add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
