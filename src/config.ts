/**
 * Fonte unica de preco e catalogo do PDV.
 * Catalogo de toppings segue o SUNBITE Master Context v2.0, secao 9.
 * Preco vem de DEC-2026-001 e substitui o CHF 8.00 da secao 12 do Master Context.
 * Mudou o preco? Muda aqui, e so aqui.
 */
import type { ToppingId } from "./types";

export const CURRENCY = "CHF";

/** Copo sem nenhum topping. */
export const CUP_PRICE = 7.5;

/** Qualquer topping adiciona CHF 0.50. Copo com chantilly = CHF 8.00. */
export const TOPPING_PRICE = 0.5;

export interface ToppingDef {
  id: ToppingId;
  emoji: string;
}

/**
 * Secao 9 — toppings da Versao 1.
 * O rotulo nao mora aqui: vive em i18n.tsx, porque muda com o idioma.
 * O id nunca muda — e ele que vai para o banco.
 */
export const TOPPINGS: ToppingDef[] = [
  { id: "almond", emoji: "🌰" },
  { id: "coconut", emoji: "🥥" },
  { id: "cream", emoji: "🍦" },
  { id: "marshmallow", emoji: "🍡" },
];

/** Valor sempre em CHF, nos dois idiomas. */
export const money = (v: number) => `${CURRENCY} ${v.toFixed(2)}`;

/**
 * Emoji do topping pelo id.
 * O card do pedido usa emoji, nao palavra: com 4 toppings a lista escrita
 * nao cabe numa linha em nenhum dos dois idiomas (faltam ~65px), e o emoji
 * e o mesmo simbolo do botao que a Romana acabou de tocar.
 * A conferencia continua por extenso — la se le, aqui se confere de relance.
 */
export const toppingEmoji = (id: ToppingId) =>
  TOPPINGS.find((x) => x.id === id)?.emoji ?? "";
