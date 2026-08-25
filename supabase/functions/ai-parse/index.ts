// Edge Function: recebe uma frase livre (digitada ou ditada) e usa IA para
// PROPOR registros nos 9 modulos administrativos do app.
//
// A funcao NAO escreve em nenhuma tabela de negocio. Ela so grava propostas
// em ai_suggestions com status 'pending'. Quem aplica na tabela real e o app,
// no clique de "Aprovar" — mesmo padrao do VisionFlow (analyze-notes +
// usePendingUpdates). Card rejeitado nunca vira dado.
//
// A chave da Anthropic fica como secret (ANTHROPIC_API_KEY) e NUNCA vai ao
// celular. Ver 02-Projetos/sunbite-ops/plano-etapa-9.md.
import { createClient } from "npm:@supabase/supabase-js@2";

// Extracao de campos e tarefa simples — Haiku da conta e roda barato.
// Decisao do Felipe, 25/08, com os numeros na mao. Se a qualidade decepcionar
// no teste real, trocar por "claude-opus-5" aqui nesta linha resolve.
const MODEL = "claude-haiku-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// area (IA) -> target_table (banco). A IA nunca ve nome de tabela.
const AREA_TO_TABLE: Record<string, string> = {
  estoque: "stock_movements",
  compra: "purchases",
  financeiro: "expenses",
  pendencia: "pendencies",
  equipamento: "equipment",
  fornecedor: "suppliers",
  preco: "prices",
  local: "places",
  evento: "events",
};

// Lista branca por tabela. Campo fora daqui e descartado em silencio — a IA
// nao consegue escrever numa coluna que este arquivo nao autoriza.
const ALLOWED_FIELDS: Record<string, string[]> = {
  stock_movements: ["stock_item_name", "quantity_delta", "reason", "notes"],
  purchases: ["supplier_name", "purchased_at", "total", "notes", "itens"],
  expenses: ["type", "category", "description", "value", "occurred_at"],
  pendencies: ["description", "critical", "origin"],
  equipment: ["name", "status", "critical", "notes"],
  suppliers: ["name", "product", "contact", "notes"],
  prices: ["item_key", "value"],
  places: ["name", "city", "fee", "contact", "rating", "notes"],
  events: ["place_name", "starts_at", "label_en", "label_de", "is_public", "notes"],
};

const ENUMS: Record<string, string[]> = {
  "stock_movements.reason": ["compra", "uso", "ajuste", "perda"],
  "expenses.type": ["despesa", "entrada", "movimento_caixa"],
  "equipment.status": ["ok", "issue", "broken", "missing"],
  "prices.item_key": ["cup", "topping"],
};

// Mantem so os campos da lista branca e descarta valores de enum invalidos.
// Mesmo formato de sanitizePayload() do analyze-notes do VisionFlow.
function sanitizePayload(table: string, campos: Record<string, unknown>) {
  const allowed = ALLOWED_FIELDS[table] || [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const v = campos[key];
    if (v === undefined || v === null || v === "") continue;
    const enumKey = `${table}.${key}`;
    if (ENUMS[enumKey] && !ENUMS[enumKey].includes(String(v))) continue;
    out[key] = v;
  }
  return out;
}

const TOOL = {
  name: "propor_registros",
  description:
    "Registra as propostas extraidas da frase do usuario, mapeadas para a area e os campos corretos.",
  input_schema: {
    type: "object",
    properties: {
      propostas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: {
              type: "string",
              enum: [
                "estoque", "compra", "financeiro", "pendencia", "equipamento",
                "fornecedor", "preco", "local", "evento",
              ],
            },
            resumo: {
              type: "string",
              description:
                "Frase curta em portugues para o card (ex: 'Baixa de 1 pacote de marshmallow').",
            },
            incerto: {
              type: "boolean",
              description:
                "true quando a leitura e ambigua e voce escolheu a interpretacao mais provavel (ex: '20' podendo ser preco ou quantidade).",
            },
            campos: {
              type: "object",
              description:
                "Campos a gravar. estoque: stock_item_name(nome exato do catalogo), quantity_delta(number, NEGATIVO para baixa/uso/perda, positivo para entrada), reason(compra|uso|ajuste|perda), notes. compra: supplier_name, purchased_at(YYYY-MM-DD), total(number), notes, itens(array de {descricao, quantidade, custo_unitario, stock_item_name}). financeiro: type(despesa|entrada|movimento_caixa), category, description, value(number), occurred_at(YYYY-MM-DD). pendencia: description, critical(boolean), origin. equipamento: name, status(ok|issue|broken|missing), critical(boolean), notes. fornecedor: name, product, contact, notes. preco: item_key(cup|topping), value(number). local: name, city, fee(number), contact, rating, notes. evento: place_name, starts_at(ISO com hora), label_en, label_de, is_public(boolean), notes.",
            },
          },
          required: ["area", "resumo", "incerto", "campos"],
        },
      },
    },
    required: ["propostas"],
  },
};

