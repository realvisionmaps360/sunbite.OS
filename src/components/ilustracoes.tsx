import type { ReactNode } from "react";

/**
 * Desenhos dos itens do checklist (Parte 2 da ops 13, executada na ops 15).
 *
 * Registro `apelido -> desenho`, casado com a coluna `checklist_templates.icon`
 * do banco. O apelido e sempre um slug (`barra-ferro`, `luvas`, `gelo`), nunca
 * uma URL: o app abre offline, e desenho que depende de rede vira buraco branco
 * na barraca. Apelido desconhecido nao quebra nada — cai no emoji de `Fallback`.
 *
 * Por que SVG e nao foto: sao 39 itens. 39 PNGs no precache do service worker
 * pesam no primeiro carregamento do celular, e a Romana abre o app no meio da
 * rua. SVG desenhado a mao abre sem rede, escala sem borrar e usa os tokens da
 * marca — mesmo padrao dos paineis de QR do iPad (`display/Display.tsx`).
 *
 * ⚠️ Quando o Felipe mandar as fotos dos itens, trocar e **uma entrada por
 * item** neste arquivo. Nenhuma tela precisa mudar.
 *
 * ⚠️ Piso de CSS/SVG: **Safari 15**. Nada de `mask`, `paint-order` ou filtro
 * novo — atributo que o navegador nao entende some em silencio, e foi assim que
 * o logotipo do iPad virou texto de 16px na ops 14.
 */

/** Paleta dos desenhos. So tons que ja aparecem na marca ou em comida real. */
const C = {
  traco: "#5B3A2E",
  morango: "#C1272D",
  folha: "#4A7C34",
  choco: "#6B4226",
  chocoClaro: "#8C5A33",
  gelo: "#A8CFE0",
  geloEscuro: "#6FA6BF",
  metal: "#B4B8BC",
  metalEscuro: "#8A9095",
  amarelo: "#E8B84B",
  creme: "#F5E6C8",
  branco: "#FFFDF7",
  cinza: "#9AA0A6",
  verde: "#3F8A4F",
  preto: "#3A2A22",
};

/**
 * Moldura comum. `viewBox` fixo em 48×48 para todo desenho — o card decide o
 * tamanho na tela, o desenho nunca decide por ele.
 */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-full w-full"
      fill="none"
      stroke={C.traco}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Os desenhos                                                         */
/* ------------------------------------------------------------------ */

const Morango = () => (
  <Svg>
    <path
      d="M24 42c-7 0-13-6-13-14 0-6 5-11 13-11s13 5 13 11c0 8-6 14-13 14z"
      fill={C.morango}
    />
    <path d="M17 15c3-3 11-3 14 0" fill={C.folha} />
    <path d="M24 16V9" />
    <path d="M24 13c-4-4-9-4-11-1 3 3 8 3 11 1z" fill={C.folha} />
    <path d="M24 13c4-4 9-4 11-1-3 3-8 3-11 1z" fill={C.folha} />
    <circle cx="20" cy="26" r="1.2" fill={C.creme} stroke="none" />
    <circle cx="27" cy="24" r="1.2" fill={C.creme} stroke="none" />
    <circle cx="24" cy="31" r="1.2" fill={C.creme} stroke="none" />
    <circle cx="30" cy="31" r="1.2" fill={C.creme} stroke="none" />
    <circle cx="18" cy="33" r="1.2" fill={C.creme} stroke="none" />
  </Svg>
);

const Chocolate = () => (
  <Svg>
    <rect x="10" y="12" width="28" height="26" rx="3" fill={C.choco} />
    <path d="M10 21h28M10 30h28M19 12v26M29 12v26" stroke={C.chocoClaro} />
    <path d="M10 12l5-4h28l-5 4" fill={C.chocoClaro} />
    <path d="M38 12l5-4v26l-5 4" fill={C.choco} />
  </Svg>
);

const ColherChocolate = () => (
  <Svg>
    <path d="M31 10l9 9-19 19-9-9z" fill={C.metal} />
    <ellipse cx="14" cy="34" rx="7" ry="5" transform="rotate(-45 14 34)" fill={C.metal} />
    <path d="M34 13c3 4 5 9 4 13-4 1-9-1-13-4z" fill={C.choco} stroke="none" />
    <path d="M26 34c1 3 0 6-2 7" stroke={C.choco} />
  </Svg>
);

const RecipienteChocolate = () => (
  <Svg>
    <path d="M12 18h24l-3 20a3 3 0 0 1-3 2H18a3 3 0 0 1-3-2z" fill={C.metal} />
    <path d="M15 24h18l-2 14H17z" fill={C.choco} stroke="none" />
    <rect x="9" y="13" width="30" height="6" rx="3" fill={C.metalEscuro} />
    <path d="M36 22c4 1 5 6 1 8" />
  </Svg>
);

