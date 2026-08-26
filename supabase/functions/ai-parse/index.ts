// Edge Function: chat da Sunbite IA (Fatia 6 do plano V2).
//
// Ate a Fatia 6 esta funcao so sabia propor registros. Agora ela pode: ler
// dados de verdade (decisao 15), responder em texto livre, e/ou propor —
// tudo na mesma pergunta, num loop de ferramentas.
//
// A funcao continua SEM escrever em nenhuma tabela de negocio por conta
// propria. Ela so grava propostas em ai_suggestions, com status 'pending'.
// Quem aplica na tabela real e o app, no clique de "Aprovar" — mesmo padrao
// do VisionFlow (analyze-notes + usePendingUpdates). Card rejeitado nunca
// vira dado.
//
// A chave da Anthropic fica como secret (ANTHROPIC_API_KEY) e NUNCA vai ao
// celular. Ver 02-Projetos/sunbite-ops/plano-v2.md, secao "Fatia 6".
import { createClient } from "npm:@supabase/supabase-js@2";

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

const PROPOR_TOOL = {
  name: "propor_registros",
  description:
    "Registra as propostas extraidas da frase do usuario, mapeadas para a area e os campos corretos. So chame isto quando houver algo de verdade para GRAVAR — nao para responder pergunta.",
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
                "true quando a leitura e ambigua e voce escolheu a interpretacao mais provavel (ex: '20' podendo ser preco ou quantidade, ou preco total vs. preco por unidade).",
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

// Ferramentas de LEITURA (decisao 15 — a IA pode ler tudo, financeiro
// incluido). Cada uma e uma consulta fixa, nao SQL livre: mesmo cuidado de
// seguranca que fez o SELECT de `sales` ficar fechado desde a Etapa 2, so
// que agora quem le e a Edge Function, com o JWT de quem perguntou (RLS
// continua valendo — a funcao nao le mais do que o Felipe logado leria).
const READ_TOOLS = [
  {
    name: "vendas_hoje",
    description: "Faturamento, dinheiro, TWINT, numero de vendas e copos vendidos hoje.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "estoque",
    description: "Estoque calculado (o que sobrou pelas vendas) por item. Sem 'item', devolve todos.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string", description: "nome ou parte do nome, ex: chocolate" } },
    },
  },
  {
    name: "ultima_compra",
    description: "Ultimas compras registradas, filtradas por item quando informado.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string" } },
    },
  },
  {
    name: "proxima_operacao",
    description:
      "Equipamentos com problema, pendencias em aberto e o status da ultima operacao — o que falta resolver antes de abrir de novo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "caixa",
    description:
      "Resumo financeiro do dia (dinheiro, TWINT, despesas, resultado). Sem 'data', usa o dia mais recente com movimento.",
    input_schema: {
      type: "object",
      properties: { data: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "diferenca_estoque",
    description:
      "Ultimos ajustes de contagem fisica ('Contei') e a diferenca encontrada entre calculado e contado, por item quando informado.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string" } },
    },
  },
];

