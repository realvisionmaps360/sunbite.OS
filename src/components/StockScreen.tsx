import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { deviceId } from "../db";
import { useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import { getSupabase } from "../supabase";
import type { StockMovement, StockMovementReason, StockStatus } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, Explain, Linha, SegmentedPicker, StatusPill, TileButton } from "./ui";

const REASONS: { value: StockMovementReason; emoji: string }[] = [
  { value: "compra", emoji: "🛒" },
  { value: "uso", emoji: "🔧" },
  { value: "ajuste", emoji: "⚖️" },
  { value: "perda", emoji: "📉" },
];

/** Arredonda para grama / unidade antes de comparar e de mostrar. */
const g = (n: number) => Math.round(n * 1000) / 1000;

/** Numero limpo: 1.5 vira "1.5", 1.000 vira "1", 0.156 vira "0.156". */
const num = (n: number) => String(g(n));

/**
 * Tela de Estoque (Etapa 7, reescrita na Fatia 5 da V2) — exige sessao.
 *
 * O item em si (nome/unidade/limite) e "sentado com wifi", mas registrar um
 * MOVIMENTO e tocado em pe na barraca — por isso e a unica tabela desta etapa
 * com fila offline (`outbox.ts`).
 *
 * A Fatia 5 mudou o que a tela mostra. Antes era um numero so, `quantity`,
 * mantido pelo gatilho `apply_stock_movement` a partir dos movimentos. Agora
 * a tela le `v_stock_status`, que faz a conta do PRD V2 secao 8:
 *
 *   calculado = entradas (o total dos movimentos) − consumo derivado das
 *               vendas que ja subiram
 *
 * **O app nao baixa estoque a cada venda**, e isso e decisao: gravar
 * movimento exige sessao e a venda nao pode depender de login (decisao 1), e
 * venda que sincroniza duas vezes descontaria duas vezes. O consumo mora numa
 * view no banco, como o gatilho — a conta se corrige sozinha quando uma venda
 * offline sobe.
 *
 * Consequencia que quem mexer aqui precisa saber: o motivo **"uso" nao serve
 * para copo vendido**. Baixar a mao o que a venda ja desconta faz a mesma
 * coisa sair duas vezes. "uso" e para o que se gasta fora da venda.
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
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockStatus[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [reason, setReason] = useState<StockMovementReason>("compra");
  const [qty, setQty] = useState("");
  const [countingId, setCountingId] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("v_stock_status").select("*").order("name");
      if (data) setItems(data as StockStatus[]);
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
      await supabase.from("stock_items").insert({ name: newName.trim(), unit: newUnit.trim() });
      setNewName("");
      setNewUnit("");
      setAdding(false);
      void load();
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  /** Grava um movimento e adianta o efeito na tela; o gatilho confirma depois. */
  async function gravar(item: StockStatus, delta: number, mot: StockMovementReason, notes: string | null) {
    const row: StockMovement = {
      id: crypto.randomUUID(),
      stock_item_id: item.id,
      quantity_delta: delta,
      reason: mot,
      operation_id: null,
      notes,
      created_by: identity.userId,
      device_id: deviceId(),
      created_at: new Date().toISOString(),
    };
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? {
              ...x,
              entradas: x.entradas + delta,
              calculado: x.calculado + delta,
              copos_restantes:
                x.por_copo && x.por_copo > 0
                  ? Math.floor((x.calculado + delta) / x.por_copo)
                  : x.copos_restantes,
            }
          : x,
      ),
    );
    await queueWrite("stock_movements", row);
  }

  async function registerMovement(item: StockStatus) {
    const n = Number(qty);
    if (!n) return;
    const delta = reason === "uso" || reason === "perda" ? -Math.abs(n) : Math.abs(n);
    setMovingId(null);
    setQty("");
    await gravar(item, delta, reason, null);
  }

  /**
   * "Contei": a contagem fisica **nao** sobrescreve o numero. Ela vira um
   * movimento de `ajuste` com a diferenca — o que faltou ou sobrou fica no
   * historico, com data e quem contou. Depois disso o calculado passa a bater
   * com o que esta na caixa.
   */
  async function saveCount(item: StockStatus) {
    const n = Number(counted);
    if (!Number.isFinite(n) || counted.trim() === "") return;
    const delta = g(n - item.calculado);
    setCountingId(null);
    setCounted("");
    if (delta === 0) return; // Bateu: nada a corrigir, nada a registrar.
    await gravar(item, delta, "ajuste", `Contagem fisica: ${num(n)} ${item.unit}.`);
  }

  const diferenca = (item: StockStatus) => {
    const n = Number(counted);
    if (counted.trim() === "" || !Number.isFinite(n)) return null;
    return g(n - item.calculado);
  };

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
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
            const low = item.low_stock_threshold != null && item.calculado <= item.low_stock_threshold;
            const dif = countingId === item.id ? diferenca(item) : null;
            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex-1 font-display text-lg leading-tight">{item.name}</p>
                  {low && <StatusPill tone="danger">{t("stock.lowStockWarning")}</StatusPill>}
                </div>

                <div>
                  <p className="font-display text-4xl tabular-nums text-brand">
                    {num(item.calculado)} <span className="text-xl text-ink-muted">{item.unit}</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {t("stock.calculated")}
                    <Explain topic="calculado" />
                  </p>
                </div>

                {/* O rendimento em copos — a resposta a pergunta "quantos copos
                    ainda dao?" (PRD V2 8.1). So aparece para item da ficha.
                    Numero negativo nao vira "-12 copos": item que nunca teve
                    compra registrada fica negativo de verdade (a venda desconta,
                    a entrada nunca aconteceu), e ai o que a tela precisa dizer e
                    que falta lancar a compra, nao um rendimento impossivel. */}
                {item.por_copo != null &&
                  (item.copos_restantes != null && item.copos_restantes > 0 ? (
                    <p className="rounded-xl bg-cream-soft px-3 py-2 text-sm font-semibold text-brand-dark">
                      {t("stock.yield", { cups: String(item.copos_restantes) })}
                    </p>
                  ) : (
                    <p className="rounded-xl bg-red-700/10 px-3 py-2 text-sm font-semibold text-red-800">
                      {t("stock.noneLeft")}
                    </p>
                  ))}

                <div className="space-y-1">
                  <Linha label={t("stock.entries")} value={`${num(item.entradas)} ${item.unit}`} />
                  <Linha
                    label={t("stock.consumed")}
                    value={`− ${num(item.consumido)} ${item.unit}`}
                    explain="consumoDerivado"
                  />
                  {item.por_copo != null && (
                    <Linha
                      label={t("stock.perCup")}
                      value={`${num(item.por_copo)} ${item.unit}`}
                    />
                  )}
                </div>

                {item.ultima_contagem && (
                  <p className="text-xs text-ink-muted">
                    {t("stock.lastCount", {
                      date: new Date(item.ultima_contagem).toLocaleDateString(
                        lang === "de" ? "de-CH" : "pt-BR",
                      ),
                    })}
                  </p>
                )}

                {countingId === item.id ? (
                  <div className="space-y-3 rounded-xl bg-cream-soft p-3">
                    <label className="block text-sm font-semibold">
                      {t("stock.countedLabel", { unit: item.unit })}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-cream px-3 py-3 text-xl tabular-nums"
                    />
                    {dif !== null && (
                      <Linha
                        label={t("stock.difference")}
                        value={`${dif > 0 ? "+" : ""}${num(dif)} ${item.unit}`}
                        destaque={dif !== 0}
                        explain="diferencaEstoque"
                      />
                    )}
                    <div className="flex gap-2">
                      <TileButton
                        emoji="✓"
                        label={t("stock.countSave")}
                        onClick={() => void saveCount(item)}
                        disabled={counted.trim() === ""}
                      />
                      <button onClick={() => setCountingId(null)} className="rounded-2xl border border-black/20 px-4">
                        ×
                      </button>
                    </div>
                  </div>
                ) : movingId === item.id ? (
                  <div className="space-y-3 rounded-xl bg-cream-soft p-3">
                    <SegmentedPicker
                      options={REASONS.map((r) => ({ ...r, label: t(`stock.reason.${r.value}`) }))}
                      value={reason}
                      onChange={setReason}
                    />
                    {reason === "uso" && (
                      <p className="text-xs text-ink-muted">{t("stock.useNote")}</p>
                    )}
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
                  <div className="flex gap-2">
                    <TileButton
                      emoji="🔢"
                      label={t("stock.count")}
                      onClick={() => {
                        setMovingId(null);
                        setCountingId(item.id);
                        setCounted("");
                      }}
                    />
                    <TileButton
                      emoji="📝"
                      label={t("stock.registerMovement")}
                      variant="outline"
                      onClick={() => {
                        setCountingId(null);
                        setMovingId(item.id);
                        setQty("");
                      }}
                    />
                  </div>
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
