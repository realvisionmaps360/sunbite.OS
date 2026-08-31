import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { money } from "../config";
import { useLang } from "../i18n";
import {
  coordsDeMapsUrl,
  formatarCoords,
  googleCalendarUrl,
  linkDoMapa,
  mapsUrlDeCoords,
  paraCampoDataHora,
} from "../places";
import { getSupabase } from "../supabase";
import type { EventType, Place, SunbiteEvent } from "../types";
import LoginScreen from "./LoginScreen";
import {
  AdminHeader,
  Card,
  EmptyState,
  GridCards,
  Modal,
  SegmentedPicker,
  StatusPill,
  Tile,
  TileButton,
} from "./ui";

/**
 * Tela de Locais e Eventos (Etapa 8; redesenhada na ops 15 Parte 4) — mesmo
 * padrao das demais telas administrativas: exige sessao, so com internet, sem
 * fila (nao e tocada em pe na barraca). Duas abas porque locais e eventos sao
 * dois cadastros pequenos e muito ligados.
 *
 * Parte 4 (31/08): a tela era uma pilha de cards com todos os campos sempre
 * abertos, e mesmo assim **faltava o principal**. O nome do local era um `<p>`
 * — nunca foi editavel, entao um erro de cadastro ficava para sempre. `fee`
 * (a taxa da feira) e `rating` (a avaliacao) existiam no banco desde a Etapa 8
 * e **nao apareciam em tela nenhuma**, justamente as duas coisas que decidem
 * se vale voltar. E um evento, depois de criado, nao aceitava mudanca de data,
 * de local nem de observacao.
 *
 * Hoje e grade de cards no estilo da Home -> folha de detalhe com edicao
 * completa, como o Felipe pediu: mais toques, tudo alcancavel.
 *
 * ⚠️ Piso de CSS: Safari 15. Nada de `@container`, `cqw`, `:has()` nem
 * aninhamento nativo — unidade que o navegador nao entende invalida a
 * declaracao inteira e some em silencio (ops 14, o logotipo do iPad).
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

const EMOJI_TIPO: Record<EventType, string> = {
  market: "🛍️",
  festival: "🎉",
  popup: "📍",
  private: "🔒",
};

/** O resultado da ultima vez naquele local — ver `carregarUltimaVez`. */
interface UltimaVez {
  data: string;
  copos: number;
  total: number;
}

