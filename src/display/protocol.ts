import type { Cup, Payment } from "../types";

/**
 * Customer Display — Etapa 10 do plano de execucao.
 *
 * Este arquivo e **puro de proposito**, igual a `src/cashbox.ts`: nao importa
 * `./supabase`, nao importa `./auth`, nao importa `./db`. Os dois lados do
 * canal (o celular que emite e o iPad que ouve) precisam concordar sobre a
 * forma da mensagem, e o lado do celular nao pode arrastar o client do
 * Supabase para dentro do caminho da venda so por saber essa forma.
 *
 * Quem carrega o Supabase e `emit.ts` (celular) e `link.ts` (iPad), os dois
 * por `import()` dinamico.
 */

/** Onde o par fica guardado no celular. Chave nova, nao mexe nas existentes. */
export const PAIR_KEY = "sunbite.display";

/** Onde o iPad guarda o proprio codigo. Chave diferente da do celular. */
export const CODE_KEY = "sunbite.display.code";

/** Codigo de 4 digitos: 1000..9999, para nunca comecar com zero na tela. */
export function novoCodigo(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/**
 * O codigo do iPad, o MESMO entre recarregamentos.
 *
 * ⚠️ Nasceu de um defeito visto no teste, nao de projeto: na primeira versao o
 * codigo era sorteado a cada carregamento da pagina. Bastava o Safari recarregar
 * o iPad — memoria, queda de rede, o dedo de alguem — para o codigo mudar e o
 * par morrer **em silencio**: o celular continuava falando num canal que nao
 * existia mais, e o iPad ficava no video mostrando um numero novo. Ninguem no
 * balcao ia entender por que a tela parou.
 *
 * Guardar o codigo faz o iPad manter a identidade dele. Trocar de proposito e
 * `trocarCodigo()`.
 */
export function codigoDoDisplay(): string {
  try {
    const salvo = localStorage.getItem(CODE_KEY);
    if (salvo && codigoValido(salvo)) return salvo;
    const novo = novoCodigo();
    localStorage.setItem(CODE_KEY, novo);
    return novo;
  } catch {
    // Sem armazenamento (aba privada), volta a valer por sessao. E pior, mas
    // e melhor do que a tela nao abrir.
    return novoCodigo();
  }
}

export function trocarCodigo(): string {
  const novo = novoCodigo();
  try {
    localStorage.setItem(CODE_KEY, novo);
  } catch {
    /* idem */
  }
  return novo;
}

export function codigoValido(codigo: string): boolean {
  return /^[1-9]\d{3}$/.test(codigo);
}

/**
 * O par, do lado do celular. Devolve null quando nao ha display nenhum —
 * e esse null que faz `App.tsx` nem chamar o `import()` do emissor, entao
 * quem nao usa iPad nao baixa uma linha de codigo a mais.
 *
 * `try` porque em navegador com armazenamento bloqueado o simples acesso a
 * `localStorage` estoura, e um display opcional nao pode derrubar a venda.
 */
export function lerPar(): string | null {
  try {
    const v = localStorage.getItem(PAIR_KEY);
    return v && codigoValido(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * O par mudou nos Ajustes — o `App.tsx` reabre o canal AGORA.
 *
 * ⚠️ Mesma historia do `VITRINE_EVENTO`, e o mesmo conserto. O emissor abre o
 * canal uma vez so, na montagem do `App`, entao parear com um codigo novo nao
 * tinha como chegar ate ele: a tela de Ajustes resolvia com `location.reload()`.
 * Funcionava, e cobrava caro — o app inteiro reiniciava e o Felipe era jogado
 * de volta na Home no meio dos Ajustes, toda vez que digitava o codigo.
 *
 * Com o evento, quem grava avisa, o `App` fecha o canal velho e abre o novo, e
 * a tela de Ajustes fica exatamente onde estava, com a bolinha ficando verde na
 * frente de quem pareou.
 */
export const PAR_EVENTO = "sunbite:display-par";

export function gravarPar(codigo: string): void {
  try {
    localStorage.setItem(PAIR_KEY, codigo);
  } catch {
    /* sem armazenamento, o par nao sobrevive ao recarregar — e so isso */
  }
  avisarParMudou();
}

export function apagarPar(): void {
  try {
    localStorage.removeItem(PAIR_KEY);
  } catch {
    /* idem */
  }
  avisarParMudou();
}

function avisarParMudou(): void {
  try {
    window.dispatchEvent(new CustomEvent(PAR_EVENTO));
  } catch {
    /* fora do navegador (teste): sem evento, e so isso */
  }
}

/**
 * Um canal por par. O nome carrega o codigo, entao dois iPads com codigos
 * diferentes nunca se ouvem — e trocar o codigo no iPad desfaz o par sozinho,
 * sem precisar de nenhum "desparear" do outro lado.
 */
export const canal = (codigo: string) => `display:${codigo}`;

/** Nome do evento de broadcast. Um so — o `kind` de dentro diz o resto. */
export const EVENTO = "estado";

/**
 * A VITRINE — o que o iPad reveza quando ninguem esta comprando.
 *
 * Mora no celular (`localStorage`) e viaja junto com o estado de repouso, em
 * vez de morar no banco. Dois motivos: o display ja depende do celular para
 * tudo o mais, e assim trocar o QR do Instagram no meio da feira nao depende
 * de rede boa nem de tabela nova.
 *
 * Painel de QR **sem endereco nao entra no rodizio**. Nada e adivinhado: QR
 * que leva ao perfil errado e pior que nenhum QR.
 */
export interface Vitrine {
  /**
   * O painel de fundo (cena/video) e **de primeira classe**: entra sempre no
   * rodizio, com duracao propria. Este liga/desliga escolhe **o que ele
   * mostra** — `true` = o video de verdade (quando o arquivo existir em
   * `VIDEO_REPOUSO`), `false` = a cena em CSS.
   *
   * ⚠️ Antes ele decidia se o painel **existia**. Com o video desligado a
   * lista virava [instagram, google], e como os paineis de QR sao
   * `absolute inset-0` com fundo opaco por cima da cena sempre montada, a cena
   * dos morangos **nunca aparecia sozinha**. Nao era o video que faltava: era
   * o turno dele no rodizio.
   */
  video: boolean;
  /** Quanto tempo a cena (ou o video) fica na tela, por volta do rodizio. */
  videoSeg: number;
  instagram: string;
  instagramSeg: number;
  google: string;
  googleSeg: number;
}

export const VITRINE_PADRAO: Vitrine = {
  // `false` porque `VIDEO_REPOUSO` ainda e null: o padrao honesto e a cena.
  video: false,
  videoSeg: 20,
  // Os dois enderecos vieram do Felipe em 27/08. Ficam aqui como PARTIDA, e
  // nao travados: a tela de Ajustes sobrescreve, e e por ela que se troca.
  // Mesma ideia do preco em `config.ts` depois da DEC-2026-005.
  instagram: "https://www.instagram.com/sunbite.ch",
  instagramSeg: 12,
  google: "https://g.page/r/CRZeFDUuWrjbEBI/review",
  googleSeg: 12,
};

const VITRINE_KEY = "sunbite.display.vitrine";

export function lerVitrine(): Vitrine {
  try {
    const raw = localStorage.getItem(VITRINE_KEY);
    if (!raw) return VITRINE_PADRAO;
    // Espalha por cima do padrao: chave nova numa versao futura do app nao
    // deixa a vitrine de um aparelho antigo `undefined` no meio da feira.
    return { ...VITRINE_PADRAO, ...(JSON.parse(raw) as Partial<Vitrine>) };
  } catch {
    return VITRINE_PADRAO;
  }
}

/**
 * Nome do evento que avisa o app de que a vitrine mudou.
 *
 * Existe porque a vitrine pega **carona no payload de repouso**, e o efeito
 * que monta esse payload em `App.tsx` nao depende do `localStorage` — nada o
 * acordava. O unico gatilho era `location.reload()` na tela de Ajustes, e a
 * batida de 8s do emissor so reenviava o payload velho ja montado. Um evento
 * e o caminho curto: quem grava avisa, o App remonta na hora, o emissor manda.
 */
export const VITRINE_EVENTO = "sunbite:display-vitrine";

export function gravarVitrine(v: Vitrine): void {
  try {
    localStorage.setItem(VITRINE_KEY, JSON.stringify(v));
  } catch {
    /* sem armazenamento: vale so nesta sessao */
  }
  try {
    window.dispatchEvent(new CustomEvent(VITRINE_EVENTO));
  } catch {
    /* fora do navegador (teste): sem evento, e so isso */
  }
}

/* ===========================================================================
   PRESENCA — ha mesmo um iPad do outro lado?
   ===========================================================================
   Mora aqui, no modulo **puro**, de proposito. Quem sabe da presenca de
   verdade e `emit.ts`, que importa o Supabase e por isso so pode ser carregado
   por `import()` dinamico. A tela de Ajustes (`DisplayScreen.tsx`) precisa
   mostrar a bolinha, mas nao pode importar `emit.ts` sem arrastar o client do
   Supabase para dentro do pacote da venda.

   Entao o caminho e este: `App.tsx` — que ja abre o canal — empurra o valor
   para ca por `marcarPresenca`, e a tela le por `presencaDoDisplay()` e ouve o
   evento. Nenhum import novo, nenhum canal a mais, isolamento intacto.
   =========================================================================== */

export const PRESENCA_EVENTO = "sunbite:display-presenca";

let presenca = false;

export function marcarPresenca(temIpad: boolean): void {
  if (presenca === temIpad) return;
  presenca = temIpad;
  try {
    window.dispatchEvent(
      new CustomEvent(PRESENCA_EVENTO, { detail: temIpad }),
    );
  } catch {
    /* idem */
  }
}

/** O que se sabe agora. `false` tambem quando nao ha par nenhum guardado. */
export function presencaDoDisplay(): boolean {
  return presenca;
}

/**
 * Os paineis que de fato entram no rodizio, ja na ordem e com a duracao.
 *
 * A cena **sempre** entra, e e por isso que a lista nunca sai vazia: tela preta
 * num balcao le como aparelho quebrado, e a cena e o descanso natural entre um
 * QR e o outro.
 */
export type PainelVitrine =
  | { tipo: "cena"; segundos: number; video: boolean }
  | { tipo: "instagram"; segundos: number; url: string }
  | { tipo: "google"; segundos: number; url: string };

export function paineis(v: Vitrine): PainelVitrine[] {
  const lista: PainelVitrine[] = [
    { tipo: "cena", segundos: Math.max(5, v.videoSeg), video: v.video },
  ];
  if (v.instagram.trim())
    lista.push({ tipo: "instagram", segundos: Math.max(5, v.instagramSeg), url: v.instagram.trim() });
  if (v.google.trim())
    lista.push({ tipo: "google", segundos: Math.max(5, v.googleSeg), url: v.google.trim() });
  return lista;
}

/**
 * A chave de ESTRUTURA do rodizio: tipos e enderecos, sem os segundos.
 *
 * ⚠️ E a separacao que corrige um defeito real: a chave era o objeto inteiro
 * (`JSON.stringify(vitrine)`), entao mexer num slider de segundos mudava a
 * chave e o rodizio voltava ao painel 1. Mudar **quais** paineis existem
 * justifica reiniciar; mudar quanto tempo cada um dura, nao.
 */
export function estruturaDaVitrine(lista: PainelVitrine[]): string {
  return lista
    .map((p) => (p.tipo === "cena" ? `cena:${p.video}` : `${p.tipo}:${p.url}`))
    .join("|");
}

/**
 * O que o iPad mostra. Cada `kind` e uma tela inteira, nao um pedaco:
 * o display nunca precisa juntar duas mensagens para saber o que desenhar,
 * e uma mensagem perdida no caminho e corrigida pela proxima, sem estado
 * acumulado para ficar torto.
 */
export type EstadoDisplay =
  /** Nenhum pedido em aberto: a vitrine reveza em tela cheia. */
  | { kind: "repouso"; vitrine?: Vitrine }
  /**
   * Pedido montando: o video encolhe e continua rodando ao lado.
   *
   * `precoCopo` e `precoTopping` viajam junto de proposito. O iPad precisa
   * deles para **abrir a conta** linha por linha (decisao do Felipe, 27/08:
   * o cliente ve de onde veio cada franco), e o preco mora no banco desde a
   * DEC-2026-005 — pode mudar no meio da temporada. Mandar o numero em vez de
   * o iPad ter a propria copia e o que impede as duas telas de discordarem.
   *
   * Opcionais para o iPad novo nao quebrar recebendo mensagem de um celular
   * que ainda nao atualizou: sem eles a linha mostra so o nome, sem preco.
   */
  | {
      kind: "pedido";
      cups: Cup[];
      total: number;
      precoCopo?: number;
      precoTopping?: number;
    }
  /**
   * Pagamento escolhido. `recebido` so existe em dinheiro, e pode ser nulo.
   *
   * ⚠️ `cups` e os precos viajam aqui TAMBEM, e nao so no `pedido`. Antes nao
   * vinham, e por isso o iPad tinha de jogar a lista fora ao entrar no
   * pagamento — a tela bonita sumia e entrava um cartaz seco no meio do nada.
   * O cliente perdia de vista o que estava pagando bem na hora de pagar.
   * Mandando os copos, o pedido **fica na tela** e o pagamento entra por cima.
   */
  | {
      kind: "pagamento";
      payment: Payment;
      total: number;
      recebido: number | null;
      cups?: Cup[];
      precoCopo?: number;
      precoTopping?: number;
    }
  /** Venda gravada: agradecimento, e o iPad volta ao repouso sozinho. */
  | { kind: "obrigado"; total: number };

/**
 * Quanto tempo o "obrigado" fica na tela antes de voltar ao video.
 *
 * Quem manda neste tempo e o iPad, nao o celular: a comemoracao do celular
 * dura ~2s e some, e enquanto ela mandava o iPad voltar junto o "Danke!"
 * piscava antes de o cliente ler. Ver a guarda em `App.tsx`.
 */
export const OBRIGADO_MS = 5000;

/**
 * Depois deste silencio o iPad volta ao repouso por conta propria.
 *
 * Existe porque a regra da Etapa 10 e clara: **o display e enfeite que ajuda,
 * nunca um passo do fluxo**. Se o celular sair do ar no meio de um pedido —
 * bateria, rede, app fechado — o iPad nao pode ficar congelado com o pedido
 * de outra pessoa na cara do proximo cliente.
 */
export const SILENCIO_MS = 90_000;
