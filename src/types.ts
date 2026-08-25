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
}

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
  fee: number | null;
  contact: string | null;
  rating: string | null;
  notes: string | null;
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
