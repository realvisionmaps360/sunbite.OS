import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLang } from "../i18n";
import {
  PRESENCA_EVENTO,
  apagarPar,
  codigoValido,
  gravarPar,
  gravarVitrine,
  lerPar,
  lerVitrine,
  paineis,
  presencaDoDisplay,
  type Vitrine,
} from "../display/protocol";
import { AdminHeader, Card, TileButton } from "./ui";

/**
 * Tela do Customer Display — parear o iPad e mandar no que ele mostra
 * quando ninguem esta comprando.
 *
 * ⚠️ Esta tela **nao fala com o Supabase**. Ela so escreve no `localStorage`;
 * quem abre canal e o `display/emit.ts`, carregado por `App.tsx` sob demanda.
 * E por isso que ela pode ser importada direto pelos Ajustes sem arrastar o
 * client do Supabase para dentro do caminho da venda.
 *
 * A bolinha ao vivo respeita esse isolamento: quem sabe da presenca e o canal
 * que o `App.tsx` **ja abriu**, e o valor chega aqui pelo modulo puro
 * `display/protocol` (`presencaDoDisplay` + `PRESENCA_EVENTO`). Nenhum import
 * novo, nenhum segundo canal.
 *
 * Salvar **nao recarrega mais a pagina**: `gravarVitrine` dispara um evento,
 * o `App.tsx` remonta o estado de repouso na hora e o emissor manda. O iPad
 * muda em segundos de verdade.
 */
