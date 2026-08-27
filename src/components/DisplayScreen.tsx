import { useState } from "react";
import { useLang } from "../i18n";
import {
  apagarPar,
  codigoValido,
  gravarPar,
  gravarVitrine,
  lerPar,
  lerVitrine,
  paineis,
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
 * Mudanca aqui so chega ao iPad na proxima vez que o celular mandar o estado
 * de repouso — por isso salvar recarrega a pagina, como no pareamento.
 */
export function DisplayScreen({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [par, setPar] = useState<string | null>(lerPar);
  const [campo, setCampo] = useState("");
  const [v, setV] = useState<Vitrine>(lerVitrine);
  const [msg, setMsg] = useState("");

  const set = <K extends keyof Vitrine>(k: K, valor: Vitrine[K]) =>
    setV((atual) => ({ ...atual, [k]: valor }));

  function salvar() {
    gravarVitrine(v);
    setMsg(t("display.saved"));
    // Recarrega para o emissor subir com a vitrine nova. Sem isto, o iPad so
    // veria a mudanca na proxima abertura do app — e o Felipe ficaria olhando
    // um tablet parado sem saber por que.
    setTimeout(() => location.reload(), 400);
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
    location.reload();
  }

  const ativos = paineis(v);

  return (
    <div className="tela-sobreposta z-30 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("display.title")} onClose={onClose} />

      <div className="space-y-3 p-4 select-text">
        {/* ── Pareamento ─────────────────────────────────────────────── */}
        <Card>
          <h2 className="font-display text-xl">{t("display.pairTitle")}</h2>
          {par ? (
            <>
              <p className="text-sm font-semibold text-green-800">
                ✓ {t("display.paired", { code: par })}
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
              <label className="block text-sm">
                <span className="text-ink-muted">{t("display.code")}</span>
                <input
                  value={campo}
                  onChange={(e) => setCampo(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  maxLength={4}
                  className="mt-1 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-2xl tabular-nums tracking-[0.4em]"
                />
              </label>
              <TileButton
                emoji="📺"
                label={t("display.pair")}
                variant="outline"
                onClick={parear}
              />
            </>
          )}
        </Card>

        {/* ── A vitrine ──────────────────────────────────────────────── */}
        <Card>
          <h2 className="font-display text-xl">{t("display.showcase")}</h2>
          <p className="text-sm text-ink-muted">{t("display.showcaseHint")}</p>

          <Painel
            emoji="🎬"
            titulo={t("display.panel.video")}
            ligado={v.video}
            onLigar={(b) => set("video", b)}
            segundos={v.videoSeg}
            onSegundos={(n) => set("videoSeg", n)}
            t={t}
          />

          <Painel
            emoji="📸"
            titulo={t("display.panel.instagram")}
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
              total: ativos.reduce((s, p) => s + p.segundos, 0),
            })}
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

/** Um painel do rodizio: liga/desliga, endereco (quando tem) e duracao. */
function Painel({
  emoji,
  titulo,
  ligado,
  onLigar,
  url,
  onUrl,
  placeholder,
  segundos,
  onSegundos,
  t,
}: {
  emoji: string;
  titulo: string;
  ligado: boolean;
  onLigar?: (b: boolean) => void;
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
        <span className="font-semibold">{titulo}</span>
        {/* O painel do QR nao tem liga/desliga proprio: ele entra no rodizio
            quando ha endereco e sai quando o campo esta vazio. Um interruptor
            a mais seria um segundo jeito de dizer a mesma coisa. */}
        {onLigar ? (
          <button
            onClick={() => onLigar(!ligado)}
            className={`ml-auto rounded-full px-3 py-1 text-sm font-semibold ${
              ligado ? "bg-brand text-cream" : "border border-black/20 text-ink-muted"
            }`}
          >
            {ligado ? t("display.on") : t("display.off")}
          </button>
        ) : (
          <span className="ml-auto text-xs text-ink-muted">
            {ligado ? t("display.on") : t("display.needsUrl")}
          </span>
        )}
      </div>

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
