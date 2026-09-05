import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, toppingEmoji } from "../config";
import { STRINGS } from "../i18n";
import { CARTAZ_REPOUSO, LOGO_SUNBITE, TWINT_NUMERO, VIDEO_REPOUSO } from "./config";
import { qrDoValor, svgDoQR } from "./qr";
import {
  OBRIGADO_MS,
  VITRINE_PADRAO,
  codigoDoDisplay,
  estruturaDaVitrine,
  paineis,
  trocarCodigo,
  type EstadoDisplay,
  type PainelVitrine,
  type Vitrine,
} from "./protocol";
import { ouvir, type Conexao } from "./link";
import type { Cup } from "../types";

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
    // Sem `if (!loadConfig())`: `loadConfig()` nunca devolve null (ver
    // `src/sync.ts`), entao o ramo era codigo morto. Sem configuracao o
    // `getSupabase()` de `link.ts` estoura e o `catch` de la ja diz "caiu".
    return ouvir(
      codigo,
      (novo) =>
        setEstado((atual) => {
          // ⚠️ O relogio do agradecimento e daqui, e so daqui.
          //
          // A comemoracao do celular dura ~2s e some; o "repouso" que vem logo
          // atras chegaria antes de o cliente ler o "Danke!". Entao o iPad
          // **ignora** repouso enquanto esta agradecendo — o proprio timer
          // abaixo o tira da tela na hora certa.
          //
          // Um pedido novo (ou um pagamento) passa na hora, e deve passar: o
          // proximo cliente ja chegou.
          if (atual.kind === "obrigado" && novo.kind === "repouso") return atual;
          return novo;
        }),
      setConexao,
    );
  }, [codigo]);

  // O "obrigado" volta a vitrine sozinho. Ninguem toca neste iPad.
  useEffect(() => {
    if (estado.kind !== "obrigado") return;
    const id = window.setTimeout(
      () => setEstado({ kind: "repouso" }),
      OBRIGADO_MS,
    );
    return () => window.clearTimeout(id);
  }, [estado]);

  /* ⚠️ A altura desta tela e MEDIDA pelo navegador, nao herdada do CSS.
     Ver o comentario grande do `return` sobre a listra vermelha: nenhuma
     unidade de CSS que o Safari 15 entende sabe a altura VISIVEL do iPad
     quando a barra do Safari se esconde. Quem sabe e o `visualViewport`, e
     ele so responde se perguntarmos.

     A medida vai para o `<html>` como `--altura-display`/`--largura-display`,
     e a raiz do display se dimensiona por ela. `scroll` do `visualViewport`
     entra na lista porque no iOS a barra sumindo chega como rolagem, nao como
     redimensionamento — sem ele a tela so acertaria a altura no giro do
     aparelho. `orientationchange` e o cinto para o Safari que dispara o
     `resize` antes de a nova altura valer.

     `window.visualViewport` com guarda: e recente o bastante para faltar, e
     ai `innerHeight` ja serve. */
  useEffect(() => {
    const raiz = document.documentElement;
    const medir = () => {
      const vv = window.visualViewport;
      raiz.style.setProperty(
        "--altura-display",
        `${vv ? vv.height : window.innerHeight}px`,
      );
      raiz.style.setProperty(
        "--largura-display",
        `${vv ? vv.width : window.innerWidth}px`,
      );
    };
    medir();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", medir);
      vv.addEventListener("scroll", medir);
    }
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", medir);
        vv.removeEventListener("scroll", medir);
      }
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  /* Cinto e suspensorio: se apesar de tudo sobrar um fio de pagina, ele tem
     que ser INVISIVEL. O `body` do app de venda e vermelho-marca, e era
     exatamente esse vermelho que aparecia na foto do Felipe.

     A marca vai no proprio documento, e nao no CSS global: `display.html` e
     `index.html` dividem o mesmo `index.css`, entao pintar `body` de escuro
     la mudaria tambem o fundo da tela de venda. Com o atributo, so a pagina
     que monta este componente fica escura (ver `index.css`). */
  useEffect(() => {
    document.documentElement.setAttribute("data-tela", "display");
    return () => document.documentElement.removeAttribute("data-tela");
  }, []);

  const repouso = estado.kind === "repouso";
  const twint = estado.kind === "pagamento" && estado.payment === "twint";

  /**
   * A largura da metade esquerda, e e ela que conta a historia.
   *
   * Repouso: a vitrine ocupa tudo. Pedido: encolhe para o pedido caber. TWINT:
   * cresce um pouco — o pedido **encolhe para dar destaque** e o QR entra no
   * lugar do video, que foi exatamente o que o Felipe pediu em 27/08.
   */
  const larguraPct = repouso ? 100 : twint ? 46 : 34;
  const largura = `${larguraPct}%`;

  /**
   * A MESMA largura, em `vw`, para o CSS de dentro do painel poder medir por
   * ela (`--painel`).
   *
   * ⚠️ Por que nao consulta de container: o iPad de 5a geracao do Felipe nao
   * chega ao Safari 16, e `cqw` la invalida a declaracao inteira — o texto
   * inteiro caiu para 16px e ele viu na tela. `vw` funciona em todo Safari, e
   * como este painel e uma fracao exata da janela, a conta bate: 34% da janela
   * sao 34vw. Se um dia o painel deixar de ser fracao da janela, esta linha
   * mente e o certo passa a ser medir de verdade.
   */
  const painelVw = `${larguraPct}vw`;

  /**
   * A vitrine que o celular mandou, guardada no proprio iPad.
   *
   * Guardar importa: se o iPad recarregar antes de o celular mandar o primeiro
   * repouso, ele volta com a vitrine de sempre em vez de cair no padrao e
   * "esquecer" o QR do Instagram no meio da feira.
   */
  const [vitrine, setVitrine] = useState<Vitrine>(() => {
    try {
      const raw = localStorage.getItem("sunbite.display.vitrine.cache");
      return raw ? { ...VITRINE_PADRAO, ...JSON.parse(raw) } : VITRINE_PADRAO;
    } catch {
      return VITRINE_PADRAO;
    }
  });
  useEffect(() => {
    if (estado.kind !== "repouso" || !estado.vitrine) return;
    const novo = JSON.stringify(estado.vitrine);
    // ⚠️ So troca quando o CONTEUDO mudou. O celular repete o estado a cada 8s
    // (a batida do emissor), e cada repeticao chega como um objeto novo: se
    // isto gravasse sempre, a vitrine ganhava identidade nova a cada batida, o
    // rodizio voltava ao primeiro painel e o iPad ficava preso no Instagram
    // para sempre. Foi exatamente o que aconteceu no teste.
    setVitrine((atual) => (JSON.stringify(atual) === novo ? atual : estado.vitrine!));
    try {
      localStorage.setItem("sunbite.display.vitrine.cache", novo);
    } catch {
      /* sem armazenamento: vale so enquanto a pagina estiver aberta */
    }
  }, [estado]);

  return (
    /* ⚠️ `fixed inset-0`, e nao `h-full`.

       `h-full` e `height:100%`, que sobe pela corrente `#root` → `body` →
       `html` ate a altura que o Safari do iPad informa — e no iPad essa altura
       e a da area visivel COM as barras do Safari na tela. Quando as barras se
       escondem sozinhas, a area visivel cresce e a pagina nao: sobra uma faixa
       embaixo com o fundo vermelho do container aparecendo. Foi exatamente a
       "listra vermelha horrivel" que o Felipe fotografou em 28/08, e ela nunca
       apareceu no Chrome porque no Chrome as barras nao se escondem.

       `fixed inset-0` prende a tela na janela inteira e nao pergunta a altura
       para ninguem. Vale nos dois modos, com e sem a barra do Safari.

       ⚠️ **E nem `inset-0` bastou.** `position: fixed` no iOS resolve contra o
       *layout viewport*, que pode ser MENOR que a area de fato visivel: quando
       a barra do Safari se recolhe, o visivel cresce, o `bottom: 0` continua
       ancorado na altura velha e a listra vermelha volta. Por isso a raiz nao
       depende mais de `bottom`/`right` — ela e ancorada so no canto de cima a
       esquerda e recebe a altura e a largura MEDIDAS pelo efeito la em cima
       (`--altura-display`, `--largura-display`).

       O `100%` do fallback e de proposito: se o efeito ainda nao rodou (ou o
       JS morreu), a tela volta ao comportamento anterior em vez de sumir.

       PROIBIDO aqui: `dvh`, `svh`, `@container`/`cqw`, `:has()`. O iPad de 5a
       geracao nao passa do Safari 15, e unidade que ele nao entende invalida a
       declaracao INTEIRA, em silencio — foi assim que o logotipo desta tela
       virou texto de 16px. */
    <div
      className="fixed left-0 top-0 flex overflow-hidden bg-brand-dark text-cream"
      style={{
        height: "var(--altura-display, 100%)",
        width: "var(--largura-display, 100%)",
        /**
         * ⚠️ O piso de 100vh, e por que ele e o conserto de verdade.
         *
         * O Felipe apontou em 04/09 que a listra continuava — e deu o dado que
         * faltava: **ela aparece quando abre pelo icone da Tela de Inicio, e
         * NAO no Safari.** Isso descarta as barras do navegador (a hipotese das
         * ops 14 e 17) e aponta para o modo app com
         * `apple-mobile-web-app-status-bar-style: black-translucent`: o iOS
         * empurra o conteudo para baixo do relogio e entrega uma area de
         * layout **mais curta que a tela, na altura da barra de status** —
         * sobrando uma faixa embaixo com o fundo do `body`.
         *
         * `visualViewport` mede essa area curta, entao medir sozinho nao
         * resolvia. Em modo app **nao existem barras que se recolhem**, logo
         * `100vh` e a tela inteira, de verdade: usar o maior dos dois cobre os
         * dois mundos. `vh` e `max()` sao antigos o bastante para o Safari 15.
         *
         * O `display.html` tambem passou a pedir a barra de status OPACA, que
         * elimina o deslocamento na origem — mas aquela meta so vale para
         * icones **criados depois** da mudanca, e este piso vale na hora.
         */
        minHeight: "100vh",
      }}
      /* Segunda declaracao, deliberadamente separada: se este Safari nao
         entender `dvh`, ele descarta SO esta linha e o `100vh` acima
         continua valendo. Nunca por as duas na mesma declaracao. */
      ref={(el) => {
        if (el) el.style.setProperty("min-height", "100dvh");
      }}
    >
      {/* O video NUNCA desmonta — so muda de largura, e o que entra por cima
          dele e sempre uma camada. Remontar reiniciaria o arquivo do zero a
          cada cliente, e um video que pisca e pior que nenhum video. */}
      <motion.div
        className="relative shrink-0 overflow-hidden"
        style={{ "--painel": painelVw } as CSSProperties}
        animate={{ width: largura }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      >
        <Video usarVideo={vitrine.video} />

        {/* O rodizio da vitrine so existe no repouso. Durante a venda o video
            volta sozinho: um QR do Instagram por cima do pedido seria roubar a
            atencao de quem esta pagando. */}
        {repouso && <Rodizio vitrine={vitrine} />}

        {/* ⚠️ SEM `repouso &&`. Regra dura do Felipe: o codigo aparece SEMPRE
            que nao ha conexao de verdade, e NUNCA quando ha. Amarrado ao
            repouso, um iPad parado com o pedido de alguem que ja sumiu ficava
            justamente sem o unico numero que resolveria a situacao. */}
        <Pareamento
          codigo={codigo}
          conexao={conexao}
          onTrocar={() => setCodigo(trocarCodigo())}
        />

        {/* O QR do TWINT entra AQUI, no lugar do video, sem tirar o pedido da
            tela. E a camada que o Felipe pediu. */}
        <AnimatePresence>
          {estado.kind === "pagamento" && estado.payment === "twint" && (
            <PainelTwint key="twint" total={estado.total} />
          )}
        </AnimatePresence>
      </motion.div>

      {!repouso && (
        <div className="flex min-w-0 flex-1 flex-col">
          {(estado.kind === "pedido" || estado.kind === "pagamento") && (
            <ListaPedido
              cups={estado.cups ?? []}
              total={estado.total}
              precoCopo={estado.precoCopo}
              precoTopping={estado.precoTopping}
              /* No pagamento a lista cede espaco para o bloco de baixo — e a
                 base do "modo 3" que o Felipe escolheu. */
              rodape={
                estado.kind === "pagamento" ? (
                  <BlocoPagamento estado={estado} />
                ) : null
              }
            />
          )}
        </div>
      )}

      {/* ⚠️ O "Danke!" mora AQUI FORA, por cima dos dois paineis.

          Ele era mais um filho da coluna da direita, entao dividia a tela com
          o painel da marca — o cliente recebia um obrigado espremido em dois
          tercos, com o logotipo do lado. Pedido do Felipe em 28/08: a tela
          toda, e a transicao calma.

          Como camada por cima, ele nao depende de largura nenhuma, e a saida
          do pedido acontece por baixo sem piscar. */}
      <AnimatePresence>
        {estado.kind === "obrigado" && (
          <Obrigado key="obrigado" estado={estado} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Video({ usarVideo }: { usarVideo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  // `muted` + `playsInline` no atributo nao bastam no Safari do iPad: se a
  // pagina abrir com a aba em segundo plano, o autoplay e recusado em
  // silencio e o iPad fica preto. Chamar `play()` de novo quando a aba volta
  // e o que faz o video estar rodando quando alguem chega no balcao.
  useEffect(() => {
    if (!VIDEO_REPOUSO || !usarVideo) return;
    const tocar = () => void ref.current?.play().catch(() => {});
    tocar();
    document.addEventListener("visibilitychange", tocar);
    return () => document.removeEventListener("visibilitychange", tocar);
  }, [usarVideo]);

  // Sem arquivo de video ainda: uma cena que se mexe, feita so de CSS.
  //
  // Nao e o video definitivo e nem tenta ser — e o lugar dele, ocupado por
  // algo vivo. Tela parada num balcao le como aparelho travado, e um cartaz
  // imovel por 30 segundos e pior que nada. Zero bytes de download, roda no
  // Safari do iPad sem codec nenhum. Trocar pelo video de verdade continua
  // sendo **uma linha** em `config.ts`.
  if (!VIDEO_REPOUSO || !usarVideo) return <CenaPlaceholder />;

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

/** Frutas que atravessam a tela devagar, cada uma no seu tempo. */
const FLUTUANTES = [
  { emoji: "🍓", left: "8%", dur: 26, delay: 0, tam: "7rem" },
  { emoji: "🍫", left: "24%", dur: 34, delay: 6, tam: "5rem" },
  { emoji: "🍓", left: "46%", dur: 30, delay: 12, tam: "9rem" },
  { emoji: "🥥", left: "66%", dur: 38, delay: 3, tam: "5.5rem" },
  { emoji: "🍓", left: "82%", dur: 28, delay: 18, tam: "6.5rem" },
  { emoji: "🍫", left: "92%", dur: 32, delay: 9, tam: "4.5rem" },
];

function CenaPlaceholder() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-brand">
      {/* Fundo que respira: dois brilhos que deslizam devagar. */}
      <div className="absolute inset-0 animate-[maré_24s_ease-in-out_infinite] bg-[radial-gradient(60%_60%_at_30%_30%,rgba(255,120,110,.45),transparent_70%),radial-gradient(55%_55%_at_75%_70%,rgba(201,138,46,.35),transparent_70%)]" />

      {FLUTUANTES.map((f, i) => (
        <span
          key={i}
          className="absolute bottom-[-20%] select-none opacity-25"
          style={{
            left: f.left,
            fontSize: f.tam,
            animation: `subir ${f.dur}s linear ${f.delay}s infinite`,
          }}
        >
          {f.emoji}
        </span>
      ))}

      {/* ⚠️ Este bloco mede pela LARGURA DO PAINEL, via `--painel`.

          Historia curta de dois defeitos seguidos, para ninguem repetir:

          1. Media tudo em `vh` — altura da pagina. Mas a largura deste painel
             vai de 100% (repouso) a 34% (venda) e a altura nao muda nada: o
             subtitulo, que so de `tracking` passa de 380px, quebrava em duas
             linhas coladas na borda esquerda, cortando o "E" de ERDBEEREN.

          2. A correcao foi `@container` + `cqw`, e **quebrou no iPad do
             Felipe**: consultas de container so existem a partir do Safari 16,
             e o iPad de 5a geracao dele nao chega la. Unidade que o navegador
             nao entende invalida a declaracao inteira, entao TODO o
             `font-size` sumiu e o logotipo virou texto de 16px. Estava na foto,
             minusculo, e nao apareceu no Chrome.

          Hoje o `App` manda a largura do painel em `vw` (`--painel`, definido no
          `motion.div` la em cima) e aqui e so `calc`. `vw` e `calc` funcionam em
          qualquer Safari desde sempre, e o resultado e o mesmo: o bloco encolhe
          junto com o painel. **Regra: nada nesta tela pode depender de um
          recurso de CSS mais novo que o Safari 15.** */}
      <div className="absolute inset-0">
        <div className="flex h-full flex-col items-center justify-center gap-[calc(var(--painel,100vw)*0.02)] px-[calc(var(--painel,100vw)*0.07)] text-center text-cream">
          {/* O logotipo oficial, recortado do arquivo da marca. Nao e mais
              texto: a fonte do app nunca foi a do logo, e "Sunbite" escrito na
              fonte errada, virado para o cliente, e a marca aparecendo errada.
              PNG com transparencia, precacheado pelo service worker — abre sem
              rede na feira, como todo o resto desta tela. */}
          <img
            src={LOGO_SUNBITE}
            alt="Sunbite.ch"
            className="animate-[pulsar_6s_ease-in-out_infinite] h-auto w-[clamp(7rem,calc(var(--painel,100vw)*0.62),34rem)] select-none drop-shadow-[0_10px_28px_rgba(0,0,0,.28)]"
            draggable={false}
          />
          <p className="text-[clamp(.6rem,calc(var(--painel,100vw)*0.024),1.35rem)] tracking-[0.3em] text-cream/70">
            ERDBEEREN MIT SCHOKOLADE
          </p>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================================
   OS TOQUES DE MORANGO E CHOCOLATE
   ===========================================================================
   Pedido do Felipe: "elementos bem sutis". Sutis mesmo — se der para
   apontar e dizer "olha o desenho", passou do ponto. Eles existem para a
   tela parecer da Sunbite mesmo quando so tem um numero nela.
   =========================================================================== */

/**
 * Um fio de chocolate escorrendo, com tres gotas.
 *
 * Serve de divisor: separa o pedido do bloco de pagamento sem uma linha reta,
 * que numa tela de doce le como formulario.
 */
function FioDeChocolate({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 20"
      preserveAspectRatio="none"
      className={`h-[clamp(.7rem,1.8vh,1.1rem)] w-full ${className}`}
      aria-hidden="true"
    >
      <path
        d="M0 0 L400 0 L400 7 C 370 7, 360 13, 330 13 S 285 5, 255 6 S 205 14, 175 12 S 120 4, 90 7 S 35 14, 0 9 Z"
        fill="#5A2E1B"
        opacity="0.55"
      />
      <circle cx="318" cy="16" r="2.6" fill="#5A2E1B" opacity="0.5" />
      <circle cx="168" cy="16" r="2" fill="#5A2E1B" opacity="0.42" />
      <circle cx="76" cy="15" r="2.3" fill="#5A2E1B" opacity="0.46" />
    </svg>
  );
}

/** Morangos e chocolates boiando bem apagados no fundo de um painel. */
const BOIANDO = [
  { e: "🍓", top: "12%", left: "12%", tam: "5.5rem", dur: 13, atraso: 0 },
  { e: "🍫", top: "72%", left: "16%", tam: "4rem", dur: 17, atraso: 2.5 },
  { e: "🍓", top: "78%", left: "78%", tam: "6rem", dur: 15, atraso: 1.2 },
  { e: "🍫", top: "16%", left: "80%", tam: "3.4rem", dur: 19, atraso: 4 },
];

function Boiando() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {BOIANDO.map((b, i) => (
        <span
          key={i}
          className="absolute select-none opacity-[0.09]"
          style={{
            top: b.top,
            left: b.left,
            fontSize: b.tam,
            animation: `boiar ${b.dur}s ease-in-out ${b.atraso}s infinite`,
          }}
        >
          {b.e}
        </span>
      ))}
    </div>
  );
}

/* ===========================================================================
   O RODIZIO DA VITRINE
   =========================================================================== */

/**
 * O rodizio: cena → Instagram → Google → cena…
 *
 * Fica POR CIMA do video, e o video nunca desmonta por baixo. O painel de
 * video e simplesmente "nao mostrar nada aqui" — o que aparece e o video que
 * ja estava rodando. Por isso o `AnimatePresence` fica aqui e nao dentro do
 * painel: e ele que faz o QR entrar e sair por cima.
 */
function Rodizio({ vitrine }: { vitrine: Vitrine }) {
  const lista = paineis(vitrine);

  /**
   * Duas chaves, e nao uma.
   *
   * ⚠️ A chave era `JSON.stringify(vitrine)` — o objeto inteiro, com os
   * segundos dentro. Mexer num slider de segundos nos Ajustes mudava a chave e
   * o rodizio voltava ao painel 1. A ESTRUTURA (quais paineis, com que
   * endereco) justifica reiniciar; a DURACAO nao. Por isso a duracao viaja por
   * `ref`, lida pelo relogio na hora de agendar, sem tocar no indice.
   */
  const estrutura = estruturaDaVitrine(lista);
  const listaRef = useRef(lista);
  listaRef.current = lista;

  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [estrutura]);

  useEffect(() => {
    const atuais = listaRef.current;
    if (atuais.length < 2) return; // um painel so nao reveza
    const atual = atuais[i % atuais.length];
    const id = window.setTimeout(
      () => setI((n) => (n + 1) % listaRef.current.length),
      atual.segundos * 1000,
    );
    return () => window.clearTimeout(id);
  }, [i, estrutura]);

  const painel = lista[i % lista.length];

  /**
   * O painel atual TAPA a cena? (foto e QR tapam; a cena e a propria cena.)
   *
   * ⚠️ Isto existe por causa de um defeito que so a FOTO da tela pegou, nunca
   * a medicao: no crossfade os dois paineis passam por opacidades
   * intermediarias ao mesmo tempo, e o que estava por baixo — a cena vermelha
   * com o logotipo — **aparecia atraves das duas fotos**. O resultado era um
   * borrao com "Sunbite" e "ERDBEEREN MIT SCHOKOLADE" carimbados por cima dos
   * morangos, a cada 5 segundos.
   *
   * A saida e um fundo opaco proprio do rodizio, por baixo dos paineis e
   * **fora da troca deles**: enquanto o rodizio estiver no bloco que tapa
   * (fotos e QR), ele fica montado e inteiro, entao a cena nunca reaparece no
   * meio do caminho. Quando chega a vez da cena, ele sai junto com o painel e
   * a devolve.
   */
  const tapaACena = !!painel && painel.tipo !== "cena";

  return (
    <>
    <AnimatePresence>
      {tapaACena && (
        <motion.div
          key="fundo-do-rodizio"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="absolute inset-0 bg-ink"
        />
      )}
    </AnimatePresence>

    {/* ⚠️ SEM `mode="wait"`, e a diferenca importa.
     *
     * Com `wait` o painel que sai termina a saida ANTES de o proximo comecar
     * a entrar, e no vao entre os dois aparece a cena vermelha por baixo. Com
     * dois QR distantes um do outro isso passava despercebido; com sete fotos
     * seguidas de 5s viraria um pisca-pisca vermelho a cada 5 segundos, que e
     * exatamente o oposto de "uma transicao entre elas".
     *
     * No modo padrao os dois convivem por ~0,8s e a troca vira crossfade de
     * verdade. Como todo painel e `absolute inset-0` e opaco, quem entra cobre
     * quem sai sem nenhum salto de layout. O par Instagram → Google ganhou de
     * graca. */}
    <AnimatePresence>
      {/* A cena e painel de verdade, com turno proprio no rodizio: na vez dela
          o que aparece e o que ja esta rodando por baixo, entao aqui e so
          **nao cobrir**. Antes ela nunca tinha vez, e os QR (que sao
          `absolute inset-0` com fundo opaco) a escondiam para sempre. */}
      {painel?.tipo === "foto" && (
        <PainelFoto key={`foto-${i}`} src={painel.src} />
      )}
      {painel && (painel.tipo === "instagram" || painel.tipo === "google") && (
        <PainelQR key={`${painel.tipo}-${i}`} painel={painel} />
      )}
    </AnimatePresence>
    </>
  );
}

/**
 * Uma foto da Sunbite em tela cheia.
 *
 * ⚠️ O problema que este componente resolve: as fotos sao todas EM PE (foto de
 * celular) e o iPad e DEITADO, 1024x768. Cortar para preencher (`object-cover`)
 * come o ceu e a grama e, na foto da food bike, cortaria a propria bike.
 * Deixar barra preta dos dois lados le como video mal enquadrado.
 *
 * A saida escolhida pelo Felipe em 05/09 e a que a TV e o Instagram usam: a
 * foto **inteira** no meio (`object-contain`) e uma **copia dela mesma**,
 * borrada e ampliada, preenchendo as laterais. As bordas ficam da cor da
 * propria foto, nada e cortado, e a tela nao tem buraco.
 *
 * `filter: blur()` e `object-fit` existem em Safari desde muito antes do 15 —
 * nada aqui depende de CSS que o iPad de 5a geracao nao entenda (a licao do
 * defeito 4 da ops 14, quando `cqw` apagou o logotipo inteiro).
 *
 * A base e `bg-ink`, nunca o vermelho da marca: se por qualquer motivo sobrar
 * um fio de pagina, ele tem que ser escuro e invisivel — foi vermelho que o
 * Felipe fotografou em 28/08.
 */
function PainelFoto({ src }: { src: string }) {
  const reduzir = useReducedMotion();

  /**
   * Esta foto ja preenche a tela sozinha?
   *
   * As fotos 2 e 3 foram giradas para a esquerda em 05/09 e ficaram 4:3 exato
   * — a mesma proporcao do iPad. Nelas o fundo desfocado fica **inteiramente
   * escondido atras da foto**: e trabalho pesado (desfoque sobre imagem de
   * tela cheia) para desenhar algo que ninguem ve. Num iPad de 2017 isso nao
   * e detalhe, e o mesmo tipo de custo que fez o Felipe dizer "fica travando".
   *
   * Entao a comparacao e feita com a imagem carregada, e nao com uma lista de
   * nomes: foto nova que entrar deitada ganha o beneficio sozinha, e foto que
   * um dia mude de tamanho nao deixa a regra mentindo.
   */
  const [preencheSozinha, setPreencheSozinha] = useState(false);

  const fotoRef = useRef<HTMLImageElement>(null);

  /* ⚠️ A medida mora num efeito, e nao num `ref`/`onLoad` solto — a primeira
     versao fazia assim e acertava **so as vezes**: media as sete fotos numa
     passada e so seis na seguinte. O motivo e que a foto vem do precache do
     service worker e quase sempre chega pronta, e ai o `onLoad` nunca dispara;
     ja no `ref`, que roda durante a montagem, a imagem as vezes ainda nao tem
     `naturalWidth`. O efeito roda depois da montagem, quando `complete` ja e
     confiavel, e o ouvinte cobre a primeira visita — a unica vez que a foto
     vem pela rede. */
  useEffect(() => {
    const im = fotoRef.current;
    if (!im) return;
    const checa = () => {
      if (!im.naturalWidth || !im.clientHeight) return;
      const daFoto = im.naturalWidth / im.naturalHeight;
      const daTela = im.clientWidth / im.clientHeight;
      setPreencheSozinha(Math.abs(daFoto - daTela) < 0.02);
    };
    if (im.complete) checa();
    im.addEventListener("load", checa);
    return () => im.removeEventListener("load", checa);
  }, [src]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduzir ? 0.2 : 0.9, ease: "easeInOut" }}
      /* `translateZ(0)` poe este painel numa camada propria da placa de video.
         E o que permite ao Safari animar a opacidade sem redesenhar a foto (e
         o desfoque) a cada quadro — a diferenca entre uma transicao suave e um
         corte seco no iPad do Felipe. */
      style={{ transform: "translateZ(0)", willChange: "opacity" }}
      className="absolute inset-0 overflow-hidden bg-ink"
    >
      {/* O preenchimento das laterais: a mesma foto, esticada para cobrir,
          borrada e ampliada (a ampliacao existe porque o desfoque puxa a cor
          de fora da imagem para dentro e deixaria uma moldura clara na
          beirada).
          ⚠️ ESTATICO. Nao ha animacao nenhuma aqui — ver o comentario da foto
          da frente. Desfoque so custa caro quando muda; parado, o Safari
          desenha uma vez e guarda. */}
      {!preencheSozinha && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl"
          draggable={false}
        />
      )}

      {/* A foto de verdade, inteira e PARADA.
       *
       * ⚠️ O zoom saiu por ordem do Felipe em 05/09, e a razao e o aparelho:
       * "fica travando o tablet e bem lento". Faz sentido — o iPad dele e de
       * 5a geracao (A9, 2017), e animar a escala de uma imagem de tela cheia
       * obriga o Safari a **re-rasterizar** a imagem a cada quadro; com o
       * fundo desfocado em 40px por baixo, duas vezes. O aparelho engasgava, e
       * com ele engasgado o navegador tambem **pulava a transicao**, que foi a
       * outra queixa dele. Os dois defeitos eram o mesmo defeito.
       *
       * O que sobra e so opacidade, que a placa de video faz sozinha sem tocar
       * na imagem. Se um dia alguem quiser movimento de novo aqui, medir NO
       * IPAD antes — no Chrome desta maquina o zoom rodava liso.
       *
       * A sombra (`drop-shadow`) saiu junto, pelo mesmo motivo: e um filtro
       * sobre a imagem inteira, da mesma familia cara do desfoque. */}
      <img
        src={src}
        alt=""
        decoding="async"
        ref={fotoRef}
        className="relative h-full w-full object-contain"
        draggable={false}
      />
    </motion.div>
  );
}