function PlacesBody({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<"places" | "events">("places");
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<SunbiteEvent[]>([]);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ place_id: "", starts_at: "", label_en: "", label_de: "" });
  const [placeAbertoId, setPlaceAbertoId] = useState<string | null>(null);
  const [eventoAbertoId, setEventoAbertoId] = useState<string | null>(null);
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
  const placeAberto = places.find((p) => p.id === placeAbertoId) ?? null;
  const eventoAberto = events.find((e) => e.id === eventoAbertoId) ?? null;

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

      {/* ---------- Locais ---------- */}
      {!loading && tab === "places" && (
        <div className="flex-1 space-y-4 p-4">
          {places.length === 0 && <EmptyState emoji="📍" text={t("places.emptyPlaces")} />}

          {places.length > 0 && (
            <GridCards>
              {places.map((pl) => (
                <Tile
                  key={pl.id}
                  icone="📍"
                  label={pl.name}
                  apoio={pl.city ?? undefined}
                  onClick={() => setPlaceAbertoId(pl.id)}
                  pill={
                    pl.fee !== null ? (
                      <StatusPill tone="neutral">{money(pl.fee)}</StatusPill>
                    ) : undefined
                  }
                />
              ))}
            </GridCards>
          )}

          {addingPlace ? (
            <Card>
              <input
                value={newPlaceName}
                autoFocus
                onChange={(e) => setNewPlaceName(e.target.value)}
                placeholder={t("places.namePlaceholder")}
                className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("places.add")} onClick={() => void addPlace()} disabled={!newPlaceName.trim()} />
                <button
                  onClick={() => setAddingPlace(false)}
                  className="min-h-11 min-w-11 rounded-2xl border border-black/20 px-4"
                >
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("places.add")} variant="dashed" onClick={() => setAddingPlace(true)} disabled={!online} />
          )}
        </div>
      )}

      {/* ---------- Eventos ---------- */}
      {!loading && tab === "events" && (
        <div className="flex-1 space-y-4 p-4">
          {events.length === 0 && <EmptyState emoji="🎪" text={t("places.emptyEvents")} />}

          {events.length > 0 && (
            <GridCards>
              {events.map((ev) => (
                <Tile
                  key={ev.id}
                  icone={EMOJI_TIPO[ev.event_type ?? "market"]}
                  label={new Date(ev.starts_at).toLocaleDateString(lang === "de" ? "de-CH" : "pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                  apoio={placeName(ev.place_id)}
                  onClick={() => setEventoAbertoId(ev.id)}
                  pill={
                    <StatusPill tone={ev.is_public ? "ok" : "neutral"}>
                      {ev.is_public ? t("places.public") : t("places.private")}
                    </StatusPill>
                  }
                />
              ))}
            </GridCards>
          )}

          {addingEvent ? (
            <Card>
              <label className="block text-xs font-semibold text-ink-muted">📍 {t("places.tabPlaces")}</label>
              <select
                value={newEvent.place_id}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, place_id: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
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
                className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <label className="block text-xs font-semibold text-ink-muted">🇬🇧 {t("places.labelEnPlaceholder")}</label>
              <input
                value={newEvent.label_en}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, label_en: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <label className="block text-xs font-semibold text-ink-muted">🇩🇪 {t("places.labelDePlaceholder")}</label>
              <input
                value={newEvent.label_de}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, label_de: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("places.add")} onClick={() => void addEvent()} disabled={!newEvent.starts_at} />
                <button
                  onClick={() => setAddingEvent(false)}
                  className="min-h-11 min-w-11 rounded-2xl border border-black/20 px-4"
                >
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("places.add")} variant="dashed" onClick={() => setAddingEvent(true)} disabled={!online} />
          )}
        </div>
      )}

      {placeAberto && (
        <FolhaDoLocal
          place={placeAberto}
          online={online}
          onClose={() => setPlaceAbertoId(null)}
          onCampo={(patch) => setPlaces((prev) => prev.map((x) => (x.id === placeAberto.id ? { ...x, ...patch } : x)))}
          onGravar={(patch) => void updatePlace(placeAberto.id, patch)}
          onRecarregar={() => void load()}
        />
      )}

      {eventoAberto && (
        <FolhaDoEvento
          ev={eventoAberto}
          places={places}
          online={online}
          onClose={() => setEventoAbertoId(null)}
          onCampo={(patch) => setEvents((prev) => prev.map((x) => (x.id === eventoAberto.id ? { ...x, ...patch } : x)))}
          onGravar={(patch) => void updateEvent(eventoAberto.id, patch)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A folha do local                                                    */
/* ------------------------------------------------------------------ */

/**
 * Os campos gravam no `onBlur`, exatamente como antes — fechar a folha (no ×
 * ou no fundo) tira o foco do campo antes de o clique fechar, entao o `blur`
 * sempre dispara primeiro e nada digitado se perde.
 */
function FolhaDoLocal({
  place,
  online,
  onClose,
  onCampo,
  onGravar,
  onRecarregar,
}: {
  place: Place;
  online: boolean;
  onClose: () => void;
  onCampo: (patch: Partial<Place>) => void;
  onGravar: (patch: Partial<Place>) => void;
  onRecarregar: () => void;
}) {
  const { t } = useLang();

  return (
    <Modal title={place.name} onClose={onClose}>
      {/* O nome NUNCA foi editavel aqui: era um `<p>`. Nome vazio nao grava —
          `name` e `not null` no banco — e apagar tudo devolve o valor. */}
      <Campo
        emoji="🏷️"
        label={t("places.namePlaceholder")}
        value={place.name}
        disabled={!online}
        onChange={(v) => onCampo({ name: v })}
        onCommit={(v) => (v.trim() ? onGravar({ name: v.trim() }) : onRecarregar())}
      />
      <Campo
        emoji="🏠"
        label={t("places.addressPlaceholder")}
        value={place.address ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ address: v })}
        onCommit={(v) => onGravar({ address: v || null })}
      />
      <Campo
        emoji="🏙️"
        label={t("places.cityPlaceholder")}
        value={place.city ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ city: v })}
        onCommit={(v) => onGravar({ city: v || null })}
      />
      {/* A taxa e a avaliacao estavam no banco desde a Etapa 8 sem aparecer em
          tela nenhuma — e sao as duas que decidem se vale voltar ao local. */}
      <Campo
        emoji="💰"
        label={t("places.feePlaceholder")}
        value={place.fee === null ? "" : String(place.fee)}
        disabled={!online}
        inputMode="decimal"
        onChange={(v) => onCampo({ fee: v.trim() === "" ? null : Number(v.replace(",", ".")) })}
        onCommit={(v) => {
          const n = Number(v.replace(",", "."));
          onGravar({ fee: v.trim() === "" || Number.isNaN(n) ? null : n });
        }}
      />
      <Campo
        emoji="⭐"
        label={t("places.ratingPlaceholder")}
        value={place.rating ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ rating: v })}
        onCommit={(v) => onGravar({ rating: v || null })}
      />
      <Campo
        emoji="📞"
        label={t("places.contactPlaceholder")}
        value={place.contact ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ contact: v })}
        onCommit={(v) => onGravar({ contact: v || null })}
      />
      <Campo
        emoji="📝"
        label={t("places.notesPlaceholder")}
        value={place.notes ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ notes: v })}
        onCommit={(v) => onGravar({ notes: v || null })}
      />

      <BlocoPosicao place={place} online={online} onGravar={onGravar} />

      {!online && <p className="text-xs text-ink-muted">{t("places.needsInternet")}</p>}
    </Modal>
  );
}

