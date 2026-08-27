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

export function gravarPar(codigo: string): void {
  try {
    localStorage.setItem(PAIR_KEY, codigo);
  } catch {
    /* sem armazenamento, o par nao sobrevive ao recarregar — e so isso */
  }
}

export function apagarPar(): void {
  try {
    localStorage.removeItem(PAIR_KEY);
  } catch {
    /* idem */
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
 * Os enderecos comecam vazios de proposito. QR que leva ao perfil errado e
 * pior que nenhum QR, entao o painel so entra no rodizio depois que o Felipe
 * colar o endereco. Nada e adivinhado.
 */
export interface Vitrine {
  /** Painel do video: liga/desliga e quanto tempo fica. */
  video: boolean;
  videoSeg: number;
  instagram: string;
  instagramSeg: number;
  google: string;
  googleSeg: number;
}

export const VITRINE_PADRAO: Vitrine = {
  video: true,
  videoSeg: 30,
  instagram: "",
  instagramSeg: 12,
  google: "",
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

export function gravarVitrine(v: Vitrine): void {
  try {
    localStorage.setItem(VITRINE_KEY, JSON.stringify(v));
  } catch {
    /* sem armazenamento: vale so nesta sessao */
  }
}

/**
 * Os paineis que de fato entram no rodizio, ja na ordem e com a duracao.
 *
 * Se a lista sair vazia — video desligado e nenhum endereco colado — o iPad
 * volta ao video mesmo assim. Tela preta num balcao le como aparelho quebrado.
 */
export type PainelVitrine =
  | { tipo: "video"; segundos: number }
  | { tipo: "instagram"; segundos: number; url: string }
  | { tipo: "google"; segundos: number; url: string };

export function paineis(v: Vitrine): PainelVitrine[] {
  const lista: PainelVitrine[] = [];
  if (v.video) lista.push({ tipo: "video", segundos: Math.max(5, v.videoSeg) });
  if (v.instagram.trim())
    lista.push({ tipo: "instagram", segundos: Math.max(5, v.instagramSeg), url: v.instagram.trim() });
  if (v.google.trim())
    lista.push({ tipo: "google", segundos: Math.max(5, v.googleSeg), url: v.google.trim() });
  return lista.length ? lista : [{ tipo: "video", segundos: 30 }];
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
  /** Pedido montando: o video encolhe e continua rodando ao lado. */
  | { kind: "pedido"; cups: Cup[]; total: number }
  /** Pagamento escolhido. `recebido` so existe em dinheiro, e pode ser nulo. */
  | { kind: "pagamento"; payment: Payment; total: number; recebido: number | null }
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