async function runReadTool(name: string, input: any, caller: any): Promise<unknown> {
  switch (name) {
    case "vendas_hoje": {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: fin }, { data: sales }] = await Promise.all([
        caller.from("v_finance_daily").select("*").eq("local_date", today).maybeSingle(),
        caller.from("sales").select("cups, cancelled").eq("local_date", today),
      ]);
      const ativas = (sales || []).filter((s: any) => !s.cancelled);
      return {
        faturamento: fin?.receita_total ?? 0,
        dinheiro: fin?.receita_dinheiro ?? 0,
        twint: fin?.receita_twint ?? 0,
        vendas: ativas.length,
        copos: ativas.reduce((n: number, s: any) => n + (Array.isArray(s.cups) ? s.cups.length : 0), 0),
        canceladas: (sales || []).length - ativas.length,
      };
    }

    case "estoque": {
      let q = caller
        .from("v_stock_status")
        .select("name, unit, calculado, copos_restantes, low_stock_threshold, ultima_contagem");
      if (input?.item) q = q.ilike("name", `%${input.item}%`);
      const { data } = await q.order("name");
      return data ?? [];
    }

    case "ultima_compra": {
      let q = caller
        .from("purchase_items")
        .select("quantity, unit_cost, description, stock_items!inner(name), purchases!inner(purchased_at, total, suppliers(name))")
        .order("purchased_at", { foreignTable: "purchases", ascending: false })
        .limit(5);
      if (input?.item) q = q.ilike("stock_items.name", `%${input.item}%`);
      const { data, error } = await q;
      if (error) return { erro: error.message };
      return data ?? [];
    }

    case "proxima_operacao": {
      const [{ data: eq }, { data: pend }, { data: ops }] = await Promise.all([
        caller.from("equipment").select("name, status, critical, notes").neq("status", "ok"),
        caller
          .from("pendencies")
          .select("description, critical, origin")
          .eq("status", "aberta")
          .order("critical", { ascending: false }),
        caller.from("operations").select("status, local_date").order("created_at", { ascending: false }).limit(1),
      ]);
      return {
        equipamento_com_problema: eq ?? [],
        pendencias_abertas: pend ?? [],
        ultima_operacao: ops?.[0] ?? null,
      };
    }

    case "caixa": {
      let q = caller.from("v_finance_daily").select("*");
      q = input?.data ? q.eq("local_date", input.data) : q.order("local_date", { ascending: false }).limit(1);
      const { data } = await q;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? { aviso: "sem dados para essa data" };
    }

    case "diferenca_estoque": {
      let q = caller
        .from("stock_movements")
        .select("quantity_delta, notes, created_at, stock_items!inner(name)")
        .eq("reason", "ajuste")
        .order("created_at", { ascending: false })
        .limit(input?.item ? 5 : 10);
      if (input?.item) q = q.ilike("stock_items.name", `%${input.item}%`);
      const { data, error } = await q;
      if (error) return { erro: error.message };
      return data ?? [];
    }

    default:
      return { erro: `ferramenta desconhecida: ${name}` };
  }
}