/**
 * A posicao no mapa. Duas entradas, porque as duas acontecem na vida real: o
 * Felipe **esta** no local (GPS) ou esta em casa planejando com o link do
 * Maps aberto.
 *
 * ⚠️ Dado interno: nada disto entra em `public_events`. O que o site mostra da
 * posicao e assunto da Parte 5.
 */
function BlocoPosicao({
  place,
  online,
  onGravar,
}: {
  place: Place;
  online: boolean;
  onGravar: (patch: Partial<Place>) => void;
}) {
  const { t } = useLang();
  const [buscando, setBuscando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const coords = place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;
  const link = linkDoMapa(place);

  function aquiAgora() {
    setRecado(null);
    if (!navigator.geolocation) {
      setRecado(t("places.geoUnsupported"));
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onGravar({ ...coords, maps_url: mapsUrlDeCoords(coords) });
      },
      (err) => {
        setBuscando(false);
        /* Os tres erros do navegador viram tres recados diferentes: "nao deu
           certo" nao diz se falta permissao ou falta sinal, e sao consertos
           completamente diferentes. */
        setRecado(
          t(
            err.code === err.PERMISSION_DENIED
              ? "places.geoDenied"
              : err.code === err.TIMEOUT
                ? "places.geoTimeout"
                : "places.geoUnavailable",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function colouLink(url: string) {
    setRecado(null);
    const limpo = url.trim();
    if (!limpo) {
      onGravar({ maps_url: null });
      return;
    }
    const coords = coordsDeMapsUrl(limpo);
    if (coords) {
      onGravar({ maps_url: limpo, ...coords });
      return;
    }
    /* O link e guardado mesmo assim: ele abre o Maps com um toque, que e o uso
       do dia a dia. So a coordenada nao veio junto — e a tela diz isso, em vez
       de fingir que veio. */
    onGravar({ maps_url: limpo });
    setRecado(t("places.mapsUrlNoCoords"));
  }

  return (
    <div className="space-y-2 rounded-2xl bg-black/5 p-3">
      <p className="text-xs font-semibold text-ink-muted">🗺️ {t("places.position")}</p>

      <p className="text-sm">{coords ? formatarCoords(coords) : t("places.noPosition")}</p>

      <TileButton
        emoji="🎯"
        label={buscando ? t("places.locating") : t("places.useMyLocation")}
        variant="outline"
        disabled={!online || buscando}
        onClick={aquiAgora}
      />

      {/* O link tem estado proprio, nao do `place`: ele so vale inteiro, e
          validar a cada tecla acusaria "sem coordenada" no meio da colagem.
          Grava no blur. */}
      <CampoLink
        label={t("places.mapsUrlPlaceholder")}
        inicial={place.maps_url ?? ""}
        disabled={!online}
        onCommit={colouLink}
      />

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand font-semibold text-brand"
        >
          <span className="text-2xl leading-none">🗺️</span>
          <span>{t("places.openInMaps")}</span>
        </a>
      )}

      {recado && <p className="text-xs leading-relaxed text-amber-800">{recado}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A folha do evento                                                   */
/* ------------------------------------------------------------------ */

function FolhaDoEvento({
  ev,
  places,
  online,
  onClose,
  onCampo,
  onGravar,
}: {
  ev: SunbiteEvent;
  places: Place[];
  online: boolean;
  onClose: () => void;
  onCampo: (patch: Partial<SunbiteEvent>) => void;
  onGravar: (patch: Partial<SunbiteEvent>) => void;
}) {
  const { t, lang } = useLang();
  const place = places.find((p) => p.id === ev.place_id) ?? null;
  const linkMapa = place ? linkDoMapa(place) : null;
  const ultima = useUltimaVez(ev.place_id);

  return (
    <Modal title={new Date(ev.starts_at).toLocaleString()} onClose={onClose}>
      {/* Data, local e observacoes nao eram editaveis depois de criado o
          evento — so os rotulos, o tipo e o publico/privado. */}
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-ink-muted">🕐 {t("places.startsAtPlaceholder")}</label>
        <input
          type="datetime-local"
          value={paraCampoDataHora(ev.starts_at)}
          disabled={!online}
          onChange={(e) => {
            const d = new Date(e.target.value);
            if (!Number.isNaN(d.getTime())) onGravar({ starts_at: d.toISOString() });
          }}
          className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-semibold text-ink-muted">📍 {t("places.tabPlaces")}</label>
        <select
          value={ev.place_id ?? ""}
          disabled={!online}
          onChange={(e) => onGravar({ place_id: e.target.value || null })}
          className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
        >
          <option value="">{t("places.noPlace")}</option>
          {places.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.name}
            </option>
          ))}
        </select>
      </div>

      {linkMapa && (
        <a
          href={linkMapa}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand font-semibold text-brand"
        >
          <span className="text-2xl leading-none">🗺️</span>
          <span>{t("places.openInMaps")}</span>
        </a>
      )}

      <Campo
        emoji="🇬🇧"
        label={t("places.labelEnPlaceholder")}
        value={ev.label_en ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ label_en: v })}
        onCommit={(v) => onGravar({ label_en: v || null })}
      />
      <Campo
        emoji="🇩🇪"
        label={t("places.labelDePlaceholder")}
        value={ev.label_de ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ label_de: v })}
        onCommit={(v) => onGravar({ label_de: v || null })}
      />
      <Campo
        emoji="📝"
        label={t("places.notesPlaceholder")}
        value={ev.notes ?? ""}
        disabled={!online}
        onChange={(v) => onCampo({ notes: v })}
        onCommit={(v) => onGravar({ notes: v || null })}
      />

      <SegmentedPicker
        options={EVENT_TYPES.map((et) => ({ ...et, label: t(`places.eventType.${et.value}`) }))}
        value={ev.event_type ?? "market"}
        disabled={!online}
        onChange={(v) => onGravar({ event_type: v })}
      />

      <TileButton
        emoji={ev.is_public ? "🙈" : "📣"}
        label={ev.is_public ? t("places.makePrivate") : t("places.makePublic")}
        variant="outline"
        disabled={!online}
        onClick={() => onGravar({ is_public: !ev.is_public })}
      />

      <a
        href={googleCalendarUrl(ev, lang, place)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 w-full items-center justify-center rounded-2xl border-2 border-brand py-3 text-center font-semibold text-brand"
      >
        {t("operation.addToCalendar")}
      </a>

      {ultima && (
        <div className="rounded-2xl bg-black/5 p-3">
          <p className="text-xs font-semibold text-ink-muted">📊 {t("places.lastTimeHere")}</p>
          <p className="text-sm">
            {new Date(ultima.data).toLocaleDateString()} · {t("places.cups", { n: ultima.copos })} ·{" "}
            {money(ultima.total)}
          </p>
        </div>
      )}

      {!online && <p className="text-xs text-ink-muted">{t("places.needsInternet")}</p>}
    </Modal>
  );
}

