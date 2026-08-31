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
  /** Operacao aberta no momento da venda (Etapa 6). Nulo se nenhuma. */
  operation_id?: string | null;

  /**
   * Venda cancelada sai de todos os totais mas nao some da lista.
   * E a diferenca entre "corrigir" e "sumir com dinheiro": no fim do dia
   * a caixa precisa bater, e um registro apagado torna isso impossivel de auditar.
   * Vendas gravadas antes deste campo existir vem `undefined` — leia com `isActive`.
   */
  cancelled?: boolean;
  cancelled_at?: string;

  /**
   * Correcao (Fatia 3 da V2). `total` e `payment` passam a valer o valor
   * corrigido — e por isso que sales.ts e a view v_finance_daily continuam
   * certos sem alteracao nenhuma. O que existia antes fica em
   * `original_total`, legivel ao lado na lista.
   *
   * Uma correcao por venda, por decisao: a policy do banco so aceita a
   * transicao de `corrected_at` nulo para nao nulo. Errou duas vezes,
   * cancela.
   */
  original_total?: number;
  correction_reason?: string;
  corrected_at?: string;
}

/** Venda que teve valor ou forma de pagamento corrigidos. */
export const isCorrected = (s: Sale) => Boolean(s.corrected_at);

/** Venda que conta para o caixa. */
export const isActive = (s: Sale) => !s.cancelled;

/** Acoes do pedido em aberto. Pilha que alimenta o Desfazer. */
export type OrderAction =
  | { type: "cup"; cupId: string }
  | { type: "topping"; cupId: string; topping: ToppingId };

// ── Etapa 7 — Equipamentos, Estoque, Compras, Financeiro ───────────────────
// Espelham as colunas de docs/supabase.sql, seção "Etapa 7".

export type EquipmentStatus = "ok" | "issue" | "broken" | "missing";

export interface Equipment {
  id: string;
  name: string;
  status: EquipmentStatus;
  critical: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  product: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  /** Mantida so pelo gatilho apply_stock_movement — nunca escrita direto. */
  quantity: number;
  low_stock_threshold: number | null;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StockMovementReason = "compra" | "uso" | "ajuste" | "perda";

export interface StockMovement {
  id: string;
  stock_item_id: string;
  quantity_delta: number;
  reason: StockMovementReason;
  operation_id: string | null;
  notes: string | null;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
}

/**
 * Uma linha da view `v_stock_status` (Fatia 5): o estoque de um item ja com a
 * conta feita no banco.
 *
 *   calculado = entradas (o total dos movimentos) − consumido (derivado das
 *               vendas que ja subiram, cruzando sales.cups com a ficha)
 *
 * `contado` nao existe aqui de proposito: contagem fisica nao e um campo que
 * o app guarda, e um movimento de `ajuste` que ele grava. A diferenca vira
 * historico em vez de sobrescrever o numero em silencio.
 */
export interface StockStatus {
  id: string;
  name: string;
  unit: string;
  low_stock_threshold: number | null;
  entradas: number;
  consumido: number;
  calculado: number;
  /** Quanto sai por copo vendido. Nulo para item que nao esta na ficha. */
  por_copo: number | null;
  /** Quantos copos o que sobrou ainda faz. Nulo quando `por_copo` e nulo. */
  copos_restantes: number | null;
  ultima_contagem: string | null;
}

export interface Purchase {
  id: string;
  supplier_id: string | null;
  purchased_at: string;
  total: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  stock_item_id: string | null;
  description: string | null;
  quantity: number;
  unit_cost: number | null;
  /** Coluna gerada no banco (quantity * unit_cost) — nunca enviada no insert. */
  subtotal?: number;
}

export type ExpenseType = "despesa" | "entrada" | "movimento_caixa";

export interface Expense {
  id: string;
  type: ExpenseType;
  category: string | null;
  description: string | null;
  value: number;
  occurred_at: string;
  operation_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Price {
  item_key: string;
  value: number;
  updated_at: string;
  updated_by: string | null;
}

export interface PriceHistoryRow {
  id: string;
  item_key: string;
  old_value: number | null;
  new_value: number;
  changed_by: string | null;
  changed_at: string;
}

// ── Etapa 8 — Planejamento, calendário e site ───────────────────────────────
// Espelham as colunas de docs/supabase.sql, seção "Etapa 8".

export interface Place {
  id: string;
  name: string;
  city: string | null;
  /** Rua e número. Separado de `city` porque o site mostra local + cidade. */
  address: string | null;
  fee: number | null;
  contact: string | null;
  rating: string | null;
  notes: string | null;
  /** `double precision` no banco — é o que `navigator.geolocation` entrega. */
  lat: number | null;
  lng: number | null;
  /**
   * O link do Maps, guardado inteiro mesmo quando não carrega coordenada
   * nenhuma (o link curto `maps.app.goo.gl` não carrega): serve para abrir o
   * Maps com um toque, que é o uso do dia a dia.
   */
  maps_url: string | null;
  created_at: string;
  updated_at: string;
}

export type EventType = "market" | "festival" | "popup" | "private";

export interface SunbiteEvent {
  id: string;
  place_id: string | null;
  starts_at: string;
  label_en: string | null;
  label_de: string | null;
  /** Confirmado e público são a mesma coisa aqui — ver o gatilho sync_public_event no SQL. */
  is_public: boolean;
  event_type: EventType | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
