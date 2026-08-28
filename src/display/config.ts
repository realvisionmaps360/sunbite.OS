/**
 * O que muda no Customer Display sem mexer em tela nenhuma.
 * Mesma ideia do `src/config.ts` do PDV: um lugar so, e so ele.
 */

/**
 * Video do repouso. **`null` hoje — o video ainda nao existe.**
 *
 * Enquanto for `null`, o display mostra `CARTAZ_REPOUSO` (um SVG de poucos KB)
 * com uma aproximacao lenta, so para a tela nao ficar parada. Nao e arte
 * final: e o que permite ver a tela dividir e o pedido montar ao lado sem
 * esperar pelo conteudo definitivo.
 *
 * **Para ligar o video:** por o arquivo em `public/display/` e escrever o
 * caminho aqui. Uma linha, e so ela.
 *
 * ⚠️ Ele **tem** que ficar dentro do iPad, nunca baixando pela rede no meio da
 * feira: video de IA em boa qualidade pesa centenas de MB e a rede do mercado
 * e a primeira coisa que cai. Por estar em `public/`, o service worker o
 * precacheia (`globPatterns` no `vite.config.ts` inclui `mp4`). Se o
 * definitivo passar de ~40 MB, tirar `mp4` de la e deixar o iPad baixar uma
 * vez no Wi-Fi de casa — precachear centenas de MB trava a primeira abertura.
 */
export const VIDEO_REPOUSO: string | null = null;

/** O que aparece enquanto nao ha video, e o poster do video quando houver. */
export const CARTAZ_REPOUSO = "/display/repouso.svg";

/**
 * O logotipo oficial da Sunbite, recortado do arquivo da marca.
 *
 * Origem: `BUSINESS/SUNBITE.ch/LOGO offiziell Website.png` (1254x1254, fundo
 * vermelho chapado). O recorte separou o logotipo do "STRAWBERRY CHOCOLATE
 * CUPS" por pecas conectadas — corte reto nao servia, o rabo do "S" desce por
 * cima da linha de baixo — e tirou a franja vermelha das bordas resolvendo a
 * mistura de cada pixel meio-transparente. Testado sobre verde puro: sem halo.
 *
 * ⚠️ PNG com transparencia, em `public/`, para o service worker precachear
 * (`globPatterns` no `vite.config.ts` inclui `png`). O iPad tem que abrir sem
 * rede na feira, e um logotipo que depende de download e um retangulo vazio
 * virado para o cliente.
 */
export const LOGO_SUNBITE = "/display/logo.png";

/**
 * Dados da conta para o QR do TWINT com o valor dentro.
 *
 * ⚠️ **Ainda nao preenchido, e nao vou inventar.** Sem IBAN nao existe QR, e
 * um QR errado num balcao e pior que nenhum QR. Enquanto estiver vazio, o
 * display mostra o valor grande e diz para usar o QR de papel — que e o
 * comportamento honesto, nao um erro.
 *
 * O que colocar aqui:
 * - `iban`: IBAN ou QR-IBAN da conta da Sunbite, sem espacos.
 * - `nome`, `rua`, `cidade`: como aparecem na conta.
 *
 * E o que descobri pesquisando, que o Felipe precisa saber antes de decidir:
 * uma fatura com QR suico (Swiss QR-bill) **pode** ser paga pelo TWINT, e o
 * valor vai dentro do codigo. Mas o TWINT so paga **dentro do app dele** se o
 * emissor tiver contratado "Rechnung via TWINT" e o codigo trouxer o
 * procedimento alternativo (`av1`). Sem isso, o TWINT manda o cliente para o
 * app do banco — o que num balcao de feira e mais lento que o QR de papel.
 *
 * Por isso `av1` existe aqui: e a linha que o TWINT fornece no cadastro. Sem
 * ela o QR continua valido, so nao e instantaneo.
 */
export interface ContaQR {
  iban: string;
  nome: string;
  rua: string;
  cidade: string;
  /** Linha do procedimento alternativo do TWINT, se houver contrato. */
  av1?: string;
}

export const CONTA: ContaQR | null = null;

/**
 * Numero de TWINT que o cliente digita no app dele, enquanto nao ha IBAN.
 *
 * Decisao do Felipe em 28/08: **o numero pessoal da Romana**, por enquanto.
 *
 * ⚠️ E numero, nao QR — e a diferenca importa. **Nao existe QR que o cliente
 * escaneie para pagar num numero de celular**: o TWINT por numero exige que ele
 * abra o app, escolha "enviar" e digite. Desenhar um QR aqui seria um codigo
 * bonito que nao leva a lugar nenhum, no meio de uma feira, com fila. Entao o
 * display mostra o numero **grande, em blocos faceis de ler**, junto do valor.
 *
 * Quando o IBAN da Sunbite existir, preencher `CONTA` acima faz o QR de verdade
 * voltar sozinho e este numero sai da tela — a tela ja escolhe entre os dois.
 *
 * Formato: escrever como se le em voz alta. O agrupamento e so visual.
 */
export const TWINT_NUMERO: string | null = "+41 76 583 52 22";
