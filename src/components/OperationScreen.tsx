import { useCallback, useEffect, useRef, useState } from "react";
import { ensureFreshSession, useAuth, type Identity } from "../auth";
import { expectedCash, rappen, type CashExpectation } from "../cashbox";
import { today } from "../db";
import { money } from "../config";
import { useLang } from "../i18n";
import { flushOutbox, queueWrite } from "../outbox";
import {
  AdminHeader,
  Aviso,
  CardToggle,
  GridCards,
  Linha,
  StatusPill,
  Tile,
  TileButton,
} from "./ui";
import { Ilustracao } from "./ilustracoes";
import { FolhaDoResumo } from "./ResumoDoDia";
import { hora, type ResumoDoDia } from "../resumo";
import {
  cacheOpenOperationView,
  consumirVistaPedida,
  limparCacheOperacaoAberta,
  phaseFor,
  type ChecklistStateRow,
  type ChecklistTemplate,
  type Operation,
  type Pendency,
  type Phase,
} from "../operations";
import { googleCalendarUrl } from "../places";
import { subscribeRealtime } from "../realtime";
import { getSupabase } from "../supabase";
import type { Place, SunbiteEvent } from "../types";
import LoginScreen from "./LoginScreen";
import { OccurrenceSheet } from "./OccurrenceSheet";

const PHASES: Phase[] = ["preparacao", "saida", "operacao", "encerramento"];

/**
 * Por quanto tempo o toque da Romana vence a resposta do servidor.
 *
 * O realtime manda `load()` reler tudo a cada mudanca no banco, e essa leitura
 * volta segundos depois — tempo em que ela ja marcou outros tres cards. Sem
 * esta precedencia, `setStates(st)` sobrescrevia com uma foto velha: o card
 * desmarcava sozinho e remarcava so na resposta seguinte. Dez segundos cobrem
 * com folga a ida e volta da fila, ate com a rede ruim da feira.
 */
const JANELA_TOQUE_LOCAL_MS = 10_000;

/** O que a Romana acabou de tocar, e quando. Chave: `template_id`. */
type ToqueLocal = { checked: boolean; em: number };

/**
 * A venda como o fechamento e o resumo do dia precisam dela. `cup_count` e
 * `created_at` existem so para o resumo (copos e ritmo); o resto e o que
 * `expectedCash` ja lia.
 */
interface VendaDoResumo {
  total: number;
  payment: string;
  cancelled: boolean;
  tip: number | null;
  cup_count: number;
  created_at: string;
}

/**
 * Tira do mapa o que ja nao precisa vencer o servidor: o toque que passou da
 * janela, e o toque que o servidor ja devolveu com o mesmo valor.
 *
 * Roda fora do `setStates` de proposito — no StrictMode o React chama o
 * updater duas vezes, e mexer no mapa la dentro apagaria a precedencia bem na
 * segunda passada.
 */
function limparToquesVencidos(toques: Map<string, ToqueLocal>, doServidor: ChecklistStateRow[]) {
  if (toques.size === 0) return;
  const agora = Date.now();
  const porTemplate = new Map(doServidor.map((linha) => [linha.template_id, linha]));
  for (const [id, toque] of toques) {
    const expirou = agora - toque.em > JANELA_TOQUE_LOCAL_MS;
    const servidorAlcancou = porTemplate.get(id)?.checked === toque.checked;
    if (expirou || servidorAlcancou) toques.delete(id);
  }
}

/**
 * Monta a lista que vai para a tela: o que veio do servidor, com os toques
 * ainda frescos por cima. Funcao pura — so le o mapa (ver `limparToquesVencidos`).
 */
function aplicarToquesLocais(
  doServidor: ChecklistStateRow[],
  local: ChecklistStateRow[],
  toques: Map<string, ToqueLocal>,
): ChecklistStateRow[] {
  if (toques.size === 0) return doServidor;
  const porTemplate = new Map(doServidor.map((linha) => [linha.template_id, linha]));
  for (const [id, toque] of toques) {
    const doBanco = porTemplate.get(id);
    if (doBanco) {
      porTemplate.set(id, { ...doBanco, checked: toque.checked });
      continue;
    }
    // Primeira marcacao do item: a linha ainda esta na fila de escrita e o
    // servidor nem sabe que ela existe. Fica a que o toque criou aqui.
    const otimista = local.find((linha) => linha.template_id === id);
    if (otimista) porTemplate.set(id, otimista);
  }
  return [...porTemplate.values()];
}

/**
 * Tela de Operacao (Etapa 6) — exige sessao, por isso entra no barril
 * adminScreens.ts como as outras telas administrativas. Diferente delas,
 * quando deslogada mostra a LoginScreen embutida em vez de so um aviso: sem
 * login nao ha "quem fez" para gravar em opened_by/checked_by/created_by.
 */
export default function OperationScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <OperationBody onClose={onClose} identity={auth.identity} />;
}

function prepDone(templates: ChecklistTemplate[], states: ChecklistStateRow[]): boolean {
  const prepIds = templates.filter((tp) => tp.phase === "preparacao").map((tp) => tp.id);
  if (prepIds.length === 0) return true;
  const byTemplate = new Map(states.map((s) => [s.template_id, s]));
  return prepIds.every((id) => byTemplate.get(id)?.checked);
}

