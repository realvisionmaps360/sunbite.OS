import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Equipment, EquipmentStatus } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, SegmentedPicker, StatusPill, TileButton } from "./ui";

const STATUSES: { value: EquipmentStatus; emoji: string }[] = [
  { value: "ok", emoji: "✅" },
  { value: "issue", emoji: "⚠️" },
  { value: "broken", emoji: "❌" },
  { value: "missing", emoji: "❓" },
];

const STATUS_TONE: Record<EquipmentStatus, "ok" | "warn" | "danger" | "neutral"> = {
  ok: "ok",
  issue: "warn",
  broken: "danger",
  missing: "neutral",
};

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
  const [adding, setAdding] = useState(false);
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
      setAdding(false);
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("equipment.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("equipment.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {items.length === 0 && <EmptyState emoji="🔧" text={t("equipment.empty")} />}

          {items.map((eq) => (
            <Card key={eq.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 font-display text-lg leading-tight">{eq.name}</p>
                <StatusPill tone={STATUS_TONE[eq.status]}>{t(`equipment.status.${eq.status}`)}</StatusPill>
              </div>

              <SegmentedPicker
                options={STATUSES.map((s) => ({ ...s, label: t(`equipment.status.${s.value}`) }))}
                value={eq.status}
                disabled={!online}
                onChange={(v) => void updateItem(eq.id, { status: v })}
              />

              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={eq.critical}
                  disabled={!online}
                  onChange={(e) => void updateItem(eq.id, { critical: e.target.checked })}
                />
                {t("checklist.critical")}
              </label>

              <input
                value={eq.notes ?? ""}
                disabled={!online}
                placeholder={t("equipment.notesPlaceholder")}
                onChange={(e) => setItems((prev) => prev.map((x) => (x.id === eq.id ? { ...x, notes: e.target.value } : x)))}
                onBlur={(e) => void updateItem(eq.id, { notes: e.target.value })}
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
                placeholder={t("equipment.namePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("equipment.add")} onClick={() => void addItem()} disabled={!newName.trim()} />
                <button onClick={() => setAdding(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("equipment.add")} variant="dashed" onClick={() => setAdding(true)} disabled={!online} />
          )}
        </div>
      )}
    </div>
  );
}
