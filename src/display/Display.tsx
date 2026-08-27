import { useEffect, useMemo, useRef, useState } from "react";
import { money, toppingEmoji } from "../config";
import { STRINGS } from "../i18n";
import { loadConfig } from "../sync";
import { CARTAZ_REPOUSO, VIDEO_REPOUSO } from "./config";
import { qrDoValor } from "./qr";
import {
  OBRIGADO_MS,
  codigoDoDisplay,
  trocarCodigo,
  type EstadoDisplay,
} from "./protocol";
import { ouvir, type Conexao } from "./link";

/**
 * Customer Display — a tela do iPad, virada para o cliente.
 *
 * **Em alemao, sem botao de idioma.** Nao e esquecimento: quem le esta tela e o
 * cliente no mercado de Aarau, nao a Romana. O celular continua PT · DE. Os
 * rotulos vem de `STRINGS.de` do proprio app, para nunca haver duas listas de
 * toppings discordando.
 */
const de = (k: string) => STRINGS.de[k] ?? k;

export function Display() {
  // O codigo SOBREVIVE ao recarregar (ver `codigoDoDisplay`): iPad que
  // recarrega sozinho no meio da feira nao pode desfazer o par em silencio.
  const [codigo, setCodigo] = useState(codigoDoDisplay);
  const [estado, setEstado] = useState<EstadoDisplay>({ kind: "repouso" });
  const [conexao, setConexao] = useState<Conexao>("ligando");

  useEffect(() => {
    if (!loadConfig()) {
      setConexao("caiu");
      return;
    }
    return ouvir(codigo, setEstado, setConexao);
  }, [codigo]);

  // O "obrigado" volta ao video sozinho. Ninguem toca neste iPad.
  useEffect(() => {
    if (estado.kind !== "obrigado") return;
    const id = window.setTimeout(
      () => setEstado({ kind: "repouso" }),
      OBRIGADO_MS,
    );
    return () => window.clearTimeout(id);
  }, [estado]);

  const repouso = estado.kind === "repouso";

  return (
    <div className="flex h-full w-full overflow-hidden bg-brand-dark text-cream">
      {/* O video NUNCA desmonta — so muda de largura. Remontar reiniciaria o
          arquivo do zero a cada pedido, e um video que pisca a cada cliente e
          pior que nenhum video. E a diferenca entre uma barraca viva e um
          caixa de supermercado. */}
      <div
        className={`relative shrink-0 overflow-hidden transition-[width] duration-500 ease-out ${
          repouso ? "w-full" : "w-[38%]"
        }`}
      >
        <Video />
        {repouso && (
          <Pareamento
            codigo={codigo}
            conexao={conexao}
            onTrocar={() => setCodigo(trocarCodigo())}
          />
        )}
      </div>

      {!repouso && (
        <div className="flex min-w-0 flex-1 flex-col">
          {estado.kind === "pedido" && <Pedido estado={estado} />}
          {estado.kind === "pagamento" && <Pagamento estado={estado} />}
          {estado.kind === "obrigado" && <Obrigado estado={estado} />}
        </div>
      )}
    </div>
  );
}

function Video() {
  const ref = useRef<HTMLVideoElement>(null);

  // `muted` + `playsInline` no atributo nao bastam no Safari do iPad: se a
  // pagina abrir com a aba em segundo plano, o autoplay e recusado em
  // silencio e o iPad fica preto. Chamar `play()` de novo quando a aba volta
  // e o que faz o video estar rodando quando alguem chega no balcao.
  useEffect(() => {
    if (!VIDEO_REPOUSO) return;
    const tocar = () => void ref.current?.play().catch(() => {});
    tocar();
    document.addEventListener("visibilitychange", tocar);
    return () => document.removeEventListener("visibilitychange", tocar);
  }, []);

  // Sem video ainda: o cartaz, com uma aproximacao lenta so para a tela nao
  // ficar morta. Trocar por video e uma linha em `config.ts`.
  if (!VIDEO_REPOUSO) {
    return (
      <img
        src={CARTAZ_REPOUSO}
        alt=""
        className="h-full w-full animate-[respira_18s_ease-in-out_infinite] object-cover"
      />
    );
  }

  return (
    <video
      ref={ref}
      src={VIDEO_REPOUSO}
      className="h-full w-full object-cover"
      autoPlay
      loop
      muted
      playsInline
      poster={CARTAZ_REPOUSO}
    />
  );
}

/**
 * O codigo de pareamento, sobre o video.
 *
 * So aparece no repouso — durante o atendimento o cliente nao tem nada que ver
 * um numero de configuracao. Discreto de proposito: quem procura, acha; quem
 * nao procura, ve o video.
 */