function OperationBody({
  onClose,
  identity,
}: {
  onClose: () => void;
  identity: Identity;
}) {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [states, setStates] = useState<ChecklistStateRow[]>([]);
  const [pendencies, setPendencies] = useState<Pendency[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<SunbiteEvent[]>([]);
  /**
   * `null` = a grade das quatro fases; uma fase = a lista daquela fase.
   * Ate a ops 15 isto era `tab`, e um efeito trocava a aba sozinho a cada
   * mudanca de estado — no meio do toque da Romana. Agora quem navega e so
   * o dedo dela.
   */
  const [vista, setVista] = useState<Phase | null>(() => consumirVistaPedida());
  /** Vendas da operacao do dia — alimentam o caixa esperado e o resumo. */
  const [vendas, setVendas] = useState<VendaDoResumo[]>([]);
  /** Quantas vendas de hoje ficaram sem operacao amarrada. So informa. */
  const [orfas, setOrfas] = useState(0);
  /** A folha do dia encerrado. Nao vem do `load()` — ver `ResumoDoDia`. */
  const [resumo, setResumo] = useState<ResumoDoDia | null>(null);
  /** Recado do erro suave da trava. Some sozinho; nunca bloqueia toque. */
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * Recusa do servidor ao gravar a operacao. Diferente do `aviso`, este NAO
   * some sozinho: se o banco nao aceitou abrir ou fechar o dia, quem esta na
   * barraca precisa ver isso ate resolver. Some quando a gravacao seguinte
   * passa.
   */
  const [erroGravacao, setErroGravacao] = useState<string | null>(null);
  /** Qual card balanca, e quantas vezes ja balancou (a chave da animacao). */
  const [tremendo, setTremendo] = useState<{ fase: Phase; n: number } | null>(null);
  const [cashInitial, setCashInitial] = useState("");
  const [cashFinal, setCashFinal] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [occurrence, setOccurrence] = useState(false);
  /** Caixa esperado (PRD 7.3) — nulo enquanto nao deu para calcular. */
  const [expected, setExpected] = useState<CashExpectation | null>(null);
  /**
   * Os toques dos ultimos segundos. Fica em ref, e nao em estado, porque quem
   * le isto e o `load()` — que e um `useCallback` sem dependencias e nao pode
   * ganhar uma que o recrie a cada toque (o realtime depende dele ser estavel).
   */
  const toquesRecentes = useRef<Map<string, ToqueLocal>>(new Map());
  /**
   * Quem rola nesta tela e este container, nao a janela: `window.scrollTo` aqui
   * nao faria nada. Serve para abrir a fase seguinte no topo da lista.
   */
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();

      const { data: tpl } = await supabase
        .from("checklist_templates")
        .select("*")
        .eq("active", true)
        .order("phase")
        .order("sort_order");
      if (tpl) setTemplates(tpl as ChecklistTemplate[]);

      const { data: op } = await supabase
        .from("operations")
        .select("*")
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1);
      /**
       * A operacao ja encerrada de hoje (ops 24). Ate aqui ela era invisivel
       * para esta tela — o filtro acima a descartava — e o efeito era que
       * encerrar o dia devolvia "Nenhuma operacao em andamento" com um botao
       * de comecar outra, como se o toque nao tivesse funcionado.
       */
      const { data: fechada } = await supabase
        .from("operations")
        .select("*")
        .eq("local_date", today())
        .eq("status", "closed")
        .limit(1);
      /**
       * Uma operacao PLANEJADA de um dia anterior nao serve para hoje: ela
       * ficou para tras. Foi assim que o domingo 06/09 caiu inteiro dentro da
       * operacao criada em 04/09 — checklist, e depois as vendas — herdando a
       * data errada. Ignorada aqui, a tela oferece comecar a de hoje.
       *
       * Uma operacao ABERTA continua valendo em qualquer data, de proposito:
       * um dia que virou sem fechar tem que continuar alcancavel para poder
       * ser fechado. Nada pode deixar a Romana sem caminho de volta.
       */
      const encontrada = (op?.[0] as Operation | undefined) ?? null;
      const emAndamento =
        encontrada && encontrada.status === "planned" && encontrada.local_date !== today()
          ? null
          : encontrada;
      // Sem operacao em andamento, a do dia passa a ser a ja encerrada de
      // hoje: e ela que alimenta o "encerrada as HH:MM · ver resumo" e deixa
      // o resumo ser reaberto depois. `status === "closed"` e o que a tela usa
      // para nao oferecer os botoes de abrir e fechar de novo.
      const current = emAndamento ?? ((fechada?.[0] as Operation | undefined) ?? null);
      setOperation(current);

      if (current) {
        const { data: st } = await supabase
          .from("checklist_state")
          .select("*")
          .eq("operation_id", current.id);
        if (st) {
          // A resposta chega segundos depois do toque. O que a Romana marcou
          // nesse meio tempo vale mais do que esta foto do servidor.
          const doServidor = st as ChecklistStateRow[];
          limparToquesVencidos(toquesRecentes.current, doServidor);
          setStates((prev) => aplicarToquesLocais(doServidor, prev, toquesRecentes.current));
        }

        // Caixa esperado: le o que ja existe nas duas tabelas, sem redigitar
        // nada. Venda cancelada nao entra — a mesma regra do resto do app.
        //
        // `cup_count` e `created_at` entram por causa do resumo do dia
        // (ops 24): copos vendidos e o ritmo em copos/hora. Duas colunas a
        // mais no mesmo select, sem consulta nova e sem mudanca de banco.
        const [{ data: sl }, { data: ex }, { data: todasDoDia }] = await Promise.all([
          supabase
            .from("sales")
            .select("total,payment,cancelled,tip,cup_count,created_at")
            .eq("operation_id", current.id),
          supabase.from("expenses").select("type,value").eq("operation_id", current.id),
          // Vendas de hoje sem operacao amarrada. Traz as do dia inteiro e
          // filtra aqui de proposito: `.is("operation_id", null)` seria uma
          // forma nova de consulta para o mock do `.preview/` aprender, e o
          // dia tem dezenas de linhas, nao milhares.
          supabase.from("sales").select("id,operation_id").eq("local_date", today()),
        ]);
        const vendasDaOperacao = (sl as VendaDoResumo[] | null) ?? [];
        setVendas(vendasDaOperacao);
        setOrfas(
          ((todasDoDia as { id: string; operation_id: string | null }[] | null) ?? []).filter(
            (linha) => !linha.operation_id,
          ).length,
        );
        setExpected(
          expectedCash(
            current,
            vendasDaOperacao,
            (ex as { type: string; value: number }[]) ?? [],
          ),
        );
      } else {
        toquesRecentes.current.clear();
        setStates([]);
        setExpected(null);
        setVendas([]);
        setOrfas(0);
      }

      const { data: pend } = await supabase
        .from("pendencies")
        .select("*")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });
      if (pend) setPendencies(pend as Pendency[]);

      const { data: pl } = await supabase.from("places").select("*").order("name");
      if (pl) setPlaces(pl as Place[]);
      const { data: ev } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (ev) setEvents(ev as SunbiteEvent[]);

      // Deposita na vista da Home o que so daqui da para ler: `opened_at` e o
      // nome do local ficam fora do que o anon enxerga (ver operations.ts).
      // Sem isto a Home mostra "Operacao em andamento" sem local nem duracao.
      if (current?.status === "open") {
        const local = (pl as Place[] | null)?.find((p) => p.id === current.place_id);
        void cacheOpenOperationView({
          id: current.id,
          local_date: current.local_date,
          opened_at: current.opened_at,
          place_name: local?.name ?? null,
        });
      }
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem no estado local.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelado = false;
    void subscribeRealtime(["operations", "checklist_state", "pendencies"], () => {
      if (!cancelado) void load();
    }).then((fn) => {
      if (cancelado) fn();
      else unsub = fn;
    });
    return () => {
      cancelado = true;
      unsub?.();
    };
  }, [load]);

  useEffect(() => {
    const onOnline = () => void flushOutbox();
    window.addEventListener("online", onOnline);
    void flushOutbox();
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /**
   * O campo do caixa inicial nasce vazio a cada abertura da tela. Se o valor
   * ja foi gravado, ele volta escrito — senao a tela mostra um campo em
   * branco para um dia que ja tem caixa, e o proximo toque em Abrir gravaria
   * `null` por cima.
   */
  useEffect(() => {
    if (operation?.cash_initial != null) setCashInitial(String(operation.cash_initial));
  }, [operation?.cash_initial]);

  /** O recado da trava some sozinho — 4s e o bastante para ler duas linhas. */
  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(id);
  }, [aviso]);

  async function startOperation() {
    /**
     * Antes de criar, procura uma operacao de hoje que ja exista (ops 24).
     *
     * Sem isto, um toque aqui num dia que ja tem operacao cria a segunda —
     * `operations` nao tem restricao nenhuma de unicidade por data (so o
     * `status_check` e as chaves estrangeiras). Foi assim que 21/09 e 22/09
     * ficaram com operacoes vazias penduradas no banco, inalcancaveis pela
     * tela, porque operacao planejada de dia anterior e ignorada no `load()`.
     */
    try {
      const supabase = await getSupabase();
      const { data: jaExiste } = await supabase
        .from("operations")
        .select("*")
        .eq("local_date", today())
        .limit(1);
      const doDia = (jaExiste?.[0] as Operation | undefined) ?? null;
      if (doDia) {
        setOperation(doDia);
        return;
      }
    } catch {
      // Offline: segue e cria. A fila cuida do resto, e o dia sem operacao e
      // pior do que o risco de uma duplicata que da para juntar depois.
    }

    const row: Operation = {
      id: crypto.randomUUID(),
      local_date: today(),
      place_id: null,
      event_id: null,
      status: "planned",
      cash_initial: null,
      cash_final: null,
      opened_by: null,
      opened_at: null,
      closed_by: null,
      closed_at: null,
      created_at: new Date().toISOString(),
    };
    setOperation(row);
    // Linha inteira, entao os NOT NULL estao satisfeitos — mas o resultado e
    // conferido do mesmo jeito: comecar o dia e o passo que nao pode falhar
    // calado.
    const { erro } = await queueWrite("operations", row);
    if (erro) setOperation(null);
    setErroGravacao(erro);
  }

  /**
   * Toda escrita em `operations` passa por aqui, por dois motivos.
   *
   * 1. **`local_date` vai sempre junto.** A fila grava com `upsert`, e upsert
   *    e um INSERT que so vira UPDATE depois de bater no conflito de `id` — o
   *    INSERT precisa satisfazer os NOT NULL da tabela ANTES disso. Sem a
   *    data, o Postgres recusa com `23502` e nada e gravado. Foi assim que a
   *    operacao de 06/09 passou a feira inteira em `planned`, sem caixa
   *    inicial e sem hora, com o Felipe tendo apertado os botoes: o checklist
   *    manda a linha inteira e passava, os botoes daqui mandavam so um pedaco
   *    e falhavam calados. Quem criar um botao novo nesta tela usa esta
   *    funcao, nunca `queueWrite("operations", ...)` direto.
   * 2. **A recusa aparece na tela.** Antes ela morria no log, e o estado
   *    otimista continuava mostrando "aberta". Aqui, servidor recusou =
   *    a tela volta ao que o servidor tem e o erro fica escrito.
   *
   * Offline nao e recusa: a fila guarda, o estado otimista fica, e sobe
   * sozinho quando a rede voltar.
   */
  async function salvarOperacao(patch: Partial<Operation> & { id: string }) {
    if (!operation) return;
    const antes = operation;
    setOperation({ ...operation, ...patch });
    const { erro } = await queueWrite("operations", { local_date: operation.local_date, ...patch });
    if (erro) setOperation(antes);
    setErroGravacao(erro);
  }

  async function toggleItem(template: ChecklistTemplate) {
    if (!operation) return;
    const existing = states.find((s) => s.template_id === template.id);
    const next: ChecklistStateRow = {
      id: existing?.id ?? crypto.randomUUID(),
      operation_id: operation.id,
      template_id: template.id,
      checked: !(existing?.checked ?? false),
      checked_by: identity.userId,
      checked_at: new Date().toISOString(),
    };
    // Marca ja, e anota que este valor manda enquanto estiver fresco: a
    // proxima leitura do realtime nao pode desmarcar o card na cara dela.
    toquesRecentes.current.set(template.id, { checked: next.checked, em: Date.now() });
    setStates((prev) => [...prev.filter((s) => s.template_id !== template.id), next]);
    await queueWrite("checklist_state", next, "operation_id,template_id");
  }

  async function linkPlaceEvent(patch: { place_id?: string | null; event_id?: string | null }) {
    if (!operation) return;
    await salvarOperacao({ id: operation.id, ...patch });
  }

  async function openOperation() {
    if (!operation) return;
    await salvarOperacao({
      id: operation.id,
      status: "open",
      opened_by: identity.userId,
      opened_at: new Date().toISOString(),
      cash_initial: cashInitial ? Number(cashInitial) : null,
    });
  }

  /**
   * Fecha a operacao (decisao 7). A diferenca entre o caixa esperado e o
   * contado nao pode morrer numa coluna: vira lancamento no Financeiro,
   * amarrado a esta operacao, com o motivo escrito pela Romana.
   *
   * O tipo e `movimento_caixa` com categoria `ajuste`, e nao um tipo
   * `ajuste` proprio: o check de `expenses` so aceita tres tipos, e criar um
   * quarto exigiria alterar uma restricao de tabela em producao. O efeito e
   * o mesmo, e `v_finance_daily` ja soma isso sem alteracao nenhuma.
   */
  async function closeOperation() {
    if (!operation) return;
    const contado = contadoAgora;
    const diff = diferenca;

    // As duas travas do encerramento, e so elas. Contar o dinheiro e decisao
    // do Felipe de 22/09: dia que fecha sem contagem vira buraco de caixa que
    // so aparece semanas depois, quando o numero seguinte nao bate.
    if (contado === null) return;
    if (diff !== null && diff !== 0 && !closeReason.trim()) return;

    const fim = new Date().toISOString();
    const semAbertura = operation.status !== "open" || !operation.opened_at;
    const primeiraVenda = vendas
      .filter((v) => !v.cancelled)
      .map((v) => v.created_at)
      .sort()[0];
    const inicio = operation.opened_at ?? primeiraVenda ?? null;

    await salvarOperacao({
      id: operation.id,
      status: "closed",
      closed_by: identity.userId,
      closed_at: fim,
      cash_final: contado,
    });

    // A Home e o carimbo da venda leem o cache, nao o banco. Esquecer aqui
    // evita "Encerrar o dia" num dia ja encerrado e venda nova amarrada a uma
    // operacao fechada.
    await limparCacheOperacaoAberta();

    if (diff !== null && diff !== 0) {
      try {
        const supabase = await getSupabase();
        await supabase.from("expenses").insert({
          type: "movimento_caixa",
          category: "ajuste",
          description: closeReason.trim(),
          value: diff,
          occurred_at: operation.local_date,
          operation_id: operation.id,
          created_by: identity.userId,
        });
      } catch {
        // Sem rede na hora do fechamento: a operacao ja fechou pela fila, e o
        // ajuste fica registrado no motivo. Nao vale travar o encerramento.
      }
    }

    /**
     * Dia encerrado sem ter sido aberto vira ocorrencia (decisao do Felipe,
     * 22/09: "encerra do mesmo jeito e marca a falha").
     *
     * Ocorrencia, e nao coluna nova: `pendencies` ja existe, ja aparece na
     * propria tela de Operacao e ja tem `operation_id`. Coluna nova custaria
     * SQL em producao antes do deploy — o risco conhecido da Fatia 3 — para
     * guardar o que esta lista guarda de graca.
     */
    if (semAbertura) {
      const ocorrencia: Pendency = {
        id: crypto.randomUUID(),
        description: t("close.noOpeningPendency"),
        critical: false,
        status: "aberta",
        origin: "encerramento",
        operation_id: operation.id,
        created_by: identity.userId,
        created_at: new Date().toISOString(),
        resolved_by: null,
        resolved_at: null,
      };
      setPendencies((prev) => [ocorrencia, ...prev]);
      await queueWrite("pendencies", ocorrencia);
    }

    setResumo({
      inicio,
      inicioEstimado: !operation.opened_at && !!primeiraVenda,
      fim,
      placeName: places.find((p) => p.id === operation.place_id)?.name ?? null,
      eventName: nomeDoEvento(events.find((e) => e.id === operation.event_id)),
      cups: ativas.reduce((n, v) => n + (v.cup_count ?? 0), 0),
      vendas: ativas.length,
      revenue: ativas.reduce((n, v) => n + Number(v.total), 0),
      cash: expected?.cashSales ?? 0,
      twint: expected?.twintSales ?? 0,
      tips: (expected?.cashTips ?? 0) + (expected?.twintTips ?? 0),
      expected,
      counted: contado,
      diff,
      reason: closeReason.trim(),
      semAbertura,
      orfas,
      online: navigator.onLine,
    });
    setCloseReason("");
  }

  /** O nome do evento no idioma da tela, ou nulo quando nao ha evento. */
  function nomeDoEvento(ev: SunbiteEvent | undefined): string | null {
    if (!ev) return null;
    return (lang === "de" ? ev.label_de : ev.label_en) || t("operation.event");
  }

  /**
   * Remonta o resumo de um dia que ja estava encerrado quando a tela abriu —
   * o caminho do "ver resumo", diferente do resumo que nasce no toque em
   * encerrar. Os numeros sao os mesmos, e vem todos do `load()`: a operacao
   * fechada de hoje e as vendas dela.
   *
   * O motivo da diferenca nao entra aqui: ele foi gravado como lancamento no
   * Financeiro, e repeti-lo de cabeca seria inventar. A linha da diferenca
   * continua aparecendo.
   */
  function abrirResumoDoFechado() {
    if (!operation || operation.status !== "closed") return;
    const fim = operation.closed_at ?? new Date().toISOString();
    const primeiraVenda = ativas.map((v) => v.created_at).sort()[0];
    const contadoNoFechamento =
      operation.cash_final === null ? null : Number(operation.cash_final);
    setResumo({
      inicio: operation.opened_at ?? primeiraVenda ?? null,
      inicioEstimado: !operation.opened_at && !!primeiraVenda,
      fim,
      placeName: places.find((p) => p.id === operation.place_id)?.name ?? null,
      eventName: nomeDoEvento(events.find((e) => e.id === operation.event_id)),
      cups: ativas.reduce((n, v) => n + (v.cup_count ?? 0), 0),
      vendas: ativas.length,
      revenue: ativas.reduce((n, v) => n + Number(v.total), 0),
      cash: expected?.cashSales ?? 0,
      twint: expected?.twintSales ?? 0,
      tips: (expected?.cashTips ?? 0) + (expected?.twintTips ?? 0),
      expected,
      counted: contadoNoFechamento,
      diff:
        expected && contadoNoFechamento !== null
          ? rappen(contadoNoFechamento - expected.expected)
          : null,
      reason: "",
      semAbertura: !operation.opened_at,
      orfas,
      online: navigator.onLine,
    });
  }

  /** Chega pronta da folha de Ocorrencia — aqui so entra na lista da tela. */
  function onOccurrenceSaved(row: Pendency) {
    setPendencies((prev) => [row, ...prev]);
  }

  async function resolvePendency(p: Pendency) {
    const patch = {
      id: p.id,
      status: "concluida" as const,
      resolved_by: identity.userId,
      resolved_at: new Date().toISOString(),
    };
    setPendencies((prev) => prev.filter((x) => x.id !== p.id));
    await queueWrite("pendencies", patch);
  }

  /**
   * O dinheiro contado. Nulo tanto para campo vazio quanto para texto que nao
   * vira numero — os dois casos significam a mesma coisa para o encerramento:
   * ninguem contou ainda.
   */
  const contadoBruto = cashFinal.trim() === "" ? null : Number(cashFinal);
  const contadoAgora =
    contadoBruto !== null && Number.isFinite(contadoBruto) ? contadoBruto : null;
  /** Nulo enquanto nao da para comparar — sem esperado ou sem contado. */
  const diferenca =
    expected && contadoAgora !== null ? rappen(contadoAgora - expected.expected) : null;
  const precisaMotivo = diferenca !== null && diferenca !== 0;
  /** Vendas que contam: canceladas ficam de fora, aqui como no resto do app. */
  const ativas = vendas.filter((v) => !v.cancelled);


  const stateByTemplate = new Map(states.map((s) => [s.template_id, s]));

  /** Quantos itens da fase ja foram marcados. Fase sem item nenhum: 0 de 0. */
  function progresso(p: Phase) {
    const itens = templates.filter((tp) => tp.phase === p);
    const feitos = itens.filter((tp) => stateByTemplate.get(tp.id)?.checked).length;
    return { feitos, total: itens.length };
  }

  /**
   * A trava de hierarquia (decisao do Felipe, 28/08): uma fase so abre quando
   * **todos** os itens de **todas** as fases anteriores estao marcados.
   * Devolve a primeira fase incompleta, ou null se pode entrar.
   *
   * ⚠️ Vale so para os cards. `openOperation` e `closeOperation` continuam
   * livres de proposito — nada pode travar a Romana no meio da feira.
   */
  function travaDe(p: Phase): { fase: Phase; faltam: number } | null {
    const ate = PHASES.indexOf(p);
    for (let i = 0; i < ate; i++) {
      const { feitos, total } = progresso(PHASES[i]);
      if (feitos < total) return { fase: PHASES[i], faltam: total - feitos };
    }
    return null;
  }

  /** Erro suave: o card balanca, sobe o recado, e nada bloqueia. */
  function abrirFase(p: Phase) {
    const trava = travaDe(p);
    if (!trava) {
      setVista(p);
      return;
    }
    setTremendo({ fase: p, n: (tremendo?.n ?? 0) + 1 });
    setAviso(
      t("checklist.locked", {
        n: trava.faltam,
        phase: t(`operation.phase.${trava.fase}`),
      }),
    );
  }

  /** A fase seguinte de `p` na ordem de `PHASES`, ou null na ultima. */
  function proximaFase(p: Phase): Phase | null {
    const i = PHASES.indexOf(p);
    return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1] : null;
  }

  /**
   * Avanca pelo botao do rodape da fase. Vai direto no `setVista`, sem passar
   * por `abrirFase`: a trava de hierarquia e dos cards da grade, e aqui so
   * faria o card tremer sem deixar a Romana seguir. Quem esta na feira decide.
   */
  function avancarPara(p: Phase) {
    setVista(p);
    // A lista da fase anterior pode ser longa; sem isto a nova abre no meio.
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }

  /**
   * Qual card ganha o anel de "continue por aqui". `phaseFor` deixou de trocar
   * a tela sozinho (era o efeito que roubava a aba) e passou a fazer so isto.
   */
  const faseSugerida: Phase = operation
    ? phaseFor(operation.status, prepDone(templates, states))
    : "preparacao";

  const EMOJI_FASE: Record<Phase, string> = {
    preparacao: "🧰",
    saida: "🚚",
    operacao: "🎪",
    encerramento: "🌙",
  };

  const itensDaVista = vista ? templates.filter((tp) => tp.phase === vista) : [];

  return (
    <div ref={containerRef} className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("operation.title")} onClose={onClose} />
      <Aviso texto={aviso} />

      {/* Recusa do servidor. Fica ate a proxima gravacao passar: erro que
          desaparece sozinho e como o defeito que trouxe esta faixa aqui. */}
      {erroGravacao && (
        <div className="border-b-2 border-brand-dark bg-brand-dark px-4 py-3 text-cream">
          <p className="text-sm font-bold">{t("operation.saveFailed")}</p>
          <p className="mt-1 break-words text-xs opacity-90">{erroGravacao}</p>
        </div>
      )}

      {!navigator.onLine && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("operation.offlineNotice")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && !operation && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-ink-muted">{t("operation.none")}</p>
          <button
            onClick={() => void startOperation()}
            className="rounded-2xl bg-brand px-6 py-4 font-semibold text-cream"
          >
            {t("operation.start")}
          </button>
        </div>
      )}

      {/* ---------- A grade das quatro fases (estilo Home V2) ---------- */}
      {!loading && operation && vista === null && (
        <div className="flex-1 space-y-5 bg-brand p-4">
          {operation.status === "closed" && (
            <CardEncerrada operation={operation} onVerResumo={abrirResumoDoFechado} />
          )}

          <GridCards>
            {PHASES.map((p) => {
              const { feitos, total } = progresso(p);
              const trava = travaDe(p);
              const completa = total > 0 && feitos === total;
              return (
                <Tile
                  key={p}
                  icone={EMOJI_FASE[p]}
                  label={t(`operation.phase.${p}`)}
                  apoio={t("checklist.progress", { done: feitos, total })}
                  atenuado={!!trava}
                  destacado={!trava && p === faseSugerida}
                  tremer={tremendo?.fase === p ? tremendo.n : 0}
                  onClick={() => abrirFase(p)}
                  pill={
                    <StatusPill tone={trava ? "neutral" : completa ? "ok" : "warn"}>
                      {t(
                        trava
                          ? "checklist.state.locked"
                          : completa
                            ? "checklist.state.done"
                            : "checklist.state.doing",
                      )}
                    </StatusPill>
                  }
                />
              );
            })}
          </GridCards>

          {/* Ocorrencias em container proprio, com respiro — nao e uma quinta
              fase, e nao pode parecer uma. */}
          <section className="space-y-3 rounded-3xl bg-cream-soft p-4">
            <h2 className="font-display text-xl">{t("pendency.title")}</h2>
            {/* Mesma folha que abre de dentro do PDV — um caminho so para
                registrar ocorrencia, aqui e la. */}
            <TileButton
              emoji="⚠️"
              label={t("pendency.add")}
              variant="dashed"
              onClick={() => setOccurrence(true)}
            />

            <ul className="divide-y divide-black/10 rounded-2xl bg-cream">
              {pendencies.length === 0 && (
                <li className="p-4 text-center text-ink-muted">{t("pendency.empty")}</li>
              )}
              {pendencies.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <span className="flex-1">
                    {p.description}
                    {p.critical && (
                      <span className="ml-2 rounded-full bg-red-700/10 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {t("pendency.critical")}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => void resolvePendency(p)}
                    className="shrink-0 rounded-lg border border-brand px-3 py-1 text-sm font-semibold text-brand"
                  >
                    {t("pendency.resolve")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* ---------- Dentro de uma fase ---------- */}
      {!loading && operation && vista !== null && (
        <div className="flex-1 space-y-4 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVista(null)}
              className="flex shrink-0 items-center gap-1 rounded-lg py-2 pr-2 font-semibold text-brand"
            >
              <span className="text-xl leading-none">‹</span>
              {t("checklist.backToPhases")}
            </button>
            <h2 className="min-w-0 flex-1 truncate font-display text-xl">
              {t(`operation.phase.${vista}`)}
            </h2>
            <span className="shrink-0 text-sm text-ink-muted">
              {t("checklist.progress", {
                done: progresso(vista).feitos,
                total: progresso(vista).total,
              })}
            </span>
          </div>

          {/* A fase `operacao` mostra a lista como as outras. Ate a ops 15 a
              condicao era `tab !== "operacao"`, e o item do teto solar estava
              gravado no banco sem aparecer em tela nenhuma. */}
          {itensDaVista.length === 0 ? (
            <p className="rounded-2xl bg-cream p-4 text-center text-ink-muted">
              {t("checklist.empty")}
            </p>
          ) : (
            <GridCards colunas={3}>
              {itensDaVista.map((tpl) => (
                <CardToggle
                  key={tpl.id}
                  icone={<Ilustracao slug={tpl.icon} />}
                  label={lang === "de" ? tpl.label_de : tpl.label_pt}
                  marcado={!!stateByTemplate.get(tpl.id)?.checked}
                  onClick={() => void toggleItem(tpl)}
                  selo={
                    tpl.critical ? (
                      <StatusPill tone="danger">{t("checklist.critical")}</StatusPill>
                    ) : undefined
                  }
                />
              ))}
            </GridCards>
          )}

          {vista === "saida" && (
            <div className="space-y-2 rounded-2xl bg-cream p-4">
              <label className="block text-sm font-semibold">{t("operation.place")}</label>
              <select
                value={operation.place_id ?? ""}
                onChange={(e) => void linkPlaceEvent({ place_id: e.target.value || null })}
                className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
              >
                <option value="">{t("places.noPlace")}</option>
                {places.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>

              <label className="block text-sm font-semibold">{t("operation.event")}</label>
              <select
                value={operation.event_id ?? ""}
                onChange={(e) => void linkPlaceEvent({ event_id: e.target.value || null })}
                className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
              >
                <option value="">{t("operation.noEvent")}</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {new Date(ev.starts_at).toLocaleDateString()} ·{" "}
                    {(lang === "de" ? ev.label_de : ev.label_en) || t("operation.event")}
                  </option>
                ))}
              </select>

              {(() => {
                const linkedEvent = events.find((ev) => ev.id === operation.event_id);
                if (!linkedEvent) return null;
                const linkedPlace = places.find((pl) => pl.id === operation.place_id) ?? null;
                return (
                  <a
                    href={googleCalendarUrl(linkedEvent, lang, linkedPlace)}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full rounded-2xl border-2 border-brand py-3 text-center font-semibold text-brand"
                  >
                    {t("operation.addToCalendar")}
                  </a>
                );
              })()}
            </div>
          )}

          {vista === "saida" && operation.status === "planned" && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold">{t("operation.cashInitial")}</label>
              <input
                type="number"
                inputMode="decimal"
                value={cashInitial}
                onChange={(e) => setCashInitial(e.target.value)}
                className="w-full rounded-lg border border-black/20 bg-cream px-3 py-2"
              />
              {/* Sem trava aqui de proposito: abrir a operacao nunca depende
                  do checklist estar completo. */}
              <button
                onClick={() => void openOperation()}
                className="w-full rounded-2xl bg-brand py-4 font-semibold text-cream"
              >
                {t("operation.open")}
              </button>
            </div>
          )}

          {vista === "operacao" && (
            <div className="space-y-3 rounded-2xl bg-cream p-4">
              <h2 className="font-display text-xl">{t("operation.summary")}</h2>
              {operation.opened_at && (
                <p className="text-sm text-ink-muted">
                  {t("operation.openedInfo", {
                    time: new Date(operation.opened_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    who: operation.opened_by === identity.userId ? identity.email : "—",
                  })}
                </p>
              )}
            </div>
          )}

          {/* O encerramento aparece com a operacao ABERTA ou PLANEJADA
              (ops 24). Ate aqui a condicao era so `=== "open"`, e o dia que
              ninguem "abriu" chegava no Encerramento e encontrava apenas o
              checklist — sem botao nenhum para dizer que acabou. Foi o que
              aconteceu na feira de 18/09. */}
          {vista === "encerramento" && operation.status !== "closed" && (
            <div className="space-y-3 rounded-2xl bg-cream p-4">
              <h2 className="font-display text-xl">{t("close.title")}</h2>

              {operation.status === "planned" && (
                <p className="rounded-xl bg-brand/10 p-3 text-sm leading-relaxed text-brand-dark">
                  {t("close.neverOpened")}
                </p>
              )}

              <label className="block text-sm font-semibold">{t("operation.cashFinal")}</label>
              <input
                type="number"
                inputMode="decimal"
                value={cashFinal}
                onChange={(e) => setCashFinal(e.target.value)}
                className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-3 text-xl tabular-nums"
              />

              {expected && (
                <div className="space-y-1">
                  {/* Esperado × contado × diferenca (PRD 7.3). Cada linha e
                      uma grade de duas colunas: o valor nunca disputa
                      largura com o rotulo. */}
                  <Linha label={t("close.expected")} value={money(expected.expected)} />
                  <Linha
                    label={t("close.counted")}
                    value={contadoAgora === null ? "—" : money(contadoAgora)}
                  />
                  <Linha
                    label={t("close.difference")}
                    value={diferenca === null ? "—" : money(diferenca)}
                    destaque={precisaMotivo}
                  />
                  <p className="pt-1 text-xs text-ink-muted">
                    {t("close.breakdown", {
                      initial: money(expected.initial),
                      sales: money(expected.cashSales),
                    })}
                    {(expected.entries || expected.costs || expected.movements) !== 0 &&
                      ` · ${t("close.adjustments", {
                        value: money(expected.entries - expected.costs + expected.movements),
                      })}`}
                  </p>
                  {/* Gorjeta em dinheiro esta fisicamente na caixa, entao ja
                      entrou no esperado acima. Aparece escrita porque, sem
                      isso, o esperado sobe e a Romana nao sabe de onde veio. */}
                  {expected.cashTips > 0 && (
                    <p className="text-xs text-ink-muted">
                      {t("close.tipsCash")}: {money(expected.cashTips)}
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">
                    {t("close.twintNote", { value: money(expected.twintSales) })}
                  </p>
                </div>
              )}

              {precisaMotivo && (
                <>
                  <label className="block text-sm font-semibold">{t("close.reason")}</label>
                  <input
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder={t("close.reasonPlaceholder")}
                    className="w-full rounded-lg border border-black/20 bg-cream-soft px-3 py-2"
                  />
                  {!closeReason.trim() && (
                    <p className="text-sm font-semibold text-red-800">
                      {t("close.reasonRequired")}
                    </p>
                  )}
                </>
              )}

              {/* Sem trava de fase aqui: encerrar o dia nunca depende do
                  checklist. As travas sao duas, e as duas sao do fechamento:
                  contar o dinheiro (ops 24) e escrever o motivo quando a
                  diferenca nao e zero (decisao 7). */}
              {contadoAgora === null && (
                <p className="text-sm font-semibold text-red-800">{t("close.countedRequired")}</p>
              )}
              <button
                onClick={() => void closeOperation()}
                disabled={contadoAgora === null || (precisaMotivo && !closeReason.trim())}
                className="w-full rounded-2xl bg-brand py-4 font-semibold text-cream disabled:opacity-40"
              >
                {t("close.confirm")}
              </button>
            </div>
          )}

          {/* Dia ja encerrado: o resumo continua a um toque. Sem isto, sair da
              folha e voltar a esta tela daria "Nenhuma operacao em andamento",
              que e exatamente a resposta que fazia o encerramento parecer nao
              ter funcionado. */}
          {vista === "encerramento" && operation.status === "closed" && (
            <CardEncerrada operation={operation} onVerResumo={abrirResumoDoFechado} />
          )}

          {/* Avancar de fase. Fica no fim de tudo para nao disputar o olho com
              "Abrir operacao" / "Fechar caixa", que continuam sendo a acao
              principal das suas fases. Some no `encerramento` — dali nao ha
              para onde ir. Nunca fica `disabled`: com item faltando ele so
              muda de peso e avisa no texto, porque nada pode travar a Romana
              no meio da feira. */}
          {(() => {
            const proxima = proximaFase(vista);
            if (!proxima) return null;
            const { feitos, total } = progresso(vista);
            const completa = feitos === total;
            const rotulo = t(completa ? "checklist.nextPhase" : "checklist.nextPhaseAnyway", {
              phase: t(`operation.phase.${proxima}`),
            });
            return (
              <button
                onClick={() => avancarPara(proxima)}
                className={`min-h-[44px] w-full rounded-2xl px-4 py-4 font-semibold leading-tight break-words ${
                  completa ? "bg-brand text-cream" : "border-2 border-brand text-brand"
                }`}
              >
                {rotulo}
              </button>
            );
          })()}
        </div>
      )}

      {occurrence && (
        <OccurrenceSheet
          onClose={() => setOccurrence(false)}
          createdBy={identity.userId}
          onSaved={onOccurrenceSaved}
        />
      )}

      {resumo && <FolhaDoResumo resumo={resumo} onClose={() => setResumo(null)} />}
    </div>
  );
}

/**
 * "Operacao de hoje encerrada as 23:27 · ver resumo".
 *
 * Existe para responder ao toque que encerra o dia. Antes da ops 24 a
 * operacao fechada sumia da tela e o que aparecia era "Nenhuma operacao em
 * andamento" com um botao de comecar outra — resposta que parece falha, e que
 * convida a criar a operacao fantasma seguinte.
 */
function CardEncerrada({
  operation,
  onVerResumo,
}: {
  operation: Operation;
  onVerResumo: () => void;
}) {
  const { t } = useLang();
  return (
    // `bg-cream`, e nao `cream-soft`: dentro da fase o fundo ja e cream-soft
    // e o card sumia — o texto ficava solto no meio da tela, sem parecer um
    // bloco. Na grade, sobre o vermelho, os dois funcionariam.
    <section className="space-y-3 rounded-3xl bg-cream p-4">
      <p className="font-display text-lg leading-tight break-words">
        {t("summary.closedAt", { time: hora(operation.closed_at) })}
      </p>
      <TileButton emoji="📄" label={t("summary.view")} variant="dashed" onClick={onVerResumo} />
    </section>
  );
}
