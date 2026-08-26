import { useEffect, useRef, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { approve, fetchHistory, reject, sendMessage, type AISuggestion, type AITurn } from "../ai";
import { startListening, voiceSupported, type VoiceSession } from "../voice";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, StatusPill } from "./ui";

/**
 * Chat da Sunbite IA (Fatia 6 do plano V2).
 *
 * Ate a Fatia 6 esta tela so mostrava cards de uma pergunta por vez, sem
 * historico. Agora le `ai_messages` e vira conversa de verdade: pergunta,
 * resposta em texto (quando houve) e os cards daquela mensagem, um turno
 * atras do outro.
 *
 * Exige sessao e internet, como Compras/Financeiro desde a Etapa 7 — nao ha
 * fila offline aqui (decisao do Felipe, 25/08).
 */
export default function AIScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <AIBody onClose={onClose} />;
}

/** Rotulo curto por tabela, para a pessoa saber o que o card mexe. */
const TABLE_LABEL: Record<string, { emoji: string; key: string }> = {
  stock_movements: { emoji: "📦", key: "home.stock" },
  purchases: { emoji: "🛒", key: "home.purchases" },
  expenses: { emoji: "💰", key: "home.finance" },
  pendencies: { emoji: "📌", key: "ai.pendency" },
  equipment: { emoji: "🔧", key: "home.equipment" },
  suppliers: { emoji: "🏭", key: "home.suppliers" },
  prices: { emoji: "🏷️", key: "ai.price" },
  places: { emoji: "📍", key: "home.places" },
  events: { emoji: "📅", key: "ai.event" },
};

/**
 * Nome de coluna nao e nome de gente. Este mapa e o que faz o card servir
 * para conferir: e aqui que da para pegar um numero errado antes de aprovar.
 */
const FIELD_LABEL: Record<string, string> = {
  stock_item_name: "Item", quantity_delta: "Quantidade", reason: "Motivo", notes: "Obs.",
  supplier_name: "Fornecedor", purchased_at: "Data", total: "Total", itens: "Itens",
  type: "Tipo", category: "Categoria", description: "Descricao", value: "Valor", occurred_at: "Data",
  critical: "Critico", origin: "Origem",
  name: "Nome", status: "Estado", product: "Produto", contact: "Contato",
  item_key: "Item", city: "Cidade", fee: "Taxa", rating: "Nota",
  place_name: "Local", starts_at: "Quando", label_en: "Titulo (EN)", label_de: "Titel (DE)",
  is_public: "No site",
};

function fmt(v: unknown): string {
  if (typeof v === "boolean") return v ? "sim" : "nao";
  return String(v);
}

/** Uma linha por item da compra, em vez do array cru em JSON. */
function ItemLines({ itens }: { itens: any[] }) {
  return (
    <div className="space-y-0.5">
      {itens.map((it, i) => (
        <p key={i} className="break-words">
          {[
            it?.quantidade != null ? `${it.quantidade}x` : null,
            it?.descricao ?? it?.stock_item_name,
            it?.custo_unitario != null ? `— CHF ${it.custo_unitario}` : null,
          ].filter(Boolean).join(" ")}
        </p>
      ))}
    </div>
  );
}

/** Um card de proposta. Sem sessao/online, so mostra o estado — nada de
 * decidir agora. Ja decidido (aplicado/rejeitado), mostra o resultado. */
function SuggestionCard({
  card, t, online, busy, onDecide,
}: {
  card: AISuggestion; t: (k: string) => string; online: boolean;
  busy: boolean; onDecide: (aceitar: boolean) => void;
}) {
  const meta = TABLE_LABEL[card.target_table] ?? { emoji: "•", key: "ai.title" };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="neutral">
          {meta.emoji} {t(meta.key)}
        </StatusPill>
        {card.uncertain && <StatusPill tone="warn">⚠️ {t("ai.uncertain")}</StatusPill>}
        {card.status === "applied" && <StatusPill tone="ok">✓ {t("ai.statusApplied")}</StatusPill>}
        {card.status === "rejected" && <StatusPill tone="neutral">✕ {t("ai.statusRejected")}</StatusPill>}
      </div>

      <p className="font-display text-lg leading-tight">{card.summary}</p>

      {/* O detalhe cru do que vai ser (ou foi) gravado. Feio de proposito: e
          aqui que da para pegar um numero errado antes de aprovar. */}
      <dl className="space-y-0.5 rounded-lg bg-black/5 px-3 py-2 text-xs">
        {Object.entries(card.payload).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 font-semibold text-ink-muted">{FIELD_LABEL[k] ?? k}</dt>
            <dd className="min-w-0 break-words">
              {k === "itens" && Array.isArray(v) ? <ItemLines itens={v} /> : fmt(v)}
            </dd>
          </div>
        ))}
      </dl>

      {card.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => onDecide(true)}
            disabled={busy || !online}
            className="flex-1 whitespace-nowrap rounded-2xl bg-brand px-3 py-3 font-display text-base text-cream transition active:scale-[0.98] disabled:opacity-40"
          >
            ✓ {t("ai.approve")}
          </button>
          <button
            onClick={() => onDecide(false)}
            disabled={busy}
            className="flex-1 whitespace-nowrap rounded-2xl border border-black/20 px-3 py-3 font-display text-base transition active:scale-[0.98] disabled:opacity-40"
          >
            ✕ {t("ai.reject")}
          </button>
        </div>
      )}
    </Card>
  );
}

