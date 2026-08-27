import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, toppingEmoji } from "../config";
import { STRINGS } from "../i18n";
import { loadConfig } from "../sync";
import { CARTAZ_REPOUSO, VIDEO_REPOUSO } from "./config";
import { qrDoValor, svgDoQR } from "./qr";
import {
  OBRIGADO_MS,
  VITRINE_PADRAO,
  codigoDoDisplay,
  paineis,
  trocarCodigo,
  type EstadoDisplay,
  type PainelVitrine,
  type Vitrine,
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

  const repouso = estado.kind === "repouso";

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
    <div className="flex h-full w-full overflow-hidden bg-brand-dark text-cream">
      {/* O video NUNCA desmonta — so muda de largura. Remontar reiniciaria o
          arquivo do zero a cada pedido, e um video que pisca a cada cliente e
          pior que nenhum video. E a diferenca entre uma barraca viva e um
          caixa de supermercado. */}
      <motion.div
        className="relative shrink-0 overflow-hidden"
        animate={{ width: repouso ? "100%" : "34%" }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      >
        <Video />
        {/* O rodizio da vitrine so existe no repouso. Durante a venda o video
            volta sozinho: um QR do Instagram por cima do pedido seria roubar a
            atencao de quem esta pagando. */}
        {repouso && <Rodizio vitrine={vitrine} />}
        {repouso && (
          <Pareamento
            codigo={codigo}
            conexao={conexao}
            onTrocar={() => setCodigo(trocarCodigo())}
          />
        )}
      </motion.div>

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

  // Sem arquivo de video ainda: uma cena que se mexe, feita so de CSS.
  //
  // Nao e o video definitivo e nem tenta ser — e o lugar dele, ocupado por
  // algo vivo. Tela parada num balcao le como aparelho travado, e um cartaz
  // imovel por 30 segundos e pior que nada. Zero bytes de download, roda no
  // Safari do iPad sem codec nenhum. Trocar pelo video de verdade continua
  // sendo **uma linha** em `config.ts`.
  if (!VIDEO_REPOUSO) return <CenaPlaceholder />;

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

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-cream">
        <span className="animate-[pulsar_6s_ease-in-out_infinite] text-[clamp(4rem,14vh,9rem)] leading-none">
          🍓
        </span>
        <p className="font-display text-[clamp(2.5rem,9vh,5.5rem)] leading-none">
          Sunbite
        </p>
        <p className="text-[clamp(.9rem,2.2vh,1.4rem)] tracking-[0.35em] text-cream/70">
          ERDBEEREN MIT SCHOKOLADE
        </p>
      </div>
    </div>
  );
}

/**
 * O rodizio da vitrine: video → Instagram → Google → video…
 *
 * Fica POR CIMA do video, e o video nunca desmonta por baixo. Trocar de
 * painel remontando o `<video>` reiniciaria o arquivo a cada volta, e um
 * video que recomeca do zero a cada 40 segundos e pior que nenhum.
 *
 * O painel de video e simplesmente "nao mostrar nada aqui" — o que aparece e
 * o video que ja estava rodando. Por isso o `AnimatePresence` fica aqui e nao
 * dentro do painel: e ele que faz o QR entrar e sair por cima do video.
 */
function Rodizio({ vitrine }: { vitrine: Vitrine }) {
  // A chave e o conteudo, nao o objeto: e o que garante que o rodizio so
  // recomeca quando o Felipe muda de verdade a vitrine nos Ajustes.
  const chave = JSON.stringify(vitrine);
  const lista = useMemo(() => paineis(vitrine), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [chave]);

  useEffect(() => {
    if (lista.length < 2) return; // um painel so nao reveza
    const atual = lista[i % lista.length];
    const id = window.setTimeout(
      () => setI((n) => (n + 1) % lista.length),
      atual.segundos * 1000,
    );
    return () => window.clearTimeout(id);
  }, [i, lista]);

  const painel = lista[i % lista.length];

  return (
    <AnimatePresence mode="wait">
      {painel && painel.tipo !== "video" && (
        <PainelQR key={`${painel.tipo}-${i}`} painel={painel} />
      )}
    </AnimatePresence>
  );
}