const SYSTEM_PROMPT =
  `Voce le uma frase livre do dono de uma barraca de morango com chocolate na Suica (Sunbite) e transforma cada informacao em uma proposta de registro, mapeada para a area e os campos corretos.

A frase costuma ser dita no fim da noite, cansado, com varias coisas misturadas. Uma frase pode gerar varias propostas de areas diferentes.

Regras gerais:
- Use SOMENTE informacoes que estao na frase. NUNCA invente valores, datas, nomes ou numeros. Na duvida, omita o campo.
- "resumo" e uma frase curta e clara em portugues, para o Felipe ler no card e decidir.
- Se a frase nao tiver nada acionavel, devolva uma lista vazia.
- Hoje e a data fornecida na mensagem. Moeda e sempre CHF (franco suico) — nunca converta.

CATALOGOS:
- A mensagem traz as listas de itens de estoque, fornecedores, equipamentos e locais ja cadastrados.
- Ao se referir a um deles, use o NOME EXATO como aparece na lista.
- Se a frase citar algo que NAO esta na lista, use o nome como foi dito. O app oferece criar o item novo — nao force para o nome parecido mais proximo, e nao invente que ja existe.

Area ESTOQUE (stock_movements):
- Use quando a frase falar que algo acabou, foi usado, sobrou, estragou, ou quando a quantidade mudou.
- quantity_delta e NEGATIVO para baixa (acabou, usei, perdi, estragou) e POSITIVO para entrada.
- "acabou o X" sem numero: quantity_delta usando o saldo atual do catalogo (zera o item), reason 'ajuste', e marque incerto=true — voce nao sabe quanto sobrou de verdade.
- reason: 'compra' (entrou por compra), 'uso' (gastou vendendo), 'perda' (estragou/caiu), 'ajuste' (contagem, correcao).

Area COMPRA (purchases):
- Use quando a frase disser que comprou algo. Inclua os itens em "itens".
- ATENCAO ao numero: "comprei 2,5kg de chocolate por 20" — 2,5 e a quantidade (kg) e 20 e o custo TOTAL em CHF, nao o preco por kg. Quando a frase for ambigua entre preco total e preco unitario, escolha TOTAL e marque incerto=true.
- Se citar um fornecedor que nao esta no catalogo, ponha em supplier_name mesmo assim — o app oferece cadastrar.
- NAO crie tambem uma proposta de ESTOQUE para os itens da compra: aprovar a compra ja movimenta o estoque sozinho.

Area FINANCEIRO (expenses):
- Despesa/entrada/movimento de caixa que NAO e compra de material (esta e COMPRA) e NAO e venda (venda vive no proprio app).
- Ex: estacionamento, taxa do local, gasolina, retirada de caixa.
- type: 'despesa' (saiu), 'entrada' (entrou fora de venda), 'movimento_caixa' (aporte/retirada).

Area PENDENCIA (pendencies):
- Use para o que ficou pendente, atrasado, faltando, a resolver, a confirmar, a comprar depois.
- Ex: "a colher nova nao chegou" -> pendencia.
- critical=true so se a frase indicar que trava a operacao (seguranca, autorizacao, freio, bateria).

Area EQUIPAMENTO (equipment):
- Use quando a frase falar do estado de um equipamento (freio, bateria, carrinho, gerador, geladeira).
- status: 'ok', 'issue' (com problema mas funciona), 'broken' (quebrado, nao funciona), 'missing' (sumiu).
- "o freio continua ruim" -> equipamento, status 'issue', critical=true.
- Se ja existir no catalogo, use o nome exato e a proposta e de atualizacao de estado.

Area FORNECEDOR (suppliers):
- Use quando a frase apresentar um fornecedor novo ou der um dado dele (contato, produto).
- Se o fornecedor aparecer so dentro de uma compra, NAO crie proposta separada — a area COMPRA ja cuida.

Area PRECO (prices):
- So para o preco de VENDA do proprio Sunbite. item_key: 'cup' (o copo) ou 'topping' (adicional).
- Preco que o Sunbite PAGOU em algo e COMPRA, nunca PRECO.

Area LOCAL (places):
- Local onde a barraca pode vender: praca, mercado, festival, rua.
- fee e a taxa cobrada pelo local, em CHF.

Area EVENTO (events):
- Data marcada para vender em um local. starts_at em ISO com hora.
- place_name: o nome do local (do catalogo, se existir).
- is_public=true so se a frase disser que pode aparecer no site.

Sempre responda chamando a ferramenta propor_registros.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY nao configurada" }, 500);

    // Client do chamador: valida o JWT e respeita RLS em tudo que ler/escrever.
    const caller = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await caller.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const texto = String(body?.texto || "").trim();
    const inputMode = body?.modo === "voice" ? "voice" : "text";
    if (!texto || texto.length < 3) return json({ error: "Texto muito curto" }, 400);

    // Catalogos: a IA escolhe pelo nome, o app resolve para UUID ao aprovar.
    // Sem isto ela inventaria nomes que nao existem no banco.
    const [stock, suppliers, equipment, places] = await Promise.all([
      caller.from("stock_items").select("name, unit, quantity"),
      caller.from("suppliers").select("name, product"),
      caller.from("equipment").select("name, status"),
      caller.from("places").select("name, city"),
    ]);

    const catalogo = [
      `Itens de estoque (nome | unidade | saldo atual): ${
        (stock.data || []).map((r: any) => `${r.name} | ${r.unit} | ${r.quantity}`).join(" ;; ") || "(vazio)"
      }`,
      `Fornecedores (nome | produto): ${
        (suppliers.data || []).map((r: any) => `${r.name} | ${r.product ?? "-"}`).join(" ;; ") || "(vazio)"
      }`,
      `Equipamentos (nome | estado atual): ${
        (equipment.data || []).map((r: any) => `${r.name} | ${r.status}`).join(" ;; ") || "(vazio)"
      }`,
      `Locais (nome | cidade): ${
        (places.data || []).map((r: any) => `${r.name} | ${r.city ?? "-"}`).join(" ;; ") || "(vazio)"
      }`,
    ].join("\n");

    const today = new Date().toISOString().slice(0, 10);

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "propor_registros" },
        messages: [
          {
            role: "user",
            content: `Data de hoje: ${today}.\n\nCATALOGOS JA CADASTRADOS:\n${catalogo}\n\nFRASE:\n${texto}`,
          },
        ],
      }),
    });

    // Grava a mensagem antes de qualquer proposta: se a IA falhar, o log
    // guarda o que foi dito e o erro — e o que permite corrigir o prompt.
    const { data: msg, error: msgErr } = await caller
      .from("ai_messages")
      .insert({
        input_text: texto,
        input_mode: inputMode,
        model: MODEL,
        created_by: userId,
        error: aiResp.ok ? null : `HTTP ${aiResp.status}`,
      })
      .select("id")
      .single();
    if (msgErr) return json({ error: "Falha ao registrar a mensagem", detail: msgErr.message }, 500);

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      return json({ error: "Falha na IA", detail: errText }, 502);
    }

    const aiData = await aiResp.json();
    const toolUse = (aiData.content || []).find((c: any) => c.type === "tool_use");
    if (!toolUse?.input) return json({ error: "IA nao retornou propostas" }, 502);

    await caller.from("ai_messages").update({ raw_response: toolUse.input }).eq("id", msg.id);

    const propostas = Array.isArray(toolUse.input.propostas) ? toolUse.input.propostas : [];
    const rows = propostas
      .map((p: any) => {
        const table = AREA_TO_TABLE[p?.area];
        if (!table) return null;
        const payload = sanitizePayload(table, p?.campos || {});
        if (Object.keys(payload).length === 0) return null;
        return {
          message_id: msg.id,
          target_table: table,
          operation: "insert",
          summary: String(p?.resumo || "").slice(0, 200) || table,
          payload,
          uncertain: p?.incerto === true,
          created_by: userId,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) return json({ message_id: msg.id, cards: [] });

    const { data: saved, error: saveErr } = await caller
      .from("ai_suggestions")
      .insert(rows)
      .select("*");
    if (saveErr) return json({ error: "Falha ao gravar propostas", detail: saveErr.message }, 500);

    return json({ message_id: msg.id, cards: saved });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