function AIBody({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"text" | "voice">("text");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [turns, setTurns] = useState<AITurn[]>([]);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const online = navigator.onLine;

  useEffect(() => {
    let ativo = true;
    fetchHistory()
      .then((h) => { if (ativo) setTurns(h); })
      .catch((e) => { if (ativo) setErro(e?.message ?? String(e)); })
      .finally(() => { if (ativo) setLoadingHistory(false); });
    return () => { ativo = false; };
  }, []);

  // Se a tela fechar no meio da gravacao, o microfone precisa parar junto.
  useEffect(() => () => sessionRef.current?.stop(), []);

  // Rola para o fim a cada turno novo — e como chat de verdade se comporta.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns.length, thinking]);

  function toggleVoice() {
    if (listening) {
      sessionRef.current?.stop();
      return;
    }
    setErro(null);
    const s = startListening({
      lang: lang === "de" ? "de-CH" : "pt-BR",
      onText: (text) => setTexto(text),
      onDone: (err) => {
        setListening(false);
        sessionRef.current = null;
        if (err) setErro(t("ai.voiceError"));
      },
    });
    if (!s) {
      setErro(t("ai.voiceError"));
      return;
    }
    sessionRef.current = s;
    setModo("voice");
    setListening(true);
  }

  async function enviar() {
    if (!texto.trim() || thinking) return;
    sessionRef.current?.stop();
    const pergunta = texto.trim();
    setTexto("");
    setThinking(true);
    setErro(null);
    try {
      const { replyText, cards } = await sendMessage(pergunta, modo, lang);
      setTurns((prev) => [
        ...prev,
        {
          id: cards[0]?.message_id ?? `local-${Date.now()}`,
          input_text: pergunta,
          reply_text: replyText,
          error: null,
          created_at: new Date().toISOString(),
          cards,
        },
      ]);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
      setTexto(pergunta); // devolve o texto — nao fez sentido some-lo se falhou
    } finally {
      setThinking(false);
      setModo("text");
    }
  }

  async function decidir(turnId: string, card: AISuggestion, aceitar: boolean) {
    setBusyCard(card.id);
    setErro(null);
    try {
      if (aceitar) await approve(card);
      else await reject(card);
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id !== turnId
            ? turn
            : {
                ...turn,
                cards: turn.cards.map((c) =>
                  c.id === card.id ? { ...c, status: aceitar ? "applied" : "rejected" } : c,
                ),
              },
        ),
      );
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setBusyCard(null);
    }
  }

  return (
    <div className="tela-sobreposta z-20 flex flex-col bg-cream-soft">
      <AdminHeader title={t("ai.title")} onClose={onClose} />

      {!online && (
        <p className="shrink-0 bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("ai.needsInternet")}
        </p>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadingHistory && <p className="text-center text-sm text-ink-muted">{t("ai.historyLoading")}</p>}

        {!loadingHistory && turns.length === 0 && (
          <EmptyState emoji="🤖" text={t("ai.empty")} />
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            {/* Pergunta: bolha a direita, como quem escreveu. */}
            <div className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-brand-dark px-4 py-2 text-cream">
                {turn.input_text}
              </p>
            </div>

            {/* Resposta em texto, quando houve. */}
            {turn.reply_text && (
              <div className="flex justify-start">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-cream px-4 py-2 shadow-sm">
                  {turn.reply_text}
                </p>
              </div>
            )}

            {turn.error && (
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-red-50 px-4 py-2 text-sm text-red-700">
                  {turn.error}
                </p>
              </div>
            )}

            {turn.cards.map((card) => (
              <SuggestionCard
                key={card.id}
                card={card}
                t={t}
                online={online}
                busy={busyCard === card.id}
                onDecide={(aceitar) => void decidir(turn.id, card, aceitar)}
              />
            ))}
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-sm bg-cream px-4 py-2 text-ink-muted shadow-sm">
              {t("ai.thinking")}
            </p>
          </div>
        )}

        {erro && (
          <Card>
            <p className="text-sm text-red-700">{erro}</p>
          </Card>
        )}
      </div>

      {/* Entrada: digitar ou ditar, fixa embaixo — como chat de verdade. */}
      <div className="shrink-0 space-y-2 border-t border-black/10 bg-cream-soft p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          disabled={thinking}
          placeholder={t("ai.placeholder")}
          className="w-full resize-none rounded-lg border border-black/10 bg-cream px-3 py-2 text-base disabled:opacity-40"
        />

        {listening && (
          <p className="text-center text-sm text-ink-muted">🔴 {t("ai.listening")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {voiceSupported() && (
            <button
              onClick={toggleVoice}
              disabled={thinking || !online}
              className={`flex-1 rounded-2xl px-4 py-3 font-display text-lg transition active:scale-[0.98] disabled:opacity-40 ${
                listening ? "bg-red-600 text-white" : "bg-brand text-cream"
              }`}
            >
              {listening ? `⏹ ${t("ai.stopRecording")}` : `🎙️ ${t("ai.record")}`}
            </button>
          )}
          <button
            onClick={() => void enviar()}
            disabled={!texto.trim() || thinking || !online}
            className="flex-1 rounded-2xl bg-brand-dark px-4 py-3 font-display text-lg text-cream transition active:scale-[0.98] disabled:opacity-40"
          >
            {thinking ? t("ai.thinking") : `✨ ${t("ai.send")}`}
          </button>
        </div>
      </div>
    </div>
  );
}
