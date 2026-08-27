import qrcode from "qrcode-generator";
import { CONTA, type ContaQR } from "./config";

/**
 * QR do pagamento, com o valor dentro (decisao do Felipe, 27/08).
 *
 * O conteudo e um **Swiss QR-bill** (QR-Rechnung, padrao SPC v2.0): texto puro,
 * com IBAN, valor e moeda. Nao existe API do TWINT para gerar um codigo de
 * balcao com valor — mas o app do TWINT le QR suico, e o valor aparece nele
 * para o cliente confirmar. Como e so texto, o codigo e montado **dentro do
 * iPad**, sem rede nenhuma. E isso importa: a feira e onde a rede cai.
 *
 * Estrutura do payload (ordem fixa, uma linha por campo, `\r\n`):
 *
 * ```
 *  1 SPC          | tipo             18 (vazio)
 *  2 0200         | versao           19 valor
 *  3 1            | codificacao      20 moeda
 *  4 IBAN         |                  21..27 devedor final (7 vazias)
 *  5 K            | endereco junto   28 tipo de referencia (NON)
 *  6 nome         |                  29 referencia (vazia)
 *  7 rua          |                  30 mensagem livre
 *  8 CEP + cidade |                  31 EPD  (fim dos dados de pagamento)
 *  9 (vazio)      |                  32 informacao de fatura
 * 10 (vazio)      |                  33 procedimento alternativo 1 (TWINT)
 * 11 CH           |                  34 procedimento alternativo 2
 * 12..17 credor final (6 vazias)
 * ```
 *
 * As linhas vazias **nao sao enfeite**: a posicao e o significado. Tirar uma
 * desloca todas as de baixo e o codigo vira lixo que o app do banco recusa.
 */
export function payloadSwissQR(conta: ContaQR, valor: number): string {
  const linhas = [
    "SPC",
    "0200",
    "1",
    conta.iban.replace(/\s+/g, "").toUpperCase(),
    "K",
    conta.nome,
    conta.rua,
    conta.cidade,
    "",
    "",
    "CH",
    // Credor final: SETE linhas (tipo, nome, rua, numero, CEP, cidade, pais).
    // Escrevi seis na primeira versao e o valor caiu na linha da moeda — o
    // teste que le o payload de volta e o que pegou. Contar de cabeca aqui
    // nao funciona; conferir com o payload na mao, sim.
    "", "", "", "", "", "", "",
    valor.toFixed(2),                 // sem separador de milhar, ponto decimal
    "CHF",
    "", "", "", "", "", "", "",       // devedor final: o cliente nao se
                                      // identifica num balcao
    "NON",                            // sem referencia estruturada
    "",
    "Sunbite",                        // mensagem que o cliente le no app
    "EPD",
    "",
  ];
  if (conta.av1) linhas.push(conta.av1);
  return linhas.join("\r\n");
}

/**
 * SVG do QR, escalavel, para caber em qualquer metade de tela.
 *
 * Correcao de erro `M`: o codigo fica atras de um vidro de iPad ao sol, e `L`
 * nao perdoa reflexo. `H` deixaria o desenho denso demais para a camera de um
 * celular a meio metro.
 */
export function svgDoQR(texto: string): string {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ scalable: true, margin: 1 });
}

/**
 * O QR do valor, ou `null` quando a conta ainda nao foi preenchida.
 *
 * Devolver `null` e deliberado: sem IBAN o display **diz** que nao ha QR e
 * mostra o valor grande, em vez de desenhar um codigo que nao leva a lugar
 * nenhum. Um QR quebrado no balcao custa mais que a ausencia dele.
 */
export function qrDoValor(valor: number): string | null {
  if (!CONTA?.iban) return null;
  return svgDoQR(payloadSwissQR(CONTA, valor));
}
