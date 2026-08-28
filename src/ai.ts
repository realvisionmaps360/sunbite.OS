/**
 * Entrada por conversa com IA (Etapa 9) — lado do app.
 *
 * A IA NAO escreve em tabela de negocio. A Edge Function `ai-parse` so grava
 * propostas em `ai_suggestions`. Este arquivo faz duas coisas:
 *   1. chama a funcao e traz os cards;
 *   2. aplica UM card na tabela real, quando o Felipe aprova.
 *
 * Card rejeitado nunca vira dado — vira `status: 'rejected'` e fica no
 * historico, para dar para corrigir o prompt depois.
 *
 * So com internet e so com sessao, como Compras e Financeiro desde a Etapa 7.
 * Ver 02-Projetos/sunbite-ops/plano-etapa-9.md.
 */
import { getSupabase } from "./supabase";
import { logEvent } from "./log";

export type AITargetTable =
  | "stock_movements" | "purchases" | "expenses" | "pendencies"
  | "equipment" | "suppliers" | "prices" | "places" | "events";

export interface AISuggestion {
  id: string;
  message_id: string;
  target_table: AITargetTable;
  operation: "insert" | "update";
  summary: string;
  payload: Record<string, any>;
  uncertain: boolean;
  status: "pending" | "applied" | "rejected";
}

/** Uma volta da conversa: o que a pessoa disse, o que a IA respondeu (texto
 * livre, quando houve) e os cards daquela mensagem, nessa ordem de chegada. */
export interface AITurn {
  id: string;
  input_text: string;
  reply_text: string | null;
  error: string | null;
  created_at: string;
  cards: AISuggestion[];
}

/** Manda a mensagem para a IA. Ela pode responder em texto, propor cards, ou
 * as duas coisas — ver supabase/functions/ai-parse (Fatia 6). */
export async function sendMessage(
  texto: string,
  modo: "text" | "voice",
  lang: "pt" | "de",
): Promise<{ replyText: string | null; cards: AISuggestion[] }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("ai-parse", {
    body: { texto, modo, lang },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.detail || data.error);
  void logEvent(
    "info",
    `IA respondeu${data?.reply_text ? " em texto" : ""} e propos ${data?.cards?.length ?? 0} registro(s).`,
  );
  return { replyText: data?.reply_text ?? null, cards: (data?.cards ?? []) as AISuggestion[] };
}