const Chantilly = () => (
  <Svg>
    <path d="M16 40h16l-2-14H18z" fill={C.creme} />
    <path
      d="M18 26c-3 0-4-3-2-5 0-3 3-4 5-3 1-3 5-3 6 0 3-1 5 1 5 3 2 2 1 5-2 5z"
      fill={C.branco}
    />
    <path d="M24 18c0-3 2-5 4-6" stroke={C.branco} strokeWidth={3} />
    <path d="M22 30v6M27 30v6" stroke={C.amarelo} />
  </Svg>
);

const Copo = () => (
  <Svg>
    <path d="M14 14h20l-2 26a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z" fill={C.branco} />
    <path d="M15 22h18" />
    <path d="M17 22h14l-1.5 18H18.5z" fill={C.morango} stroke="none" opacity="0.35" />
    <rect x="12" y="9" width="24" height="6" rx="3" fill={C.creme} />
  </Svg>
);

const Tampa = () => (
  <Svg>
    <path d="M8 30c0-9 7-16 16-16s16 7 16 16z" fill={C.branco} />
    <rect x="6" y="30" width="36" height="6" rx="3" fill={C.creme} />
    <circle cx="24" cy="12" r="2.5" fill={C.creme} />
    <path d="M24 14.5V17" />
  </Svg>
);

const Topping = () => (
  <Svg>
    <path d="M15 22h18l-2 18a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" fill={C.branco} />
    <path d="M13 19h22" strokeWidth={3} />
    <path d="M17 12l2 4M24 9v5M31 12l-2 4" stroke={C.morango} />
    <path d="M20 6l1 4M28 6l-1 4" stroke={C.folha} />
    <circle cx="24" cy="30" r="1.4" fill={C.choco} stroke="none" />
    <circle cx="20" cy="34" r="1.4" fill={C.amarelo} stroke="none" />
    <circle cx="28" cy="34" r="1.4" fill={C.choco} stroke="none" />
  </Svg>
);

const Gelo = () => (
  <Svg>
    <path d="M8 24l7-5 7 5v9l-7 5-7-5z" fill={C.gelo} />
    <path d="M24 14l7-5 7 5v9l-7 5-7-5z" fill={C.branco} />
    <path d="M24 30l7-5 7 5v9l-7 5-7-5z" fill={C.gelo} />
    <path d="M15 19v9M31 9v9M31 25v9" stroke={C.geloEscuro} />
  </Svg>
);

const Congelador = () => (
  <Svg>
    <rect x="7" y="14" width="34" height="24" rx="3" fill={C.branco} />
    <path d="M7 23h34" />
    <path d="M33 18h5M33 32h5" strokeWidth={2.5} stroke={C.metalEscuro} />
    <path d="M17 26v9M13 28l4 2 4-2M13 33l4-2 4 2" stroke={C.geloEscuro} />
    <path d="M11 10h26" stroke={C.metalEscuro} />
  </Svg>
);

const Bateria = () => (
  <Svg>
    <rect x="7" y="16" width="30" height="17" rx="3" fill={C.branco} />
    <rect x="37" y="21" width="4" height="7" rx="1.5" fill={C.traco} stroke="none" />
    <rect x="10" y="19" width="18" height="11" rx="1.5" fill={C.verde} stroke="none" />
    <path d="M20 11v-4M14 11l-2-3M26 11l2-3" stroke={C.amarelo} />
  </Svg>
);

const BateriaGeladeira = () => (
  <Svg>
    <rect x="6" y="17" width="24" height="15" rx="3" fill={C.branco} />
    <rect x="30" y="21" width="3.5" height="7" rx="1.5" fill={C.traco} stroke="none" />
    <rect x="9" y="20" width="14" height="9" rx="1.5" fill={C.verde} stroke="none" />
    <path d="M38 8v16M32 12l6 3 6-3M32 20l6-3 6 3" stroke={C.geloEscuro} />
  </Svg>
);

const BateriaMotor = () => (
  <Svg>
    <rect x="6" y="17" width="24" height="15" rx="3" fill={C.branco} />
    <rect x="30" y="21" width="3.5" height="7" rx="1.5" fill={C.traco} stroke="none" />
    <rect x="9" y="20" width="14" height="9" rx="1.5" fill={C.verde} stroke="none" />
    <path d="M39 8l-6 10h6l-6 10" stroke={C.amarelo} strokeWidth={2.5} />
  </Svg>
);