function systemPrompt(lang: "pt" | "de") {
  return `Voce e a Sunbite IA, a assistente do dono de uma barraca de morango com chocolate na Suica (Sunbite). Seu tom e SECO, REAL E DIRETO: sem elogio generico, sem "Claro!", sem "Fico feliz em ajudar", sem enfeite. Responda a pergunta e pare.

Responda SEMPRE no idioma: ${lang === "de" ? "alemao (Deutsch)" : "portugues"}.

FORMATO: texto simples, lido no celular. NUNCA use markdown — nada de **negrito**, ##titulo, ou listas com - e *. Se precisar separar assuntos, use paragrafos curtos.

Voce tem tres coisas que pode fazer, e pode combinar mais de uma na mesma pergunta:

1. RESPONDER — se a pessoa fez uma pergunta sobre os dados da Sunbite (vendas, estoque, compras, caixa, pendencias, equipamento), USE as ferramentas de consulta antes de responder. Nunca invente numero. Se a ferramenta nao achar nada, diga isso, nao invente.
2. PROPOR — se a pessoa contou algo que devia virar registro (comprou, acabou, quebrou, ficou pendente), chame propor_registros.
3. As duas coisas — pode consultar, responder E propor na mesma mensagem.

Se a mensagem nao tiver nada acionavel nem pergunta, responda algo curto reconhecendo, sem propor nada.

REGRA MAIS IMPORTANTE (nunca duplicar — o dado ja pode existir):
- O PDV ja registra e desconta cada venda sozinho, automaticamente, pela ficha do copo (quanto morango, chocolate, copo, colher e topping cada copo vendido gasta). Isso acontece SEM voce.
- Se a frase disser algo como "vendemos 32 copos", "baixa de 56 copos", "as vendas de hoje" — isso e so uma DESCRICAO do que o PDV ja fez sozinho. NUNCA proponha stock_movements para copo vendido. Se quiser confirmar o numero, use a ferramenta vendas_hoje e responda em texto, sem propor nada de estoque.
- estoque so deve ser proposto para o que o PDV NAO sabe sozinho: sobrou, estragou, foi usado em teste/degustacao, ou uma contagem fisica ("Contei").

Regras gerais para propor:
- Use SOMENTE informacoes que estao na frase. NUNCA invente valores, datas, nomes ou numeros. Na duvida, omita o campo.
- "resumo" e uma frase curta e clara, para o Felipe ler no card e decidir.
- Hoje e a data fornecida na mensagem. Moeda e sempre CHF (franco suico) — nunca converta.
- Antes de propor, se a duvida for facil de tirar com uma ferramenta de leitura (ex: "ja tem esse fornecedor cadastrado?"), consulte antes.

CATALOGOS (na mensagem, quando relevante):
- A mensagem pode trazer as listas de itens de estoque, fornecedores, equipamentos e locais ja cadastrados.
- Ao se referir a um deles, use o NOME EXATO como aparece na lista.
- Se a frase citar algo que NAO esta na lista, use o nome como foi dito — o app oferece criar o item novo.

Area ESTOQUE (stock_movements):
- Use SO para o que nao passou pela venda: sobrou, foi usado, estragou, ou contagem fisica.
- quantity_delta e NEGATIVO para baixa (acabou, usei, perdi, estragou) e POSITIVO para entrada.
- "acabou o X" sem numero: quantity_delta usando o saldo atual (consulte a ferramenta estoque antes, para zerar certo), reason 'ajuste', marque incerto=true.
- reason: 'compra' (entrou por compra), 'uso' (teste, degustacao, amostra — NUNCA para copo vendido), 'perda' (estragou/caiu), 'ajuste' (contagem, correcao).

Area COMPRA (purchases):
- Use quando a frase disser que comprou algo. Inclua os itens em "itens".
- ATENCAO ao numero: "comprei 2,5kg de chocolate por 20" — 2,5 e a quantidade (kg) e 20 e o custo TOTAL em CHF, nao o preco por kg. Quando a frase for ambigua entre preco total e preco unitario, escolha TOTAL e marque incerto=true.
- Se citar um fornecedor que nao esta no catalogo, ponha em supplier_name mesmo assim.
- NAO crie tambem uma proposta de ESTOQUE para os itens da compra: aprovar a compra ja movimenta o estoque sozinho.

Area FINANCEIRO (expenses):
- Despesa/entrada/movimento de caixa que NAO e compra de material (esta e COMPRA) e NAO e venda (venda vive no proprio app).
- type: 'despesa' (saiu), 'entrada' (entrou fora de venda), 'movimento_caixa' (aporte/retirada).

Area PENDENCIA (pendencies):
- Use para o que ficou pendente, atrasado, faltando, a resolver, a confirmar, a comprar depois.
- critical=true so se a frase indicar que trava a operacao (seguranca, autorizacao, freio, bateria).

Area EQUIPAMENTO (equipment):
- Use quando a frase falar do estado de um equipamento (freio, bateria, carrinho, gerador, geladeira).
- status: 'ok', 'issue' (com problema mas funciona), 'broken' (quebrado), 'missing' (sumiu).
- Se ja existir no catalogo, use o nome exato — a proposta e de atualizacao de estado.

Area FORNECEDOR (suppliers):
- Se o fornecedor aparecer so dentro de uma compra, NAO crie proposta separada.

Area PRECO (prices):
- So para o preco de VENDA do proprio Sunbite. item_key: 'cup' ou 'topping'.

Area LOCAL (places):
- Local onde a barraca pode vender. fee e a taxa cobrada, em CHF.

Area EVENTO (events):
- Data marcada para vender em um local. starts_at em ISO com hora. is_public=true so se a frase disser que pode aparecer no site.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY nao configurada" }, 500);

    // Client do chamador: valida o JWT e respeita RLS em tudo que ler/escrever
    // — inclusive nas ferramentas de leitura novas. A funcao nunca le mais do
    // que o Felipe logado leria sozinho.
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
    const lang = body?.lang === "de" ? "de" : "pt";
    if (!texto || texto.length < 3) return json({ error: "Texto muito curto" }, 400);

    // Catalogos: a IA escolhe pelo nome, o app resolve para UUID ao aprovar.
    const [stock, suppliers, equipment, places] = await Promise.all([
      caller.from("stock_items").select("name, unit, quantity"),
      caller.from("suppliers").select("name, product"),
      caller.from("equipment").select("name, status"),
      caller.from("places").select("name, city"),
    ]);

    const catalogo = [
      `Itens de estoque (nome | unidade | saldo bruto): ${
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

    const messages: any[] = [
      {
        role: "user",
        content: `Data de hoje: ${today}.\n\nCATALOGOS JA CADASTRADOS:\n${catalogo}\n\nMENSAGEM:\n${texto}`,
      },
    ];

    let replyText = "";
    let propostas: any[] = [];
    let lastRawContent: any = null;
    let httpError: string | null = null;

    // Loop de ferramentas: no maximo 4 idas e vindas com a API, para nao
    // deixar a IA presa consultando para sempre. Uma pergunta normal resolve
    // em 1-2 voltas (consulta, depois responde).
    for (let turn = 0; turn < 4; turn++) {
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
          system: systemPrompt(lang),
          tools: [...READ_TOOLS, PROPOR_TOOL],
          messages,
        }),
      });

      if (!aiResp.ok) {
        httpError = `HTTP ${aiResp.status}: ${await aiResp.text()}`;
        break;
      }

      const aiData = await aiResp.json();
      lastRawContent = aiData.content;

      const textBlocks = (aiData.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text);
      if (textBlocks.length > 0) replyText = (replyText ? replyText + "\n" : "") + textBlocks.join("\n");

      const toolUses = (aiData.content || []).filter((c: any) => c.type === "tool_use");
      if (toolUses.length === 0) break; // resposta final em texto, sem ferramenta

      const proporCall = toolUses.find((tc: any) => tc.name === "propor_registros");
      if (proporCall?.input?.propostas) propostas = proporCall.input.propostas;

      const readCalls = toolUses.filter((tc: any) => tc.name !== "propor_registros");
      if (readCalls.length === 0) break; // so propor_registros — terminal, nao precisa voltar

      // Continua o loop: executa as leituras e devolve o resultado para a IA.
      messages.push({ role: "assistant", content: aiData.content });
      const toolResults = await Promise.all(
        readCalls.map(async (tc: any) => ({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(await runReadTool(tc.name, tc.input, caller)),
        })),
      );
      if (proporCall) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: proporCall.id,
          content: "Registrado como proposta, aguardando decisao do Felipe.",
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    // Grava a mensagem sempre — sucesso ou falha. E o log que permite
    // corrigir o prompt e ver por que a IA respondeu o que respondeu.
    const { data: msg, error: msgErr } = await caller
      .from("ai_messages")
      .insert({
        input_text: texto,
        input_mode: inputMode,
        model: MODEL,
        reply_text: replyText || null,
        raw_response: lastRawContent,
        created_by: userId,
        error: httpError,
      })
      .select("id")
      .single();
    if (msgErr) return json({ error: "Falha ao registrar a mensagem", detail: msgErr.message }, 500);

    if (httpError) return json({ error: "Falha na IA", detail: httpError }, 502);

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

    if (rows.length === 0) return json({ message_id: msg.id, reply_text: replyText, cards: [] });

    const { data: saved, error: saveErr } = await caller
      .from("ai_suggestions")
      .insert(rows)
      .select("*");
    if (saveErr) return json({ error: "Falha ao gravar propostas", detail: saveErr.message }, 500);

    return json({ message_id: msg.id, reply_text: replyText, cards: saved });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