/** Historico da conversa, mais antiga primeiro — para a tela virar chat. */
export async function fetchHistory(limit = 40): Promise<AITurn[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, input_text, reply_text, error, created_at, ai_suggestions(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((m: any) => ({
      id: m.id,
      input_text: m.input_text,
      reply_text: m.reply_text,
      error: m.error,
      created_at: m.created_at,
      cards: (m.ai_suggestions ?? []) as AISuggestion[],
    }))
    .reverse();
}

/**
 * Acha uma linha pelo nome, ou cria se nao existir.
 *
 * E aqui que o nome vira UUID. A IA devolve `stock_item_name` / `supplier_name`
 * / `place_name` de proposito (fica legivel no card e no log); a traducao para
 * o id acontece so no momento de aprovar. Se o nome nao existir no catalogo,
 * criar e o comportamento certo: o card ja avisou "criar novo" na tela.
 */
async function resolveByName(
  table: "stock_items" | "suppliers" | "equipment" | "places",
  name: string,
  createWith: Record<string, any> = {},
): Promise<string> {
  const supabase = await getSupabase();
  const { data: found } = await supabase.from(table).select("id").eq("name", name).maybeSingle();
  if (found?.id) return found.id as string;

  // Rede de seguranca contra item duplicado. Desde que a IA responde nos tres
  // idiomas, o nome pode voltar com outra caixa ("morango" em vez de
  // "Morango") e o .eq() acima, que e sensivel a maiuscula, criaria um item
  // novo ao lado do que ja existe. Aqui a comparacao e por caixa baixa e sem
  // espaco sobrando. NAO tenta traduzir: "Erdbeeren" continua sendo item
  // novo, e evitar isso e trabalho do prompt, que manda propor sempre com o
  // nome do catalogo em portugues.
  const alvo = name.trim().toLowerCase();
  const { data: todos } = await supabase.from(table).select("id, name");
  const igual = ((todos ?? []) as { id: string; name: string }[]).find(
    (r) => r.name.trim().toLowerCase() === alvo,
  );
  if (igual?.id) return igual.id as string;

  const { data: created, error } = await supabase
    .from(table)
    .insert({ name, ...createWith })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

/** Grava um card na tabela real. Devolve o id da linha criada, quando ha um. */
async function applyToTarget(s: AISuggestion, payload: Record<string, any>): Promise<string | null> {
  const supabase = await getSupabase();

  switch (s.target_table) {
    case "stock_movements": {
      // unit e obrigatorio em stock_items: se o item for novo, entra como
      // "un" e o Felipe corrige na tela de Estoque. Melhor do que travar a
      // aprovacao por causa de uma unidade que a frase nunca disse.
      const stockItemId = await resolveByName("stock_items", payload.stock_item_name, { unit: "un" });
      const { data, error } = await supabase
        .from("stock_movements")
        .insert({
          stock_item_id: stockItemId,
          quantity_delta: Number(payload.quantity_delta),
          reason: payload.reason ?? "ajuste",
          notes: payload.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }

    case "purchases": {
      const supplierId = payload.supplier_name
        ? await resolveByName("suppliers", payload.supplier_name)
        : null;

      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          supplier_id: supplierId,
          purchased_at: payload.purchased_at ?? new Date().toISOString().slice(0, 10),
          total: payload.total ?? null,
          notes: payload.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Os itens sao filhos da compra. O gatilho da Etapa 7 nao mexe em
      // estoque a partir de purchase_items — quem movimenta e o insert
      // explicito abaixo, um por item que aponte para um item de estoque.
      const itens = Array.isArray(payload.itens) ? payload.itens : [];
      for (const it of itens) {
        const stockItemId = it?.stock_item_name
          ? await resolveByName("stock_items", it.stock_item_name, { unit: "un" })
          : null;

        await supabase.from("purchase_items").insert({
          purchase_id: purchase.id,
          stock_item_id: stockItemId,
          description: it?.descricao ?? null,
          quantity: Number(it?.quantidade ?? 0),
          unit_cost: it?.custo_unitario != null ? Number(it.custo_unitario) : null,
        });

        if (stockItemId && Number(it?.quantidade)) {
          await supabase.from("stock_movements").insert({
            stock_item_id: stockItemId,
            quantity_delta: Number(it.quantidade),
            reason: "compra",
            notes: `Compra registrada pela IA${payload.supplier_name ? ` — ${payload.supplier_name}` : ""}`,
          });
        }
      }
      return purchase.id as string;
    }

    case "expenses": {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          type: payload.type ?? "despesa",
          category: payload.category ?? null,
          description: payload.description ?? s.summary,
          value: Number(payload.value),
          occurred_at: payload.occurred_at ?? new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }

    case "pendencies": {
      const { data, error } = await supabase
        .from("pendencies")
        .insert({
          description: payload.description ?? s.summary,
          critical: payload.critical === true,
          origin: payload.origin ?? "ia",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }

    case "equipment": {
      // Equipamento quase sempre ja existe (o seed da Etapa 7 criou freio e
      // bateria) — entao isto e uma atualizacao de estado, nao um cadastro.
      const id = await resolveByName("equipment", payload.name);
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (payload.status) patch.status = payload.status;
      if (payload.critical !== undefined) patch.critical = payload.critical === true;
      if (payload.notes) patch.notes = payload.notes;
      const { error } = await supabase.from("equipment").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    }

    case "suppliers": {
      const id = await resolveByName("suppliers", payload.name);
      const patch: Record<string, any> = {};
      if (payload.product) patch.product = payload.product;
      if (payload.contact) patch.contact = payload.contact;
      if (payload.notes) patch.notes = payload.notes;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
        if (error) throw error;
      }
      return id;
    }

    case "prices": {
      // O gatilho record_price_history (Etapa 7) grava o historico sozinho.
      const { error } = await supabase
        .from("prices")
        .update({ value: Number(payload.value), updated_at: new Date().toISOString() })
        .eq("item_key", payload.item_key);
      if (error) throw error;
      return null;
    }

    case "places": {
      const id = await resolveByName("places", payload.name);
      const patch: Record<string, any> = {};
      for (const k of ["city", "fee", "contact", "rating", "notes"]) {
        if (payload[k] !== undefined && payload[k] !== "") patch[k] = payload[k];
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("places").update(patch).eq("id", id);
        if (error) throw error;
      }
      return id;
    }

    case "events": {
      const placeId = payload.place_name ? await resolveByName("places", payload.place_name) : null;
      const { data, error } = await supabase
        .from("events")
        .insert({
          place_id: placeId,
          starts_at: payload.starts_at,
          label_en: payload.label_en ?? null,
          label_de: payload.label_de ?? null,
          // is_public fica false a nao ser que a frase tenha dito o contrario:
          // publicar no site e uma decisao, nao um efeito colateral.
          is_public: payload.is_public === true,
          notes: payload.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }
  }
}

/** Aprova: grava na tabela real e marca o card como aplicado. */
export async function approve(s: AISuggestion, editedPayload?: Record<string, any>): Promise<void> {
  const payload = editedPayload ?? s.payload;
  const appliedId = await applyToTarget(s, payload);
  const supabase = await getSupabase();
  await supabase
    .from("ai_suggestions")
    .update({ status: "applied", payload, applied_id: appliedId, decided_at: new Date().toISOString() })
    .eq("id", s.id);
  void logEvent("info", `Aprovado card da IA: ${s.summary}`);
}

/** Rejeita: nada vai para a tabela real, so o card muda de estado. */
export async function reject(s: AISuggestion): Promise<void> {
  const supabase = await getSupabase();
  await supabase
    .from("ai_suggestions")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", s.id);
  void logEvent("info", `Rejeitado card da IA: ${s.summary}`);
}