const Carregador = () => (
  <Svg>
    <rect x="16" y="6" width="16" height="14" rx="3" fill={C.branco} />
    <path d="M21 6V2M27 6V2" strokeWidth={2.5} />
    <path d="M24 20v6a6 6 0 0 0 6 6h2a6 6 0 0 1 6 6v4" />
    <circle cx="38" cy="44" r="3" fill={C.amarelo} />
  </Svg>
);

const CarregarBike = () => (
  <Svg>
    <circle cx="12" cy="34" r="7" fill={C.branco} />
    <circle cx="36" cy="34" r="7" fill={C.branco} />
    <path d="M12 34l7-12h10l-5 12M19 22h9" />
    <path d="M29 22l4-6h4" />
    <path d="M24 16l-4 7h6l-4 7" stroke={C.amarelo} strokeWidth={2.5} />
  </Svg>
);

const Freio = () => (
  <Svg>
    <circle cx="20" cy="28" r="12" fill={C.branco} />
    <circle cx="20" cy="28" r="4" fill={C.metalEscuro} />
    <path d="M20 16v3M20 37v3M8 28h3M29 28h3" stroke={C.metal} />
    <path d="M30 14c6 1 9 6 8 11" strokeWidth={2.5} stroke={C.morango} />
    <path d="M38 25l-3-2M38 25l1-4" stroke={C.morango} />
  </Svg>
);

const Tripe = () => (
  <Svg>
    <path d="M24 10v14" strokeWidth={2.5} />
    <path d="M24 24L12 42M24 24l12 18M24 24v18" stroke={C.metalEscuro} />
    <path d="M17 33h14" stroke={C.metal} />
    <rect x="17" y="5" width="14" height="7" rx="2" fill={C.metal} />
  </Svg>
);

const BarraFerro = () => (
  <Svg>
    <path d="M10 38L30 8" strokeWidth={4} stroke={C.metalEscuro} />
    <path d="M18 40L38 10" strokeWidth={4} stroke={C.metal} />
    <path d="M26 42L46 12" strokeWidth={4} stroke={C.metalEscuro} />
    <path d="M8 40h6M40 8h6" />
  </Svg>
);

const TetoSolar = () => (
  <Svg>
    <circle cx="38" cy="10" r="5" fill={C.amarelo} />
    <path d="M38 2v2M38 16v2M30 10h2M44 10h2M32.5 4.5l1.5 1.5M42 14l1.5 1.5" stroke={C.amarelo} />
    <path d="M6 34l10-14h18l-8 14z" fill={C.gelo} />
    <path d="M11 27h18M14 34l6-14M22 34l6-14" stroke={C.geloEscuro} />
    <path d="M6 34h20v6H6z" fill={C.metal} />
    <path d="M14 40v4" />
  </Svg>
);

const CaixaSom = () => (
  <Svg>
    <rect x="12" y="7" width="24" height="34" rx="4" fill={C.preto} />
    <circle cx="24" cy="17" r="4" fill={C.metal} />
    <circle cx="24" cy="31" r="7" fill={C.metal} />
    <circle cx="24" cy="31" r="2.5" fill={C.metalEscuro} />
  </Svg>
);

const CaixaSomBateria = () => (
  <Svg>
    <rect x="8" y="9" width="20" height="30" rx="4" fill={C.preto} />
    <circle cx="18" cy="18" r="3.5" fill={C.metal} />
    <circle cx="18" cy="30" r="6" fill={C.metal} />
    <rect x="31" y="19" width="12" height="9" rx="2" fill={C.branco} />
    <rect x="33" y="21" width="6" height="5" rx="1" fill={C.verde} stroke="none" />
    <rect x="43" y="21.5" width="2.5" height="4" rx="1" fill={C.traco} stroke="none" />
  </Svg>
);

const Celular = () => (
  <Svg>
    <rect x="14" y="5" width="20" height="38" rx="4" fill={C.branco} />
    <path d="M14 12h20M14 37h20" />
    <circle cx="24" cy="40" r="1.5" fill={C.traco} stroke="none" />
    <path d="M19 20h10M19 26h6" stroke={C.cinza} />
  </Svg>
);

const Twint = () => (
  <Svg>
    <rect x="12" y="5" width="24" height="38" rx="4" fill={C.preto} />
    <rect x="16" y="12" width="16" height="16" rx="2" fill={C.branco} />
    <path d="M19 15h3v3h-3zM26 15h3v3h-3zM19 22h3v3h-3z" fill={C.preto} stroke="none" />
    <path d="M26 22h3v3" stroke={C.preto} strokeWidth={1.5} />
    <path d="M18 34h12" stroke={C.metal} />
  </Svg>
);