/* ===========================================================================
   OS PAINEIS DE QR DA VITRINE
   ===========================================================================
   Cada rede com a propria cara, e nao um molde generico com o texto trocado:
   o cliente reconhece o Instagram pelo degrade antes de ler qualquer palavra.

   Os simbolos sao DESENHADOS aqui em SVG, nao baixados: o iPad tem que abrir
   sem rede, e um logo que nao carrega e um buraco branco no meio do balcao.
   =========================================================================== */

/** A camera do Instagram: quadrado arredondado, circulo, e o ponto do flash. */
function MarcaInstagram() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <rect
        x="5" y="5" width="38" height="38" rx="12"
        fill="none" stroke="currentColor" strokeWidth="3.4"
      />
      <circle cx="24" cy="24" r="9.5" fill="none" stroke="currentColor" strokeWidth="3.4" />
      <circle cx="35" cy="13" r="2.6" fill="currentColor" />
    </svg>
  );
}

/**
 * O anel de quatro cores do Google.
 *
 * E um anel, nao o "G": desenhar o logo de outra empresa de cabeca da um
 * desenho quase certo, e quase certo num cartaz le como falsificado. O anel
 * nas quatro cores e reconhecido na hora e nao finge ser o que nao e.
 */
function MarcaGoogle() {
  const arco = (cor: string, deGrau: number, ateGrau: number) => {
    const r = 20, cx = 24, cy = 24;
    const p = (g: number) => [
      cx + r * Math.cos((g * Math.PI) / 180),
      cy + r * Math.sin((g * Math.PI) / 180),
    ];
    const [x1, y1] = p(deGrau);
    const [x2, y2] = p(ateGrau);
    return (
      <path
        key={cor}
        d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
        fill="none" stroke={cor} strokeWidth="6.5" strokeLinecap="round"
      />
    );
  };
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      {arco("#EA4335", 200, 285)}
      {arco("#FBBC05", 110, 190)}
      {arco("#34A853", 20, 100)}
      {arco("#4285F4", 295, 370)}
    </svg>
  );
}