function Pareamento({
  codigo,
  conexao,
  onTrocar,
}: {
  codigo: string;
  conexao: Conexao;
  onTrocar: () => void;
}) {
  return (
    <div className="absolute bottom-6 left-6 rounded-2xl bg-black/45 px-5 py-3 backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.2em] opacity-70">Code</p>
      <p className="font-display text-4xl tabular-nums leading-tight">{codigo}</p>
      <p className="text-xs opacity-70">
        {conexao === "ligado"
          ? "bereit"
          : conexao === "ligando"
            ? "verbindet…"
            : "keine Verbindung"}
      </p>
      {/* Trocar o codigo e deliberado, nunca acidental: so por toque, e so
          aqui no repouso. E a saida para um par antigo que ficou pendurado. */}
      <button
        onClick={onTrocar}
        className="mt-1 text-[11px] underline underline-offset-2 opacity-50"
      >
        neuer Code
      </button>
    </div>
  );
}

function Pedido({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "pedido" }>;
}) {
  const lista = useRef<HTMLUListElement>(null);

  // Rola para o copo que acabou de entrar. Achado no teste com 8 copos: sem
  // isto o cliente ficava olhando o Becher 1 enquanto a Romana montava o 8 —
  // a tela mostrava o comeco do pedido, nao o que estava acontecendo.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [estado.cups.length]);

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="font-display text-4xl text-cream/80">Ihre Bestellung</h1>

      <ul ref={lista} className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        {estado.cups.map((c, i) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-4 rounded-2xl bg-cream/10 px-5 py-4"
          >
            <span className="min-w-0">
              <span className="font-display text-3xl">🍓 Becher {i + 1}</span>
              <span className="mt-1 block truncate text-xl text-cream/70">
                {c.toppings.length
                  ? c.toppings
                      .map((x) => `${toppingEmoji(x)} ${de(`topping.${x}`)}`)
                      .join(" · ")
                  : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <Total rotulo="Total" valor={estado.total} />
    </div>
  );
}

function Pagamento({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "pagamento" }>;
}) {
  if (estado.payment === "twint") return <Twint total={estado.total} />;

  const troco =
    estado.recebido !== null ? estado.recebido - estado.total : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="font-display text-4xl text-cream/80">Bar bezahlen</p>
      <Linha rotulo="Zu bezahlen" valor={estado.total} />
      {estado.recebido !== null && (
        <>
          <Linha rotulo="Erhalten" valor={estado.recebido} />
          {/* O troco e o numero maior da tela: e onde mais da discussao no
              balcao, e a razao pela qual o Felipe pediu esta tela. */}
          <div className="mt-2 w-full rounded-3xl bg-cream px-8 py-6 text-brand-dark">
            <p className="text-lg uppercase tracking-[0.2em] opacity-60">
              Rückgeld
            </p>
            <p className="font-display text-[clamp(3rem,12vw,7rem)] leading-none tabular-nums">
              {money(Math.max(0, troco ?? 0))}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Twint({ total }: { total: number }) {
  // O SVG e montado dentro do iPad, sem rede: o payload do QR suico e texto
  // puro. `useMemo` porque so muda quando o valor muda.
  const svg = useMemo(() => qrDoValor(total), [total]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <p className="font-display text-4xl text-cream/80">TWINT</p>
      <Linha rotulo="Zu bezahlen" valor={total} />
      {svg ? (
        <div
          className="mt-2 w-[min(52vh,26rem)] rounded-3xl bg-white p-5"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        // Sem IBAN configurado nao ha QR — e o display DIZ isso, em vez de
        // desenhar um codigo que nao leva a lugar nenhum. Ver `config.ts`.
        <p className="mt-2 max-w-md text-2xl text-cream/70">
          Bitte den QR-Code am Stand scannen.
        </p>
      )}
    </div>
  );
}

function Obrigado({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "obrigado" }>;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-[6rem] leading-none">🍓</p>
      <p className="font-display text-[clamp(3rem,9vw,6rem)] leading-none">
        Danke!
      </p>
      <p className="text-2xl text-cream/70">{money(estado.total)}</p>
      <p className="text-xl text-cream/50">Bis zum nächsten Mal.</p>
    </div>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-cream/20 pt-6">
      <span className="text-2xl uppercase tracking-[0.2em] text-cream/60">
        {rotulo}
      </span>
      {/* clamp em vez dos degraus do <Valor>: la o problema e caber num card de
          celular, aqui e ocupar uma metade de iPad sem ficar minusculo. */}
      <span className="font-display text-[clamp(2.5rem,7vw,5rem)] leading-none tabular-nums">
        {money(valor)}
      </span>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <p className="text-3xl">
      <span className="text-cream/60">{rotulo}: </span>
      <span className="font-display tabular-nums">{money(valor)}</span>
    </p>
  );
}