export function DisplayScreen({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [par, setPar] = useState<string | null>(lerPar);
  const [campo, setCampo] = useState("");
  const [v, setV] = useState<Vitrine>(lerVitrine);
  const [msg, setMsg] = useState("");
  const [aoVivo, setAoVivo] = useState(presencaDoDisplay);

  useEffect(() => {
    const ouvinte = (e: Event) => setAoVivo((e as CustomEvent<boolean>).detail);
    window.addEventListener(PRESENCA_EVENTO, ouvinte);
    // O canal pode ter se acertado antes desta tela abrir.
    setAoVivo(presencaDoDisplay());
    return () => window.removeEventListener(PRESENCA_EVENTO, ouvinte);
  }, []);

  const set = <K extends keyof Vitrine>(k: K, valor: Vitrine[K]) =>
    setV((atual) => ({ ...atual, [k]: valor }));

  function salvar() {
    gravarVitrine(v);
    setMsg(t("display.saved"));
    window.setTimeout(() => setMsg(""), 4000);
  }

  function parear() {
    const codigo = campo.trim();
    if (!codigoValido(codigo)) {
      setMsg(t("display.invalid"));
      return;
    }
    gravarPar(codigo);
    setPar(codigo);
    setCampo("");
    // O par so vale quando o emissor abre o canal novo, e ele abre uma vez, na
    // montagem do App. Aqui o recarregar continua sendo o caminho honesto.
    location.reload();
  }

  const ativos = paineis(v);
  const voltaTotal = ativos.reduce((s, p) => s + p.segundos, 0);

  return (
    <div className="tela-sobreposta z-30 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("display.title")} onClose={onClose} />

      <div className="space-y-3 p-4 select-text">
        {/* ── Pareamento ─────────────────────────────────────────────── */}
        <Card>
          <h2 className="font-display text-xl">{t("display.pairTitle")}</h2>
          {par ? (
            <>
              {/* ⚠️ Antes esta linha dizia "Pareado com 1234" so porque havia um
                  numero no `localStorage` — o que e uma mentira quando o iPad
                  esta desligado. Agora quem fala e a presenca no canal. */}
              <div className="flex items-center gap-2">
                <Bolinha ligada={aoVivo} />
                <p className="min-w-0 text-sm font-semibold">
                  {aoVivo
                    ? t("display.live", { code: par })
                    : t("display.offline", { code: par })}
                </p>
              </div>
              <p className="text-sm text-ink-muted">
                {aoVivo ? t("display.liveHint") : t("display.offlineHint")}
              </p>
              <TileButton
                emoji="🔌"
                label={t("display.unpair")}
                variant="outline"
                onClick={() => {
                  apagarPar();
                  setPar(null);
                  location.reload();
                }}
              />
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t("display.hint")}</p>
              {/* O "Parear" nao e uma acao de mesmo peso que "Salvar" ou
                  "Desparear": e o fecho de um campo. Por isso pilula ao lado do
                  numero, e nao um ladrilho de largura inteira. */}
              <label className="block text-sm">
                <span className="text-ink-muted">{t("display.code")}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={campo}
                    onChange={(e) => setCampo(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    maxLength={4}
                    className="min-w-0 flex-1 rounded-2xl border border-black/15 bg-white px-4 py-3 text-2xl tabular-nums tracking-[0.4em]"
                  />
                  <button
                    onClick={parear}
                    className="shrink-0 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-cream"
                  >
                    {t("display.pair")}
                  </button>
                </div>
              </label>
            </>
          )}
        </Card>

        {/* ── A vitrine ──────────────────────────────────────────────── */}
        <Card>
          <h2 className="font-display text-xl">{t("display.showcase")}</h2>
          <p className="text-sm text-ink-muted">{t("display.showcaseHint")}</p>

          <Painel
            emoji="🍓"
            titulo={t("display.panel.cena")}
            explicacao={t("display.panel.cenaHint")}
            /* A cena entra sempre; este interruptor escolhe o QUE ela mostra. */
            ligado={v.video}
            rotuloLigado={t("display.usesVideo")}
            rotuloDesligado={t("display.usesScene")}
            onLigar={(b) => set("video", b)}
            segundos={v.videoSeg}
            onSegundos={(n) => set("videoSeg", n)}
            t={t}
          />

          <Painel
            emoji="📸"
            titulo={t("display.panel.instagram")}
            explicacao={t("display.panel.instagramHint")}
            ligado={!!v.instagram.trim()}
            url={v.instagram}
            onUrl={(s) => set("instagram", s)}
            placeholder="https://instagram.com/…"
            segundos={v.instagramSeg}
            onSegundos={(n) => set("instagramSeg", n)}
            t={t}
          />

          <Painel
            emoji="⭐"
            titulo={t("display.panel.google")}
            explicacao={t("display.panel.googleHint")}
            ligado={!!v.google.trim()}
            url={v.google}
            onUrl={(s) => set("google", s)}
            placeholder="https://g.page/…"
            segundos={v.googleSeg}
            onSegundos={(n) => set("googleSeg", n)}
            t={t}
          />

          {/* Diz o que vai acontecer de verdade, com os numeros da tela — e
              mais util que qualquer explicacao do que "rodizio" significa. */}
          <p className="rounded-2xl bg-brand/10 p-3 text-sm text-brand">
            {t("display.cycle", {
              lista: ativos
                .map((p) => `${t(`display.panel.${p.tipo}`)} ${p.segundos}s`)
                .join(" → "),
              total: voltaTotal,
            })}
          </p>

          <p className="rounded-2xl bg-black/[0.04] p-3 text-sm text-ink-muted">
            {t("display.orderHint")}
          </p>

          <TileButton emoji="💾" label={t("display.save")} variant="outline" onClick={salvar} />
        </Card>

        {msg && (
          <p className="rounded-2xl bg-brand/10 p-3 text-center text-brand">{msg}</p>
        )}

        <p className="px-2 pb-4 text-center text-xs text-ink-muted">
          {t("display.footnote")}
        </p>
      </div>
    </div>
  );
}

/**
 * A bolinha ao vivo: verde pulsando quando o iPad esta mesmo no canal,
 * vermelha parada quando nao esta. A pulsacao importa — bolinha verde parada
 * le como enfeite; pulsando, le como sinal.
 */
function Bolinha({ ligada }: { ligada: boolean }) {
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      {ligada && (
        <motion.span
          className="absolute inset-0 rounded-full bg-green-500"
          animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className={`relative h-3 w-3 rounded-full ${
          ligada ? "bg-green-600" : "bg-red-600"
        }`}
      />
    </span>
  );
}

/** Um painel do rodizio: liga/desliga, endereco (quando tem) e duracao. */
function Painel({
  emoji,
  titulo,
  explicacao,
  ligado,
  onLigar,
  rotuloLigado,
  rotuloDesligado,
  url,
  onUrl,
  placeholder,
  segundos,
  onSegundos,
  t,
}: {
  emoji: string;
  titulo: string;
  explicacao?: string;
  ligado: boolean;
  onLigar?: (b: boolean) => void;
  rotuloLigado?: string;
  rotuloDesligado?: string;
  url?: string;
  onUrl?: (s: string) => void;
  placeholder?: string;
  segundos: number;
  onSegundos: (n: number) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        ligado ? "border-brand/40 bg-white" : "border-black/10 bg-black/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <span className="min-w-0 font-semibold">{titulo}</span>
        {/* O painel do QR nao tem liga/desliga proprio: ele entra no rodizio
            quando ha endereco e sai quando o campo esta vazio. Um interruptor
            a mais seria um segundo jeito de dizer a mesma coisa. */}
        {onLigar ? (
          <button
            onClick={() => onLigar(!ligado)}
            className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              ligado ? "bg-brand text-cream" : "border border-black/20 text-ink-muted"
            }`}
          >
            {ligado ? (rotuloLigado ?? t("display.on")) : (rotuloDesligado ?? t("display.off"))}
          </button>
        ) : (
          <span className="ml-auto shrink-0 text-xs text-ink-muted">
            {ligado ? t("display.on") : t("display.needsUrl")}
          </span>
        )}
      </div>

      {explicacao && (
        <p className="mt-1 text-xs text-ink-muted">{explicacao}</p>
      )}

      {onUrl && (
        <input
          value={url ?? ""}
          onChange={(e) => onUrl(e.target.value)}
          placeholder={placeholder}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
        />
      )}

      <label className="mt-2 flex items-center gap-3 text-sm text-ink-muted">
        <span className="shrink-0">{t("display.seconds")}</span>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={segundos}
          onChange={(e) => onSegundos(Number(e.target.value))}
          className="min-w-0 flex-1 accent-brand"
        />
        <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-ink">
          {segundos}s
        </span>
      </label>
    </div>
  );
}

export default DisplayScreen;