/**
 * O resultado da ultima vez naquele local: a operacao fechada mais recente
 * com aquele `place_id`, e as vendas nao canceladas dela.
 *
 * Duas consultas simples, so quando a folha abre. Le `sales` com a sessao de
 * quem perguntou — `sales_read_auth` (docs/supabase.sql) permite, e o caminho
 * anonimo da venda continua sem ler nada.
 */
function useUltimaVez(placeId: string | null): UltimaVez | null {
  const [ultima, setUltima] = useState<UltimaVez | null>(null);

  useEffect(() => {
    let vivo = true;
    setUltima(null);
    if (!placeId) return;

    void (async () => {
      try {
        const supabase = await getSupabase();
        const { data: ops } = await supabase
          .from("operations")
          .select("id,local_date")
          .eq("place_id", placeId)
          .eq("status", "closed")
          .order("local_date", { ascending: false })
          .limit(1);
        const op = (ops as { id: string; local_date: string }[] | null)?.[0];
        if (!op || !vivo) return;

        const { data: vendas } = await supabase
          .from("sales")
          .select("cup_count,total,cancelled")
          .eq("operation_id", op.id);
        const linhas = (vendas as { cup_count: number; total: number; cancelled: boolean }[] | null) ?? [];
        const validas = linhas.filter((v) => !v.cancelled);
        if (!vivo || validas.length === 0) return;

        setUltima({
          data: op.local_date,
          copos: validas.reduce((s, v) => s + v.cup_count, 0),
          total: validas.reduce((s, v) => s + Number(v.total), 0),
        });
      } catch {
        // Offline ou sem sessao: a linha simplesmente nao aparece.
      }
    })();

    return () => {
      vivo = false;
    };
  }, [placeId]);

  return ultima;
}

/* ------------------------------------------------------------------ */

/**
 * Campo de estado proprio, para o link do Maps. `Campo` e controlado pelo
 * `place`, e um link colado precisa aparecer na tela antes de virar
 * coordenada — senao a colagem some e parece que nao funcionou.
 */
function CampoLink({
  label,
  inicial,
  disabled,
  onCommit,
}: {
  label: string;
  inicial: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [texto, setTexto] = useState(inicial);

  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted">🔗 {label}</label>
      <input
        value={texto}
        disabled={disabled}
        inputMode="url"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
      />
    </div>
  );
}

function Campo({
  emoji,
  label,
  value,
  disabled,
  inputMode,
  onChange,
  onCommit,
}: {
  emoji: string;
  label: string;
  value: string;
  disabled?: boolean;
  inputMode?: "decimal";
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted">
        {emoji} {label}
      </label>
      <input
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
      />
    </div>
  );
}