const ConferirTwint = () => (
  <Svg>
    <rect x="10" y="5" width="22" height="36" rx="4" fill={C.branco} />
    <path d="M10 12h22" />
    <path d="M15 20h12M15 26h8" stroke={C.cinza} />
    <circle cx="35" cy="33" r="9" fill={C.verde} stroke="none" />
    <path d="M31 33l3 3 6-6" stroke={C.branco} strokeWidth={2.5} />
  </Svg>
);

const Dinheiro = () => (
  <Svg>
    <rect x="5" y="14" width="30" height="18" rx="3" fill={C.verde} />
    <circle cx="20" cy="23" r="5" fill={C.branco} stroke="none" />
    <path d="M20 20v6M18 22h4M18 25h4" stroke={C.verde} strokeWidth={1.5} />
    <circle cx="36" cy="34" r="8" fill={C.amarelo} />
    <path d="M36 30v8M33.5 32.5h5M33.5 36h5" strokeWidth={1.5} />
  </Svg>
);

const FecharCaixa = () => (
  <Svg>
    <rect x="7" y="22" width="34" height="19" rx="3" fill={C.metal} />
    <path d="M7 28h34" />
    <path d="M14 22v-4a10 10 0 0 1 20 0v4" fill={C.branco} />
    <circle cx="24" cy="32" r="3" fill={C.metalEscuro} />
    <path d="M24 35v3" />
  </Svg>
);

const ContarIngredientes = () => (
  <Svg>
    <rect x="10" y="7" width="28" height="34" rx="3" fill={C.branco} />
    <rect x="18" y="4" width="12" height="6" rx="2" fill={C.metal} />
    <path d="M16 19h4M16 26h4M16 33h4" stroke={C.morango} strokeWidth={2.5} />
    <path d="M25 19h8M25 26h8M25 33h5" stroke={C.cinza} />
  </Svg>
);

const Autorizacao = () => (
  <Svg>
    <rect x="9" y="7" width="30" height="34" rx="3" fill={C.branco} />
    <rect x="18" y="4" width="12" height="6" rx="2" fill={C.metal} />
    <path d="M15 18h18M15 24h12" stroke={C.cinza} />
    <path d="M16 32l5 5 11-12" stroke={C.verde} strokeWidth={3} />
  </Svg>
);

const Horario = () => (
  <Svg>
    <circle cx="24" cy="26" r="15" fill={C.branco} />
    <path d="M24 17v9l6 4" strokeWidth={2.5} />
    <path d="M15 8l-5 4M33 8l5 4" strokeWidth={2.5} stroke={C.metalEscuro} />
    <circle cx="24" cy="26" r="1.5" fill={C.traco} stroke="none" />
  </Svg>
);

const Local = () => (
  <Svg>
    <path d="M24 43c-8-10-13-16-13-22a13 13 0 0 1 26 0c0 6-5 12-13 22z" fill={C.morango} />
    <circle cx="24" cy="20" r="5" fill={C.creme} stroke="none" />
  </Svg>
);

const Luvas = () => (
  <Svg>
    <path
      d="M14 44V22c0-2 3-2 3 0v-5c0-2 3-2 3 0v-3c0-2 3-2 3 0v3c0-2 3-2 3 0v4c3-1 6 1 6 4v11c0 4-3 8-7 8z"
      fill={C.gelo}
    />
    <path d="M14 30h18" stroke={C.geloEscuro} />
  </Svg>
);

const Limpar = () => (
  <Svg>
    <path d="M8 26h24a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill={C.amarelo} />
    <path d="M8 32h28" stroke={C.branco} />
    <circle cx="34" cy="14" r="4" fill={C.gelo} />
    <circle cx="42" cy="21" r="2.5" fill={C.gelo} />
    <circle cx="27" cy="10" r="2.5" fill={C.gelo} />
  </Svg>
);

const SacoLixo = () => (
  <Svg>
    <path d="M12 18c0 0 3 3 12 3s12-3 12-3l-2 22a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill={C.preto} />
    <path d="M13 18l4-8 7 5 7-5 4 8" fill={C.cinza} />
    <path d="M20 26v10M28 26v10" stroke={C.cinza} />
  </Svg>
);

const Descartar = () => (
  <Svg>
    <path d="M11 16h26l-2 24a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill={C.branco} />
    <path d="M8 16h32" strokeWidth={3} />
    <path d="M18 16v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
    <path d="M19 24v12M24 24v12M29 24v12" stroke={C.cinza} />
  </Svg>
);

