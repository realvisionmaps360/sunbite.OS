import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { EventType, Place, SunbiteEvent } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, SegmentedPicker, StatusPill, TileButton } from "./ui";

/**
 * Tela de Locais e Eventos (Etapa 8) — mesmo padrao das demais telas
 * administrativas: exige sessao, so com internet, sem fila (nao e tocada em
 * pe na barraca). Duas abas porque locais e eventos sao dois cadastros
 * pequenos e muito ligados — nao ha volume que justifique duas telas.
 */
export default function PlacesScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <PlacesBody onClose={onClose} />;
}

const EVENT_TYPES: { value: EventType; emoji: string }[] = [
  { value: "market", emoji: "🛍️" },
  { value: "festival", emoji: "🎉" },
  { value: "popup", emoji: "📍" },
  { value: "private", emoji: "🔒" },
];

function PlacesBody({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"places" | "events">("places");
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<SunbiteEvent[]>([]);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ place_id: "", starts_at: "", label_en: "", label_de: "" });
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const [p, e] = await Promise.all([
        supabase.from("places").select("*").order("name"),
        supabase.from("events").select("*").order("starts_at", { ascending: false }),
      ]);
      if (p.data) setPlaces(p.data as Place[]);
      if (e.data) setEvents(e.data as SunbiteEvent[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePlace(id: string, patch: Partial<Place>) {
    setPlaces((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const supabase = await getSupabase();
      await supabase.from("places").update(patch).eq("id", id);
    } catch {
      void load();
    }
  }

  async function addPlace() {
    if (!newPlaceName.trim()) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("places").insert({ name: newPlaceName.trim() }).select().single();
      if (data) setPlaces((prev) => [...prev, data as Place]);
      setNewPlaceName("");
      setAddingPlace(false);
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  async function updateEvent(id: string, patch: Partial<SunbiteEvent>) {
    setEvents((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const supabase = await getSupabase();
      await supabase.from("events").update(patch).eq("id", id);
    } catch {
      void load();
    }
  }

  async function addEvent() {
    if (!newEvent.starts_at) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("events")
        .insert({
          place_id: newEvent.place_id || null,
          starts_at: new Date(newEvent.starts_at).toISOString(),
          label_en: newEvent.label_en || null,
          label_de: newEvent.label_de || null,
        })
        .select()
        .single();
      if (data) setEvents((prev) => [data as SunbiteEvent, ...prev]);
      setNewEvent({ place_id: "", starts_at: "", label_en: "", label_de: "" });
      setAddingEvent(false);
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  const placeName = (id: string | null) => places.find((p) => p.id === id)?.name ?? t("places.noPlace");

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("places.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">{t("places.needsInternet")}</p>
      )}

      <div className="p-4 pb-0">
        <SegmentedPicker
          options={[
            { value: "places" as const, emoji: "📍", label: t("places.tabPlaces") },
            { value: "events" as const, emoji: "🎪", label: t("places.tabEvents") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && tab === "places" && (
        <div className="flex-1 space-y-3 p-4">
          {places.length === 0 && <EmptyState emoji="📍" text={t("places.emptyPlaces")} />}

          {places.map((pl) => (
            <Card key={pl.id}>
              <p className="font-display text-lg leading-tight">{pl.name}</p>
              <label className="block text-xs font-semibold text-ink-muted">🏙️ {t("places.cityPlaceholder")}</label>
              <input
                value={pl.city ?? ""}
                disabled={!online}
                onChange={(e) => setPlaces((prev) => prev.map((x) => (x.id === pl.id ? { ...x, city: e.target.value } : x)))}
                onBlur={(e) => void updatePlace(pl.id, { city: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
              <label className="block text-xs font-semibold text-ink-muted">📞 {t("places.contactPlaceholder")}</label>
              <input
                value={pl.contact ?? ""}
                disabled={!online}
                onChange={(e) => setPlaces((prev) => prev.map((x) => (x.id === pl.id ? { ...x, contact: e.target.value } : x)))}
                onBlur={(e) => void updatePlace(pl.id, { contact: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
              <label className="block text-xs font-semibold text-ink-muted">📝 {t("places.notesPlaceholder")}</label>
              <input
                value={pl.notes ?? ""}
                disabled={!online}
                onChange={(e) => setPlaces((prev) => prev.map((x) => (x.id === pl.id ? { ...x, notes: e.target.value } : x)))}
                onBlur={(e) => void updatePlace(pl.id, { notes: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
            </Card>
          ))}

          {addingPlace ? (
            <Card>
              <input
                value={newPlaceName}
                autoFocus
                onChange={(e) => setNewPlaceName(e.target.value)}
                placeholder={t("places.namePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("places.add")} onClick={() => void addPlace()} disabled={!newPlaceName.trim()} />
                <button onClick={() => setAddingPlace(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("places.add")} variant="dashed" onClick={() => setAddingPlace(true)} disabled={!online} />
          )}
        </div>
      )}

      {!loading && tab === "events" && (
        <div className="flex-1 space-y-3 p-4">
          {events.length === 0 && <EmptyState emoji="🎪" text={t("places.emptyEvents")} />}

          {events.map((ev) => (
            <Card key={ev.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg leading-tight">
                  {new Date(ev.starts_at).toLocaleString()} · {placeName(ev.place_id)}
                </p>
                <StatusPill tone={ev.is_public ? "ok" : "neutral"}>
                  {ev.is_public ? t("places.public") : t("places.private")}
                </StatusPill>
              </div>

              <label className="block text-xs font-semibold text-ink-muted">🇬🇧 {t("places.labelEnPlaceholder")}</label>
              <input
                value={ev.label_en ?? ""}
                disabled={!online}
                onChange={(e) => setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, label_en: e.target.value } : x)))}
                onBlur={(e) => void updateEvent(ev.id, { label_en: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />
              <label className="block text-xs font-semibold text-ink-muted">🇩🇪 {t("places.labelDePlaceholder")}</label>
              <input
                value={ev.label_de ?? ""}
                disabled={!online}
                onChange={(e) => setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, label_de: e.target.value } : x)))}
                onBlur={(e) => void updateEvent(ev.id, { label_de: e.target.value })}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
              />

              <SegmentedPicker
                options={EVENT_TYPES.map((et) => ({ ...et, label: t(`places.eventType.${et.value}`) }))}
                value={ev.event_type ?? "market"}
                disabled={!online}
                onChange={(v) => void updateEvent(ev.id, { event_type: v })}
              />

              <TileButton
                emoji={ev.is_public ? "🙈" : "📣"}
                label={ev.is_public ? t("places.makePrivate") : t("places.makePublic")}
                variant="outline"
                disabled={!online}
                onClick={() => void updateEvent(ev.id, { is_public: !ev.is_public })}
              />
            </Card>
          ))}

          {addingEvent ? (
            <Card>
              <label className="block text-xs font-semibold text-ink-muted">📍 {t("places.tabPlaces")}</label>
              <select
                value={newEvent.place_id}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, place_id: e.target.value }))}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              >
                <option value="">{t("places.noPlace")}</option>
                {places.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-ink-muted">🕐 {t("places.startsAtPlaceholder")}</label>
              <input
                type="datetime-local"
                value={newEvent.starts_at}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, starts_at: e.target.value }))}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <label className="block text-xs font-semibold text-ink-muted">🇬🇧 {t("places.labelEnPlaceholder")}</label>
              <input
                value={newEvent.label_en}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, label_en: e.target.value }))}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <label className="block text-xs font-semibold text-ink-muted">🇩🇪 {t("places.labelDePlaceholder")}</label>
              <input
                value={newEvent.label_de}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, label_de: e.target.value }))}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("places.add")} onClick={() => void addEvent()} disabled={!newEvent.starts_at} />
                <button onClick={() => setAddingEvent(false)} className="rounded-2xl border border-black/20 px-4">
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("places.add")} variant="dashed" onClick={() => setAddingEvent(true)} disabled={!online} />
          )}
        </div>
      )}
    </div>
  );
}
