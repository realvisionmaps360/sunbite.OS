import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Equipment, EquipmentStatus } from "../types";
import LoginScreen from "./LoginScreen";
import {
  AdminHeader,
  Card,
  CardToggle,
  EmptyState,
  Modal,
  SegmentedPicker,
  StatusPill,
  TileButton,
} from "./ui";

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
  /** Id do equipamento aberto na folha de detalhe (notas + marcador critico). */
  const [detalhe, setDetalhe] = useState<string | null>(null);
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

  const aberto = items.find((x) => x.id === detalhe) ?? null;

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-brand">
      <AdminHeader title={t("equipment.title")} onClose={onClose} />

      {/* O aviso era `bg-black/10 text-brand-dark`. Sobre o fundo `bg-brand`
          isso vira vermelho escuro sobre vermelho — a mesma armadilha que o
          `Aviso` ja tinha resolvido virando creme. */}
      {!online && (
        <p className="mx-4 mt-4 rounded-2xl bg-cream px-4 py-2 text-center text-sm font-semibold text-brand-dark">
          {t("equipment.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-cream/80">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-2 p-4">
          {items.length === 0 && <EmptyState emoji="🔧" text={t("equipment.empty")} />}

          {items.map((eq) => (
            <EquipmentCard
              key={eq.id}
              eq={eq}
              online={online}
              onStatus={(v) => void updateItem(eq.id, { status: v })}
              onDetalhe={() => setDetalhe(eq.id)}
            />
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
                <button
                  onClick={() => setAdding(false)}
                  aria-label="×"
                  className="min-h-11 min-w-11 rounded-2xl border border-black/20 px-4"
                >
                  ×
                </button>
              </div>
            </Card>
          ) : (
            /* O botao tracejado e `border-brand/40 text-brand`: sobre o fundo
               `bg-brand` ele sumiria. Fica dentro de um Card creme, que e o
               fundo para o qual ele foi desenhado. */
            <Card>
              <TileButton emoji="➕" label={t("equipment.add")} variant="dashed" onClick={() => setAdding(true)} disabled={!online} />
            </Card>
          )}
        </div>
      )}

      {aberto && (
        <Modal title={aberto.name} onClose={() => setDetalhe(null)}>
          {/* Aqui o picker vem com rotulo: e a folha que ensina o que cada
              emoji do card quer dizer, e tem largura de sobra para o alemao. */}
          <SegmentedPicker
            options={STATUSES.map((s) => ({ ...s, label: t(`equipment.status.${s.value}`) }))}
            value={aberto.status}
            disabled={!online}
            onChange={(v) => void updateItem(aberto.id, { status: v })}
          />

          <CardToggle
            icone={<span className="text-3xl leading-none">⚠️</span>}
            label={t("checklist.critical")}
            marcado={aberto.critical}
            onClick={() => {
              if (!online) return;
              void updateItem(aberto.id, { critical: !aberto.critical });
            }}
          />

          <textarea
            value={aberto.notes ?? ""}
            disabled={!online}
            rows={3}
            placeholder={t("equipment.notesPlaceholder")}
            onChange={(e) =>
              setItems((prev) => prev.map((x) => (x.id === aberto.id ? { ...x, notes: e.target.value } : x)))
            }
            onBlur={(e) => void updateItem(aberto.id, { notes: e.target.value })}
            className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * O card compacto (Parte 3C). O card antigo tinha 230px porque mantinha tres
 * controles **sempre abertos**: o SegmentedPicker de 4 status quebrando em duas
 * linhas (~80px), o checkbox de critico e o campo de notas. Cabiam 3 por tela.
 *
 * ⚠️ A regra que nao pode ser quebrada: **trocar o status continua a um toque**.
 * O que saiu do card foi o rotulo dos botoes, nao o botao. Os quatro status
 * viram uma fileira de emoji de 44px, e o nome do status atual continua escrito
 * em texto na `StatusPill` do topo — ninguem precisa adivinhar o emoji.
 *
 * Notas e o marcador de critico, esses sim, foram para tras de um toque (o
 * botao "…" na propria fileira, entao nao custa altura nenhuma). Sao coisas de
 * cadastro, nao do momento em que se olha para o equipamento e diz "esse esta
 * quebrado".
 *
 * Altura: p-3 (24) + linha do nome (24) + space-y-2 (8) + fileira h-11 (44)
 * = **100px**. Com nota escrita, a nota entra como linha propria.
 */
function EquipmentCard({
  eq,
  online,
  onStatus,
  onDetalhe,
}: {
  eq: Equipment;
  online: boolean;
  onStatus: (v: EquipmentStatus) => void;
  onDetalhe: () => void;
}) {
  const { t } = useLang();
  const nota = eq.notes?.trim();

  return (
    <div className="space-y-2 rounded-3xl bg-cream p-3 shadow-lg">
      <div className="flex items-center gap-2">
        {/* `break-words`, nunca `truncate`: o pior caso e sempre o alemao, e
            "Kuehlschrankbatterie" tem 19 letras. Nome de equipamento cortado e
            defeito — mesma familia do rotulo do checklist na ops 15. */}
        <p className="min-w-0 flex-1 break-words font-display text-base leading-tight text-brand-dark">
          {eq.name}
        </p>
        {eq.critical && <StatusPill tone="danger">{t("checklist.critical")}</StatusPill>}
        <StatusPill tone={STATUS_TONE[eq.status]}>{t(`equipment.status.${eq.status}`)}</StatusPill>
      </div>

      {nota && <p className="break-words text-sm leading-snug text-ink-muted">{nota}</p>}

      <div className="flex items-stretch gap-2">
        {STATUSES.map((s) => {
          const ativo = s.value === eq.status;
          return (
            <button
              key={s.value}
              onClick={() => onStatus(s.value)}
              disabled={!online}
              aria-pressed={ativo}
              aria-label={t(`equipment.status.${s.value}`)}
              className={`h-11 min-w-11 flex-1 rounded-2xl text-xl leading-none transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 ${
                ativo ? "bg-brand text-cream shadow-inner" : "bg-cream-soft"
              }`}
            >
              {s.emoji}
            </button>
          );
        })}

        {/* Notas e critico moram atras deste toque. O botao divide a fileira com
            os status, entao a compactacao nao custou altura nem um toque a
            mais na acao principal. */}
        <button
          onClick={onDetalhe}
          aria-label={t("equipment.details")}
          className="ml-1 h-11 min-w-11 rounded-2xl border border-black/15 text-xl leading-none text-ink-muted transition active:scale-[0.97]"
        >
          {nota ? "📝" : "…"}
        </button>
      </div>
    </div>
  );
}