function Estrelas({ atraso }: { atraso: number }) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4].map((n) => (
        <motion.svg
          key={n}
          viewBox="0 0 24 24"
          className="h-[clamp(1.8rem,4.4vh,3rem)] w-[clamp(1.8rem,4.4vh,3rem)]"
          initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -40 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{
            delay: atraso + n * 0.11,
            type: "spring",
            stiffness: 320,
            damping: 14,
          }}
        >
          <path
            d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"
            fill="#FBBC05"
          />
        </motion.svg>
      ))}
    </div>
  );
}

function PainelQR({ painel }: { painel: Extract<PainelVitrine, { url: string }> }) {
  const svg = useMemo(() => svgDoQR(painel.url), [painel.url]);
  const reduzir = useReducedMotion();
  const insta = painel.tipo === "instagram";

  // Cada filho entra atras do outro, de cima para baixo. Um painel que aparece
  // inteiro de uma vez le como slide; escalonado, le como algo sendo montado.
  const container = {
    fora: { opacity: 0 },
    dentro: {
      opacity: 1,
      transition: { staggerChildren: reduzir ? 0 : 0.09, delayChildren: 0.12 },
    },
    saindo: { opacity: 0, transition: { duration: 0.35 } },
  };
  const item = {
    fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 26 },
    dentro: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 260, damping: 24 },
    },
  };

  return (
    <motion.div
      variants={container}
      initial="fora"
      animate="dentro"
      exit="saindo"
      className="absolute inset-0 overflow-hidden"
    >
      {/* ── O fundo, que e o que da a identidade ─────────────────────────── */}
      {insta ? (
        <>
          {/* O degrade do Instagram em DUAS camadas, e nao num `conic` so.
              ⚠️ A primeira versao era um cone girando: o quente (amarelo e
              laranja) caia fora da tela e sobrava so roxo — deixou de parecer
              Instagram. Aqui a base roxa e fixa e o calor e um brilho ancorado
              no canto de baixo a esquerda, que e onde ele vive na marca. */}
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#4F5BD5_0%,#962FBF_38%,#D62976_70%,#F56040_100%)]" />
          <div className="absolute inset-0 animate-[brilhoInsta_16s_ease-in-out_infinite] bg-[radial-gradient(58%_58%_at_10%_92%,#FEDA75_0%,#FA7E1E_32%,rgba(214,41,118,0)_68%)]" />
          <div className="absolute inset-0 bg-black/10" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-cream-soft" />
          {/* As quatro cores do Google como um brilho de fundo, bem discreto. */}
          <div className="absolute inset-0 bg-[radial-gradient(48%_38%_at_16%_12%,rgba(66,133,244,.20),transparent_70%),radial-gradient(44%_36%_at_86%_16%,rgba(234,67,53,.18),transparent_70%),radial-gradient(46%_38%_at_84%_88%,rgba(52,168,83,.18),transparent_70%),radial-gradient(42%_34%_at_14%_86%,rgba(251,188,5,.22),transparent_70%)]" />
        </>
      )}

      {/* ── O conteudo, dentro de um cartao ──────────────────────────────────
          O cartao nao e enfeite: sem ele o texto flutua solto sobre a cor e a
          tela le como um fundo de tela, nao como um convite. */}
      <div className="relative flex h-full items-center justify-center p-[clamp(1rem,3vh,2.5rem)]">
        <motion.div
          variants={item}
          className={`flex w-full max-w-[min(88%,34rem)] flex-col items-center gap-[clamp(.55rem,1.7vh,1.2rem)] rounded-[2.5rem] px-[clamp(1.2rem,4vw,3rem)] py-[clamp(1.1rem,3.2vh,2.4rem)] text-center ${
            insta
              ? "border border-white/25 bg-white/12 text-white shadow-[0_30px_80px_rgba(0,0,0,.30)] backdrop-blur-md"
              : "bg-white text-ink shadow-[0_28px_70px_rgba(60,64,67,.20)] ring-1 ring-black/[0.06]"
          }`}
        >
          <motion.div
            variants={item}
            className={`h-[clamp(3rem,8vh,5rem)] w-[clamp(3rem,8vh,5rem)] ${
              insta ? "text-white" : ""
            }`}
          >
            {insta ? <MarcaInstagram /> : <MarcaGoogle />}
          </motion.div>

          <motion.p
            variants={item}
            className="font-display text-[clamp(2.2rem,6.6vh,4.2rem)] leading-none"
          >
            {insta ? "Follow us" : "Hat's geschmeckt?"}
          </motion.p>

          <motion.p
            variants={item}
            className={`text-[clamp(1rem,2.6vh,1.6rem)] ${
              insta ? "text-white/85" : "text-ink-muted"
            }`}
          >
            {insta
              ? "Neue Sorten, Fotos und wo wir als Nächstes stehen"
              : "Deine Bewertung hilft uns weiter"}
          </motion.p>

          {!insta && (
            <motion.div variants={item}>
              <Estrelas atraso={0.5} />
            </motion.div>
          )}

          {/* O QR. Branco sempre e com margem propria: QR sobre cor nao le em
              camera de celular a meio metro, e este e o unico elemento da tela
              que precisa FUNCIONAR, nao so ser bonito. */}
          <motion.div
            variants={item}
            className="rounded-[1.6rem] bg-white p-[clamp(.55rem,1.4vh,1rem)] shadow-[0_10px_30px_rgba(0,0,0,.18)]"
          >
            <div
              className="h-[clamp(8rem,26vh,14rem)] w-[clamp(8rem,26vh,14rem)] [&>svg]:h-full [&>svg]:w-full"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </motion.div>

          <motion.p
            variants={item}
            className={
              insta
                ? "rounded-full bg-white/20 px-6 py-2 text-[clamp(1rem,2.7vh,1.7rem)] font-semibold tracking-wide"
                : "text-[clamp(1rem,2.7vh,1.6rem)] font-semibold text-ink"
            }
          >
            {insta ? "@sunbite.ch" : "Bewertet uns auf Google"}
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * O codigo de pareamento.
 *
 * ⚠️ **So aparece quando NAO ha conexao.** Pedido do Felipe em 27/08, e ele
 * esta certo: o codigo e um numero de configuracao, e o cliente na frente do
 * iPad nao tem nada que ver isso. Ligado, some. Caiu a conexao ou ainda nao
 * pareou, volta — que e exatamente o momento em que alguem precisa dele.
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
    <AnimatePresence>
      {conexao !== "ligado" && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.4 }}
          className="absolute bottom-6 left-6 rounded-2xl bg-black/55 px-5 py-3 text-cream backdrop-blur-sm"
        >
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Code</p>
          <p className="font-display text-4xl tabular-nums leading-tight">{codigo}</p>
          <p className="text-xs opacity-70">
            {conexao === "ligando" ? "verbindet…" : "keine Verbindung"}
          </p>
          {/* Trocar o codigo e deliberado, nunca acidental: so por toque, e so
              aqui. E a saida para um par antigo que ficou pendurado. */}
          <button
            onClick={onTrocar}
            className="mt-1 text-[11px] underline underline-offset-2 opacity-50"
          >
            neuer Code
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ===========================================================================
   O PAINEL DO TWINT — entra no lugar do video
   ===========================================================================
   Decisao do Felipe, 27/08: na hora do QR o pedido **fica na tela** e apenas
   encolhe um pouco; o QR aparece suavemente onde estava o video. Antes disso
   o iPad trocava de tela inteira e o cliente perdia de vista o que estava
   pagando bem na hora de pagar.
   =========================================================================== */

