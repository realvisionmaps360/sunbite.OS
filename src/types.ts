export type ToppingId = "almond" | "coconut" | "cream" | "marshmallow";
export type Payment = "cash" | "twint";

export interface Cup {
  id: string;
  toppings: ToppingId[];
}

export interface Sale {
  id: string;
  created_at: string;   // ISO UTC — ancora universal
  local_date: string;   // AAAA-MM-DD no fuso do celular
  local_time: string;   // HH:MM:SS no fuso do celular
  cup_count: number;
  cups: Cup[];
  total: number;        // CHF
  payment: Payment;
  device_id: string;
  synced: boolean;

  /**
   * Venda cancelada sai de todos os totais mas nao some da lista.
   * E a diferenca entre "corrigir" e "sumir com dinheiro": no fim do dia
   * a caixa precisa bater, e um registro apagado torna isso impossivel de auditar.
   * Vendas gravadas antes deste campo existir vem `undefined` — leia com `isActive`.
   */
  cancelled?: boolean;
  cancelled_at?: string;
}

/** Venda que conta para o caixa. */
export const isActive = (s: Sale) => !s.cancelled;

/** Acoes do pedido em aberto. Pilha que alimenta o Desfazer. */
export type OrderAction =
  | { type: "cup"; cupId: string }
  | { type: "topping"; cupId: string; topping: ToppingId };