const Guardar = () => (
  <Svg>
    <path d="M7 20h34v18a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill={C.chocoClaro} />
    <path d="M7 20l4-8h26l4 8" fill={C.choco} />
    <path d="M24 4v11M20 11l4 4 4-4" stroke={C.verde} strokeWidth={2.5} />
    <path d="M19 27h10" stroke={C.choco} />
  </Svg>
);

const CaixaVermelha = () => (
  <Svg>
    <path d="M7 20h34v18a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill={C.morango} />
    <path d="M7 20l4-7h26l4 7" fill={C.morango} opacity="0.75" />
    <rect x="19" y="24" width="10" height="6" rx="1.5" fill={C.creme} stroke="none" />
    <path d="M18 13V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
  </Svg>
);

const Desmontar = () => (
  <Svg>
    <path d="M9 39l16-16" strokeWidth={3} stroke={C.metalEscuro} />
    <path d="M25 23a7 7 0 1 0 9-9l-4 4-5-5 4-4a7 7 0 0 0-9 9z" fill={C.metal} />
    <path d="M39 39l-9-9" strokeWidth={3} stroke={C.metalEscuro} />
    <path d="M30 30l-4-4" stroke={C.metal} strokeWidth={4} />
  </Svg>
);

const Desligar = () => (
  <Svg>
    <circle cx="24" cy="26" r="14" fill={C.branco} />
    <path d="M24 12v12" strokeWidth={3} stroke={C.morango} />
    <path d="M15 19a12 12 0 1 0 18 0" strokeWidth={3} stroke={C.morango} />
  </Svg>
);

const PararPedidos = () => (
  <Svg>
    <path d="M16 5h16l11 11v16L32 43H16L5 32V16z" fill={C.morango} />
    <path d="M17 17l14 14M31 17L17 31" stroke={C.creme} strokeWidth={3.5} />
  </Svg>
);

const NadaEsquecido = () => (
  <Svg>
    <path d="M4 38h40" strokeWidth={2.5} stroke={C.metal} />
    <path d="M10 38c2-4 6-5 9-3" stroke={C.cinza} />
    <circle cx="26" cy="21" r="11" fill={C.branco} />
    <circle cx="26" cy="21" r="7" fill={C.gelo} opacity="0.4" stroke="none" />
    <path d="M34 29l8 8" strokeWidth={3.5} stroke={C.metalEscuro} />
    <path d="M21 21l4 4 7-8" stroke={C.verde} strokeWidth={2.5} />
  </Svg>
);

/* ------------------------------------------------------------------ */
/* O registro                                                          */
/* ------------------------------------------------------------------ */

const DESENHOS: Record<string, () => ReactNode> = {
  autorizacao: Autorizacao,
  "barra-ferro": BarraFerro,
  bateria: Bateria,
  "bateria-geladeira": BateriaGeladeira,
  "bateria-motor": BateriaMotor,
  "caixa-som": CaixaSom,
  "caixa-som-bateria": CaixaSomBateria,
  "caixa-vermelha": CaixaVermelha,
  carregador: Carregador,
  "carregar-bike": CarregarBike,
  celular: Celular,
  chantilly: Chantilly,
  chocolate: Chocolate,
  "colher-chocolate": ColherChocolate,
  "conferir-twint": ConferirTwint,
  congelador: Congelador,
  "contar-ingredientes": ContarIngredientes,
  copo: Copo,
  descartar: Descartar,
  desligar: Desligar,
  desmontar: Desmontar,
  dinheiro: Dinheiro,
  "fechar-caixa": FecharCaixa,
  freio: Freio,
  gelo: Gelo,
  guardar: Guardar,
  horario: Horario,
  limpar: Limpar,
  local: Local,
  luvas: Luvas,
  morango: Morango,
  "nada-esquecido": NadaEsquecido,
  "parar-pedidos": PararPedidos,
  "recipiente-chocolate": RecipienteChocolate,
  "saco-lixo": SacoLixo,
  tampa: Tampa,
  "teto-solar": TetoSolar,
  topping: Topping,
  tripe: Tripe,
  twint: Twint,
};

/**
 * O desenho de um item do checklist. `slug` vem de `checklist_templates.icon`.
 *
 * Apelido nulo ou desconhecido **nao quebra a tela** — cai no emoji. Item novo
 * no banco aparece hoje, com desenho generico, e ganha o dele quando alguem
 * acrescentar a entrada aqui.
 */
export function Ilustracao({ slug }: { slug: string | null }) {
  const Desenho = slug ? DESENHOS[slug] : undefined;
  if (!Desenho) return <span className="text-3xl leading-none">📋</span>;
  return <Desenho />;
}