/* ===========================================================================
   OS PAINEIS DE QR
   ===========================================================================
   Cada rede com a propria cara, e nao um molde generico com o texto trocado:
   o cliente reconhece o Instagram pelo degrade antes de ler qualquer palavra,
   e isso e metade do trabalho de um cartaz. Pedido do Felipe em 27/08.

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
  const arco = (cor: string, de: number, ate: number) => {
    const r = 20, cx = 24, cy = 24;
    const p = (g: number) => [
      cx + r * Math.cos((g * Math.PI) / 180),
      cy + r * Math.sin((g * Math.PI) / 180),
    ];
    const [x1, y1] = p(de);
    const [x2, y2] = p(ate);
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
          tela le como um fundo de tela, nao como um convite. Com moldura, le
          como cartaz — que e o que ele e. No Instagram o cartao e de vidro
          (deixa o degrade passar); no Google e branco solido, que e a
          linguagem deles. */}
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
   O PEDIDO MONTANDO
   ===========================================================================
   Decisao do Felipe em 27/08: **conta aberta**. Cada copo numa linha, os
   toppings dele listados dentro, e o preco daquele copo a direita. O cliente
   confere sozinho e nao precisa perguntar de onde veio o total.

   As animacoes nao sao enfeite: um copo que ENTRA na lista confirma para o
   cliente que o toque da Romana virou alguma coisa. Lista que so aparece
   maior nao comunica nada.
   =========================================================================== */

