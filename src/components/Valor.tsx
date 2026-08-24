import { money } from "../config";

/**
 * Valor em CHF que encolhe em vez de vazar do container.
 *
 * O problema real: "CHF 222.00" ocupava 109px de um cartao de 114px — encostava
 * nas duas bordas — e a partir de quatro digitos passava a vazar de verdade.
 * Como o numero cresce com o movimento do dia, o tamanho da fonte precisa
 * reagir ao numero, e nao ser fixo no codigo.
 */

type Tamanho = "cartao" | "grande" | "gigante";

/** Degraus por tamanho, do texto curto para o longo. */
const DEGRAUS: Record<Tamanho, string[]> = {
  // cartoes de um terco de tela: o caso que quebrou
  cartao: ["text-xl", "text-lg", "text-base", "text-sm"],
  // linhas de dia e botoes
  grande: ["text-3xl", "text-2xl", "text-xl", "text-lg"],
  // total da temporada, total a receber
  gigante: ["text-5xl", "text-4xl", "text-3xl", "text-2xl"],
};

/**
 * Quantos caracteres cabem em cada degrau.
 * Um terco de tela aguenta menos que a largura toda, entao o cartao aperta antes.
 * Medido: "CHF 1320.00" com 11 caracteres precisa cair para `text-base` no cartao.
 */
const LIMITES: Record<Tamanho, number[]> = {
  cartao: [8, 10, 12],
  grande: [10, 12, 14],
  gigante: [10, 12, 14],
};

function classe(tamanho: Tamanho, texto: string) {
  const degraus = DEGRAUS[tamanho];
  const i = LIMITES[tamanho].findIndex((max) => texto.length <= max);
  return degraus[i === -1 ? degraus.length - 1 : i];
}

interface Props {
  chf: number;
  tamanho?: Tamanho;
  className?: string;
}

export function Valor({ chf, tamanho = "cartao", className = "" }: Props) {
  const texto = money(chf);
  return (
    <span
      className={`block font-display tabular-nums whitespace-nowrap ${classe(
        tamanho,
        texto,
      )} ${className}`}
    >
      {texto}
    </span>
  );
}
