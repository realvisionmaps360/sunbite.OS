import { useEffect, useRef, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { approve, parseMessage, reject, type AISuggestion } from "../ai";
import { startListening, voiceSupported, type VoiceSession } from "../voice";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, StatusPill } from "./ui";

/**
 * Tela de entrada por conversa com IA (Etapa 9).
 *
 * O Felipe fala ou digita uma frase; a IA devolve cards; ele aprova ou
 * rejeita um a um. Card rejeitado nunca vira dado.
 *
 * Exige sessao e internet, como Compras/Financeiro desde a Etapa 7 — nao ha
 * fila offline nesta etapa (decisao do Felipe, 25/08).
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

function AIBody({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"text" | "voice">("text");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [cards, setCards] = useState<AISuggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const online = navigator.onLine;

  // Se a tela fechar no meio da gravacao, o microfone precisa parar junto.
  useEffect(() => () => sessionRef.current?.stop(), []);

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

  async function analisar() {
    if (!texto.trim() || thinking) return;
    sessionRef.current?.stop();
    setThinking(true);
    setErro(null);
    try {
      const novos = await parseMessage(texto.trim(), modo);
      setCards(novos);
      if (novos.length === 0) setErro(t("ai.nothingFound"));
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setThinking(false);
    }
  }

  async function decidir(card: AISuggestion, aceitar: boolean) {
    setBusy(card.id);
    setErro(null);
    try {
      if (aceitar) await approve(card);
      else await reject(card);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  function limpar() {
    sessionRef.current?.stop();
    setTexto("");
    setCards([]);
    setErro(null);
    setModo("text");
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("ai.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("ai.needsInternet")}
        </p>
      )}

      <div className="flex-1 space-y-3 p-4">
        {/* Entrada: digitar ou ditar. A transcricao cai aqui, editavel. */}
        <Card>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            disabled={thinking}
            placeholder={t("ai.placeholder")}
            className="w-full resize-none rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-base disabled:opacity-40"
          />

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
              onClick={() => void analisar()}
              disabled={!texto.trim() || thinking || !online}
              className="flex-1 rounded-2xl bg-brand-dark px-4 py-3 font-display text-lg text-cream transition active:scale-[0.98] disabled:opacity-40"
            >
              {thinking ? t("ai.thinking") : `✨ ${t("ai.analyze")}`}
            </button>
          </div>

          {(texto || cards.length > 0) && !thinking && (
            <button onClick={limpar} className="w-full rounded-xl border border-black/20 px-4 py-2 text-sm">
              {t("ai.clear")}
            </button>
          )}

          {listening && (
            <p className="text-center text-sm text-ink-muted">🔴 {t("ai.listening")}</p>
          )}
        </Card>

        {erro && (
          <Card>
            <p className="text-sm text-red-700">{erro}</p>
          </Card>
        )}

        {/* Os cards propostos. Nada aqui foi gravado ainda. */}
        {cards.length > 0 && (
          <p className="px-1 pt-2 font-display text-lg text-brand-dark">
            {t("ai.proposals")} ({cards.length})
          </p>
        )}

        {cards.map((card) => {
          const meta = TABLE_LABEL[card.target_table] ?? { emoji: "•", key: "ai.title" };
          return (
            <Card key={card.id}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="neutral">
                  {meta.emoji} {t(meta.key)}
                </StatusPill>
                {card.uncertain && <StatusPill tone="warn">⚠️ {t("ai.uncertain")}</StatusPill>}
              </div>

              <p className="font-display text-lg leading-tight">{card.summary}</p>

              {/* O detalhe cru do que vai ser gravado. Feio de proposito: e
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

              <div className="flex gap-2">
                <button
                  onClick={() => void decidir(card, true)}
                  disabled={busy === card.id || !online}
                  className="flex-1 whitespace-nowrap rounded-2xl bg-brand px-3 py-3 font-display text-base text-cream transition active:scale-[0.98] disabled:opacity-40"
                >
                  ✓ {t("ai.approve")}
                </button>
                <button
                  onClick={() => void decidir(card, false)}
                  disabled={busy === card.id}
                  className="flex-1 whitespace-nowrap rounded-2xl border border-black/20 px-3 py-3 font-display text-base transition active:scale-[0.98] disabled:opacity-40"
                >
                  ✕ {t("ai.reject")}
                </button>
              </div>
            </Card>
          );
        })}

        {cards.length === 0 && !thinking && !erro && !texto && (
          <EmptyState emoji="🤖" text={t("ai.empty")} />
        )}
      </div>
    </div>
  );
}