function Pedido({
  estado,
}: {
  estado: Extract<EstadoDisplay, { kind: "pedido" }>;
}) {
  const lista = useRef<HTMLUListElement>(null);
  const reduzir = useReducedMotion();

  // Rola para o copo que acabou de entrar. Achado no teste com 8 copos: sem
  // isto o cliente ficava olhando o Becher 1 enquanto a Romana montava o 8 —
  // a tela mostrava o comeco do pedido, nao o que estava acontecendo.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [estado.cups.length]);

  const precoCopo = estado.precoCopo;
  const precoTopping = estado.precoTopping;
  /** Sem preco no payload (celular desatualizado), a linha mostra so o nome. */
  const temPreco = typeof precoCopo === "number" && typeof precoTopping === "number";
  const precoDo = (n: number) => (precoCopo ?? 0) + n * (precoTopping ?? 0);

  const toppings = estado.cups.reduce((n, c) => n + c.toppings.length, 0);

  return (
    <div className="flex h-full flex-col px-[clamp(1.5rem,3.5vw,3rem)] py-[clamp(1.2rem,3vh,2.2rem)]">
      {/* ── Cabecalho ─────────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[clamp(1.8rem,5vh,3rem)] leading-none text-cream">
          Ihre Bestellung
        </h1>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={estado.cups.length}
            initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="rounded-full bg-cream/15 px-4 py-1 text-[clamp(.8rem,2.2vh,1.15rem)] tabular-nums text-cream/80"
          >
            {estado.cups.length} {estado.cups.length === 1 ? "Becher" : "Becher"}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* ── As linhas do pedido ───────────────────────────────────────────── */}
      <ul
        ref={lista}
        className="mt-[clamp(.8rem,2.5vh,1.6rem)] min-h-0 flex-1 space-y-[clamp(.5rem,1.4vh,.9rem)] overflow-y-auto pr-1"
      >
        <AnimatePresence initial={false}>
          {estado.cups.map((c, i) => (
            <motion.li
              key={c.id}
              layout
              initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, x: -40, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="flex items-start gap-[clamp(.6rem,1.6vw,1.1rem)] rounded-[1.4rem] bg-cream/[0.09] px-[clamp(.8rem,1.8vw,1.4rem)] py-[clamp(.6rem,1.6vh,1rem)]"
            >
              {/* O numero do copo num circulo: da a linha um ponto de ancora
                  e deixa claro que sao copos separados, nao uma lista solta. */}
              <span className="mt-[2px] grid h-[clamp(1.9rem,4.4vh,2.9rem)] w-[clamp(1.9rem,4.4vh,2.9rem)] shrink-0 place-items-center rounded-full bg-cream text-brand-dark">
                <span className="font-display text-[clamp(.95rem,2.4vh,1.5rem)] leading-none">
                  {i + 1}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[clamp(1.15rem,3.2vh,2rem)] leading-tight text-cream">
                    🍓 Becher
                  </span>
                  {temPreco && (
                    <span className="shrink-0 font-display text-[clamp(1.05rem,2.9vh,1.75rem)] tabular-nums text-cream/85">
                      {money(precoDo(c.toppings.length))}
                    </span>
                  )}
                </span>

                {/* Os toppings como fichas. Cada uma entra com um estalo: e o
                    retorno visual do toque que a Romana acabou de dar. */}
                <span className="mt-[clamp(.25rem,.8vh,.5rem)] flex flex-wrap gap-[clamp(.25rem,.7vh,.45rem)]">
                  <AnimatePresence initial={false}>
                    {c.toppings.length === 0 ? (
                      <motion.span
                        key="puro"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[clamp(.75rem,2vh,1.1rem)] text-cream/45"
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
                          className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-[clamp(.45rem,1.1vw,.8rem)] py-[clamp(.1rem,.5vh,.3rem)] text-[clamp(.75rem,2vh,1.15rem)] text-cream/90"
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
      <div className="mt-[clamp(.7rem,2vh,1.4rem)] border-t border-cream/20 pt-[clamp(.7rem,2vh,1.4rem)]">
        {temPreco && (
          <div className="flex justify-between gap-4 text-[clamp(.8rem,2.1vh,1.15rem)] text-cream/55">
            <span>
              {estado.cups.length} × Becher {money(precoCopo!)}
            </span>
            {toppings > 0 && (
              <span className="tabular-nums">
                {toppings} × Topping {money(precoTopping!)}
              </span>
            )}
          </div>
        )}
        <div className="mt-[clamp(.3rem,1vh,.7rem)] flex items-baseline justify-between gap-4">
          <span className="text-[clamp(.9rem,2.4vh,1.5rem)] uppercase tracking-[0.2em] text-cream/60">
            Total
          </span>
          {/* O total troca com uma virada curta: o numero MUDOU, e o cliente
              tem que perceber que mudou. */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={estado.total}
              initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -22 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="font-display text-[clamp(2rem,7.5vh,4.5rem)] leading-none tabular-nums text-cream"
            >
              {money(estado.total)}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="mt-2 w-full rounded-3xl bg-cream px-8 py-6 text-brand-dark"
          >
            <p className="text-lg uppercase tracking-[0.2em] opacity-60">
              Rückgeld
            </p>
            <p className="font-display text-[clamp(3rem,12vw,7rem)] leading-none tabular-nums">
              {money(Math.max(0, troco ?? 0))}
            </p>
          </motion.div>
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
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial="fora"
      animate="dentro"
      variants={{
        fora: { opacity: 0 },
        dentro: { opacity: 1, transition: { staggerChildren: reduzir ? 0 : 0.1 } },
      }}
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <motion.p
        variants={{
          fora: reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.4 },
          dentro: {
            opacity: 1,
            scale: 1,
            transition: { type: "spring", stiffness: 260, damping: 12 },
          },
        }}
        className="text-[6rem] leading-none"
      >
        🍓
      </motion.p>
      <motion.p
        variants={{
          fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 20 },
          dentro: { opacity: 1, y: 0 },
        }}
        className="font-display text-[clamp(3rem,9vw,6rem)] leading-none"
      >
        Danke!
      </motion.p>
      <motion.p
        variants={{
          fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 20 },
          dentro: { opacity: 1, y: 0 },
        }}
        className="text-2xl text-cream/70"
      >
        {money(estado.total)}
      </motion.p>
      <motion.p
        variants={{
          fora: reduzir ? { opacity: 0 } : { opacity: 0, y: 20 },
          dentro: { opacity: 1, y: 0 },
        }}
        className="text-xl text-cream/50"
      >
        Bis zum nächsten Mal.
      </motion.p>
    </motion.div>
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