function PainelTwint({ total }: { total: number }) {
  // O SVG e montado dentro do iPad, sem rede: o payload do QR suico e texto
  // puro. `useMemo` porque so muda quando o valor muda.
  const svg = useMemo(() => qrDoValor(total), [total]);
  const reduzir = useReducedMotion();

  const item = {
    fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 24 },
    dentro: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 250, damping: 24 },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: { staggerChildren: reduzir ? 0 : 0.1, delayChildren: 0.1 },
      }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      className="absolute inset-0 overflow-hidden bg-brand-dark"
    >
      {/* Um brilho quente atras, para o painel nao ser um retangulo escuro. */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_18%,rgba(201,138,46,.28),transparent_72%),radial-gradient(60%_50%_at_50%_100%,rgba(132,20,18,.55),transparent_70%)]" />
      <Boiando />

      <div className="relative flex h-full flex-col items-center justify-center gap-[clamp(.5rem,1.8vh,1.2rem)] px-[clamp(1rem,3vw,2.5rem)] text-center">
        <motion.p
          variants={item}
          className="text-[clamp(.8rem,2.2vh,1.3rem)] uppercase tracking-[0.34em] text-cream/60"
        >
          TWINT
        </motion.p>

        <motion.p
          variants={item}
          className="font-display text-[clamp(2.2rem,7.5vh,4.4rem)] leading-none tabular-nums text-cream"
        >
          {money(total)}
        </motion.p>

        {svg ? (
          <>
            {/* O QR entra com uma virada curta: e o gesto de "aqui esta".
                Branco sempre — QR sobre cor nao le em camera a meio metro. */}
            <motion.div
              initial={
                reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.82, rotate: -6 }
              }
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.24 }}
              className="relative rounded-[1.8rem] bg-white p-[clamp(.6rem,1.6vh,1.1rem)] shadow-[0_26px_64px_rgba(0,0,0,.42)]"
            >
              <div
                className="h-[clamp(8rem,32vh,17rem)] w-[clamp(8rem,32vh,17rem)] [&>svg]:h-full [&>svg]:w-full"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {/* Um morango pendurado no canto do cartao. Sutil, mas e o que
                  faz o QR ser da Sunbite e nao de um caixa qualquer. */}
              <span className="absolute -right-3 -top-4 rotate-12 text-[clamp(1.4rem,3.4vh,2.2rem)] drop-shadow">
                🍓
              </span>
            </motion.div>

            <motion.p
              variants={item}
              className="text-[clamp(.85rem,2.4vh,1.4rem)] text-cream/75"
            >
              Scannen und bezahlen
            </motion.p>
          </>
        ) : TWINT_NUMERO ? (
          // Sem IBAN nao ha QR, mas ha numero: o cliente abre o TWINT, escolhe
          // enviar e digita. Numero grande, porque ele vai ser lido de pe, a
          // meio metro, e copiado a mao no aparelho de outra pessoa.
          <motion.div
            variants={item}
            className="mt-1 rounded-[1.8rem] border border-cream/20 bg-cream/10 px-[clamp(1.2rem,4vw,2.6rem)] py-[clamp(.9rem,2.6vh,1.6rem)]"
          >
            <p className="text-[clamp(.75rem,2vh,1.1rem)] uppercase tracking-[0.24em] text-cream/60">
              An diese Nummer senden
            </p>
            <p className="mt-2 font-display text-[clamp(1.8rem,6vh,3.4rem)] leading-none tabular-nums whitespace-nowrap text-cream">
              {TWINT_NUMERO}
            </p>
            <p className="mt-3 text-[clamp(.85rem,2.2vh,1.2rem)] leading-snug text-cream/70">
              TWINT öffnen · Senden · Nummer eingeben
            </p>
          </motion.div>
        ) : (
          // Nem IBAN nem numero: o display DIZ isso, em vez de desenhar um
          // codigo que nao leva a lugar nenhum. Ver `config.ts`.
          <motion.div
            variants={item}
            className="mt-2 max-w-[22rem] rounded-[1.6rem] border border-cream/20 bg-cream/10 px-6 py-5"
          >
            <p className="text-[clamp(1rem,2.8vh,1.6rem)] leading-snug text-cream/85">
              Bitte den QR-Code am Stand scannen.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ===========================================================================
   O BLOCO DE PAGAMENTO — entra por baixo do pedido
   ===========================================================================
   No dinheiro e onde o troco aparece, e ele e o maior numero da tela: e o
   ponto que mais gera discussao num balcao. No TWINT e so uma linha curta
   apontando para o QR, porque o QR ja esta do lado.
   =========================================================================== */

function BlocoPagamento({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "pagamento" }>;
}) {
  const reduzir = useReducedMotion();
  const dinheiro = estado.payment === "cash";
  const troco =
    estado.recebido !== null ? Math.max(0, estado.recebido - estado.total) : null;

  return (
    <motion.div
      initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="mt-[clamp(.4rem,1.2vh,.9rem)]"
    >
      <FioDeChocolate />

      {dinheiro ? (
        <div className="pt-[clamp(.4rem,1.2vh,.9rem)]">
          <div className="flex items-baseline justify-between gap-3 text-[clamp(.85rem,2.2vh,1.25rem)] text-cream/70">
            <span>Bar bezahlen</span>
            {estado.recebido !== null && (
              <span className="tabular-nums">
                Erhalten {money(estado.recebido)}
              </span>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {troco !== null ? (
              <motion.div
                key={troco}
                initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="mt-[clamp(.3rem,1vh,.6rem)] flex items-center justify-between gap-4 rounded-[1.4rem] bg-cream px-[clamp(.9rem,2.5vw,1.8rem)] py-[clamp(.5rem,1.6vh,1rem)] text-brand-dark"
              >
                <span className="text-[clamp(.75rem,2vh,1.15rem)] uppercase tracking-[0.2em] opacity-60">
                  Rückgeld
                </span>
                <span className="font-display text-[clamp(2rem,8vh,4.5rem)] leading-none tabular-nums">
                  {money(troco)}
                </span>
              </motion.div>
            ) : (
              <motion.p
                key="esperando"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-[clamp(.3rem,1vh,.6rem)] text-[clamp(.85rem,2.3vh,1.3rem)] text-cream/45"
              >
                Bitte den Betrag geben — das Rückgeld erscheint hier.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      ) : (
        // TWINT: o QR ja esta a esquerda, entao aqui so a seta que leva o olho
        // ate ele. Repetir o valor seria dizer o mesmo numero duas vezes.
        <motion.div
          initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 240, damping: 22 }}
          className="mt-[clamp(.4rem,1.2vh,.9rem)] flex items-center gap-3 rounded-[1.4rem] bg-cream/10 px-[clamp(.9rem,2.5vw,1.6rem)] py-[clamp(.5rem,1.5vh,.9rem)]"
        >
          <motion.span
            aria-hidden="true"
            animate={reduzir ? {} : { x: [0, -7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="text-[clamp(1.1rem,3vh,1.8rem)] text-cream/70"
          >
            ←
          </motion.span>
          <span className="text-[clamp(.9rem,2.4vh,1.35rem)] text-cream/80">
            Mit TWINT bezahlen
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ===========================================================================
   O PEDIDO MONTANDO
   ===========================================================================
   Decisao do Felipe em 27/08: **conta aberta**. Cada copo numa linha, os
   toppings dele listados dentro, e o preco daquele copo a direita. O cliente
   confere sozinho e nao precisa perguntar de onde veio o total.

   As animacoes nao sao enfeite: um copo que ENTRA na lista confirma para o
   cliente que o toque da Romana virou alguma coisa. Lista que so aparece
   maior nao comunica nada.

   O mesmo componente serve o pedido E o pagamento — e essa reutilizacao que
   faz a lista NAO piscar quando a Romana escolhe a forma de pagamento: e o
   mesmo elemento, so com um bloco novo embaixo.
   =========================================================================== */

function ListaPedido({
  cups,
  total,
  precoCopo,
  precoTopping,
  rodape,
}: {
  cups: Cup[];
  total: number;
  precoCopo?: number;
  precoTopping?: number;
  /** O que entra por baixo da lista. No pagamento, o troco ou o aviso do QR. */
  rodape: React.ReactNode;
}) {
  const lista = useRef<HTMLUListElement>(null);
  const reduzir = useReducedMotion();

  // Rola para o copo que acabou de entrar. Achado no teste com 8 copos: sem
  // isto o cliente ficava olhando o Becher 1 enquanto a Romana montava o 8 —
  // a tela mostrava o comeco do pedido, nao o que estava acontecendo.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [cups.length]);

  /** Sem preco no payload (celular desatualizado), a linha mostra so o nome. */
  const temPreco = typeof precoCopo === "number" && typeof precoTopping === "number";
  const precoDo = (n: number) => (precoCopo ?? 0) + n * (precoTopping ?? 0);
  const toppings = cups.reduce((n, c) => n + c.toppings.length, 0);

  return (
    <div className="flex h-full flex-col px-[clamp(1.2rem,3vw,2.6rem)] py-[clamp(1rem,2.6vh,2rem)]">
      {/* ── Cabecalho ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-baseline justify-between gap-4">
        <h1 className="font-display text-[clamp(1.6rem,4.6vh,2.8rem)] leading-none text-cream">
          Ihre Bestellung
        </h1>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={cups.length}
            initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="rounded-full bg-cream/15 px-4 py-1 text-[clamp(.75rem,2vh,1.1rem)] tabular-nums text-cream/80"
          >
            {cups.length} Becher
          </motion.span>
        </AnimatePresence>
      </div>

      {/* ── As linhas do pedido ───────────────────────────────────────────── */}
      <ul
        ref={lista}
        className="mt-[clamp(.7rem,2vh,1.4rem)] min-h-0 flex-1 space-y-[clamp(.45rem,1.2vh,.8rem)] overflow-y-auto pr-1"
      >
        <AnimatePresence initial={false}>
          {cups.map((c, i) => (
            <motion.li
              key={c.id}
              layout
              initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, x: -40, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="flex items-start gap-[clamp(.5rem,1.4vw,1rem)] rounded-[1.3rem] bg-cream/[0.09] px-[clamp(.7rem,1.6vw,1.3rem)] py-[clamp(.5rem,1.4vh,.9rem)]"
            >
              {/* O numero do copo num circulo: da a linha um ponto de ancora
                  e deixa claro que sao copos separados, nao uma lista solta. */}
              <span className="mt-[2px] grid h-[clamp(1.7rem,4vh,2.7rem)] w-[clamp(1.7rem,4vh,2.7rem)] shrink-0 place-items-center rounded-full bg-cream text-brand-dark">
                <span className="font-display text-[clamp(.85rem,2.2vh,1.4rem)] leading-none">
                  {i + 1}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[clamp(1.05rem,3vh,1.9rem)] leading-tight text-cream">
                    🍓 Becher
                  </span>
                  {temPreco && (
                    <span className="shrink-0 font-display text-[clamp(.95rem,2.7vh,1.65rem)] tabular-nums text-cream/85">
                      {money(precoDo(c.toppings.length))}
                    </span>
                  )}
                </span>

                {/* Os toppings como fichas. Cada uma entra com um estalo: e o
                    retorno visual do toque que a Romana acabou de dar. */}
                <span className="mt-[clamp(.2rem,.7vh,.45rem)] flex flex-wrap gap-[clamp(.2rem,.6vh,.4rem)]">
                  <AnimatePresence initial={false}>
                    {c.toppings.length === 0 ? (
                      <motion.span
                        key="puro"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[clamp(.7rem,1.9vh,1.05rem)] text-cream/45"
                      >
                        ohne Topping
                      </motion.span>
                    ) : (
                      c.toppings.map((x, n) => (
                        <motion.span
                          key={`${x}-${n}`}
                          layout
                          initial={
                            reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.4 }
                          }
                          animate={{ opacity: 1, scale: 1 }}
                          exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                          transition={{ type: "spring", stiffness: 500, damping: 22 }}
                          className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-[clamp(.4rem,1vw,.75rem)] py-[clamp(.08rem,.4vh,.28rem)] text-[clamp(.7rem,1.9vh,1.1rem)] text-cream/90"
                        >
                          <span aria-hidden="true">{toppingEmoji(x)}</span>
                          {de(`topping.${x}`)}
                        </motion.span>
                      ))
                    )}
                  </AnimatePresence>
                </span>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* ── O rodape com a conta ──────────────────────────────────────────── */}
      <motion.div
        layout
        className="mt-[clamp(.6rem,1.8vh,1.2rem)] shrink-0 border-t border-cream/20 pt-[clamp(.6rem,1.8vh,1.2rem)]"
      >
        {temPreco && (
          <div className="flex justify-between gap-4 text-[clamp(.75rem,1.9vh,1.05rem)] text-cream/55">
            <span>
              {cups.length} × Becher {money(precoCopo!)}
            </span>
            {toppings > 0 && (
              <span className="tabular-nums">
                {toppings} × Topping {money(precoTopping!)}
              </span>
            )}
          </div>
        )}
        <div className="mt-[clamp(.2rem,.8vh,.6rem)] flex items-baseline justify-between gap-4">
          <span className="text-[clamp(.8rem,2.2vh,1.4rem)] uppercase tracking-[0.2em] text-cream/60">
            Total
          </span>
          {/* O total troca com uma virada curta: o numero MUDOU, e o cliente
              tem que perceber que mudou. */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={total}
              initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -22 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="font-display text-[clamp(1.8rem,6.8vh,4rem)] leading-none tabular-nums text-cream"
            >
              {money(total)}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* O bloco de pagamento entra AQUI, embaixo, sem tirar nada da tela. */}
      <div className="shrink-0">{rodape}</div>
    </div>
  );
}

/** A subida calma das linhas do "Danke", igual para as tres. */
function subirCalmo(reduzir: boolean | null) {
  return {
    fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 24 },
    dentro: {
      opacity: 1,
      y: 0,
      transition: { duration: reduzir ? 0 : 0.8, ease: "easeOut" as const },
    },
  };
}

function Obrigado({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "obrigado" }>;
}) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial="fora"
      animate="dentro"
      exit="saindo"
      variants={{
        fora: { opacity: 0 },
        /* Calmo de proposito: 0.9s para o fundo aparecer, e so depois os
           filhos, um a um. O "Danke" e o unico momento da tela em que ninguem
           esta esperando nada — e o lugar certo para ir devagar. */
        dentro: {
          opacity: 1,
          transition: {
            duration: reduzir ? 0 : 0.9,
            ease: "easeOut",
            delayChildren: reduzir ? 0 : 0.35,
            staggerChildren: reduzir ? 0 : 0.16,
          },
        },
        saindo: { opacity: 0, transition: { duration: reduzir ? 0 : 0.7 } },
      }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[clamp(.6rem,2.4vh,1.4rem)] overflow-hidden bg-brand-dark p-8 text-center"
    >
      {/* Sem este brilho o obrigado em tela cheia vira um retangulo escuro —
          o que em 1024x768 e muito retangulo escuro. */}
      <div className="absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_28%,rgba(201,138,46,.30),transparent_72%),radial-gradient(60%_50%_at_50%_100%,rgba(132,20,18,.55),transparent_70%)]" />
      <Boiando />
      <motion.p
        variants={{
          fora: reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.82 },
          dentro: {
            opacity: 1,
            scale: 1,
            /* Mola macia, nao pulo. A anterior (rigidez 260, amortecimento 12)
               dava um quique de brinquedo — o Felipe pediu calma. */
            transition: { type: "spring", stiffness: 90, damping: 20 },
          },
        }}
        className="relative text-[clamp(4rem,11vh,7rem)] leading-none"
      >
        🍓
      </motion.p>
      {/* Subida curta e longa no tempo: 0.8s de `easeOut` le como "assentar",
          e nao como "aparecer". Os tres usam a mesma, escalonados pelo pai. */}
      <motion.p
        variants={subirCalmo(reduzir)}
        className="relative font-display text-[clamp(3.5rem,13vh,7.5rem)] leading-none"
      >
        Danke!
      </motion.p>
      <motion.p
        variants={subirCalmo(reduzir)}
        className="relative font-display text-[clamp(1.6rem,5vh,2.8rem)] tabular-nums text-cream/75"
      >
        {money(estado.total)}
      </motion.p>
      <motion.p
        variants={subirCalmo(reduzir)}
        className="relative text-[clamp(1rem,3vh,1.6rem)] text-cream/55"
      >
        Bis zum nächsten Mal.
      </motion.p>
    </motion.div>
  );
}
