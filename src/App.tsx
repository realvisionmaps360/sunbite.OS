import { AnimatePresence } from "framer-motion";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { HomeScreen } from "./components/HomeScreen";
import { BottomNav, BOTTOM_NAV_PAD } from "./components/BottomNav";
import { OrderSummary } from "./components/OrderSummary";
import { PaymentSheet } from "./components/PaymentSheet";
import { ReviewSheet } from "./components/ReviewSheet";
import { SalesScreen } from "./components/SalesScreen";
import { MenuScreen } from "./components/MenuScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { SaleConfirmation, type Confirmation } from "./components/SaleConfirmation";
import { Valor } from "./components/Valor";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  AIScreen,
  EquipmentScreen,
  FinanceScreen,
  LoginScreen,
  OperationScreen,
  PlacesScreen,
  PricesScreen,
  StockScreen,
  SuppliersScreen,
} from "./components/adminScreens";
import { TOPPINGS } from "./config";
import { deviceId, pendingSales, saveSale } from "./db";
import {
  PAR_EVENTO,
  VITRINE_EVENTO,
  lerPar,
  lerVitrine,
  marcarPresenca,
  type EstadoDisplay,
} from "./display/protocol";
import type { Emissor } from "./display/emit";
import { LangToggle, useLang } from "./i18n";
import { logEvent } from "./log";
import { getCachedOpenOperationId, refreshOpenOperationId } from "./operations";
import { useOrder } from "./order";
import { getCupPrice, getToppingPrice, refreshPrices } from "./prices";
import { loadConfig, syncNow } from "./sync";
import type { Payment, Sale } from "./types";

// Este arquivo nunca importa ./auth nem ./supabase, em lugar nenhum — e essa
// ausencia, nao um `if`, que garante que a venda nao depende de login.
//
// O Customer Display (Etapa 10) respeita a mesma regra por dois caminhos:
// `display/protocol.ts` e puro (nao importa Supabase nenhum) e o tipo
// `Emissor` e importado com `import type`, que some no build. Quem carrega o
// Supabase e `display/emit.ts`, por `import()` dinamico e **so quando existe
// um iPad pareado**. Sem par, o chunk nem e baixado.
// SystemScreen tambem nao exige sessao (funciona offline/deslogada), entao
// nao entra no barril adminScreens.ts — tem seu proprio lazy() aqui.
const SystemScreen = lazy(() => import("./components/SystemScreen"));

// A folha de Ocorrencia (Fatia 3) grava pela fila do outbox, que importa
// ./supabase. Entra por lazy() pelo mesmo motivo das telas administrativas:
// assim a biblioteca so baixa quando a folha abre, e o pacote do caminho da
// venda continua sem ela.
const OccurrenceSheet = lazy(() => import("./components/OccurrenceSheet"));

export type Screen =
  | "home"
  | "sale"
  | "payment"
  | "review"
  | "sales"
  | "menu"
  | "settings"
  | "login"
  | "system"
  | "operation"
  | "equipment"
  | "suppliers"
  | "stock"
  | "finance"
  | "prices"
  | "places"
  | "ai";

/**
 * Casca compartilhada das telas carregadas sob demanda: fronteira de erro,
 * espera enquanto o chunk baixa, e uma saida para a Home que funciona mesmo
 * quando a tela nem carregou.
 *
 * Antes da V2 este bloco estava escrito onze vezes, identico, com so o nome
 * da tela e a chave de erro mudando — quase 230 linhas. Errar uma copia era
 * deixar uma tela sem rede de seguranca sem ninguem notar.
 */
function LazyScreen({
  onClose,
  errorText,
  children,
}: {
  onClose: () => void;
  errorText: string;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="tela-sobreposta z-20 flex flex-col bg-cream-soft">
          <header className="flex items-center justify-end bg-brand px-4 py-3 text-cream">
            <button onClick={onClose} className="px-3 py-1 text-3xl leading-none">
              ×
            </button>
          </header>
          <p className="flex-1 flex items-center justify-center p-6 text-center text-brand-dark">
            {errorText}
          </p>
        </div>
      }
    >
      <Suspense fallback={<div className="tela-sobreposta z-20 bg-cream-soft" />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/** [tela, componente, chave do texto de erro] — a ordem nao importa. */
const LAZY_SCREENS: [Screen, ComponentType<{ onClose: () => void }>, string][] = [
  ["login", LoginScreen, "auth.loadError"],
  ["system", SystemScreen, "system.loadError"],
  ["operation", OperationScreen, "operation.loadError"],
  ["equipment", EquipmentScreen, "equipment.loadError"],
  ["suppliers", SuppliersScreen, "suppliers.loadError"],
  ["stock", StockScreen, "stock.loadError"],
  ["finance", FinanceScreen, "finance.loadError"],
  ["prices", PricesScreen, "prices.loadError"],
  ["places", PlacesScreen, "places.loadError"],
  ["ai", AIScreen, "ai.loadError"],
];

/** Telas onde a barra de baixo NAO aparece — ver BottomNav.tsx. */
const SEM_BARRA: Screen[] = ["sale", "payment", "review"];

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    created_at: d.toISOString(),
    local_date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    local_time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

export default function App() {
  const { t } = useLang();
  const order = useOrder();
  const [screen, setScreen] = useState<Screen>("home");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [occurrence, setOccurrence] = useState(false);
  /**
   * Quanto o cliente deu, em dinheiro. Opcional, e so existe para o iPad
   * mostrar o troco — o PDV nunca precisou disto e continua nao precisando.
   * Nao entra em `Sale`, nao vai para o banco, some ao fim da venda.
   */
  const [recebido, setRecebido] = useState<number | null>(null);
  const errorTimer = useRef<number | undefined>(undefined);
  // Marca se a ultima tentativa de sync falhou, so para saber quando logar
  // a RECUPERACAO (Etapa 5) — nao muda syncNow() nem o que ele retorna.
  const syncFalhouAntes = useRef(false);

  const refreshPending = useCallback(async () => {
    setPending((await pendingSales()).length);
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  // Tenta sincronizar ao abrir, ao voltar a rede e de 2 em 2 minutos.
  // Nunca bloqueia a venda: falhou, fica pendente e tenta de novo depois.
  useEffect(() => {
    const attempt = async () => {
      void refreshOpenOperationId();
      void refreshPrices();
      const r = await syncNow();
      if (r.ok) {
        if (r.sent > 0) void refreshPending();
        if (syncFalhouAntes.current) {
          syncFalhouAntes.current = false;
          void logEvent("recovery", "Sincronização voltou a funcionar.");
        }
        return;
      }
      // "no-config" e "offline" sao estados normais (app roda o dia inteiro
      // sem rede) — so reason "error" e falha de verdade, e so essa carrega
      // a mensagem exata que a aba Erros precisa mostrar.
      if (r.reason === "error") {
        syncFalhouAntes.current = true;
        void logEvent("error", `Falha ao sincronizar: ${r.message ?? ""}`);
      }
    };
    void attempt();
    const id = window.setInterval(attempt, 120_000);
    window.addEventListener("online", attempt);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", attempt);
    };
  }, [refreshPending]);

  // ── Customer Display (Etapa 10) ───────────────────────────────────────────
  //
  // Abre o canal uma vez, se houver iPad pareado. `lerPar()` devolvendo null
  // e o que faz o `import()` nem acontecer — quem nao usa display nao baixa o
  // chunk nem paga o client do Supabase.
  //
  // ⚠️ `useState` e nao `useRef`, e isso e um defeito que o teste pegou: com
  // ref, o efeito que calcula o estado do iPad rodava na primeira renderizacao
  // — quando o `import()` ainda nao tinha voltado — via `null`, desistia, e
  // nunca mais rodava, porque nada nas dependencias mudava. O iPad ficava no
  // video ate alguem tocar no celular. Em estado, abrir o emissor dispara o
  // efeito de novo e o primeiro estado sai na hora.
  //
  // `parVersao` e o que faz parear valer NA HORA. A tela de Ajustes grava o
  // codigo e dispara `PAR_EVENTO`; este efeito roda de novo, fecha o canal
  // velho e abre o do codigo novo. Antes o gatilho era um `location.reload()`
  // dentro dos Ajustes — funcionava, e reiniciava o app na cara de quem estava
  // usando.
  const [emissor, setEmissor] = useState<Emissor | null>(null);
  const [parVersao, setParVersao] = useState(0);
  useEffect(() => {
    const aoMudar = () => setParVersao((n) => n + 1);
    window.addEventListener(PAR_EVENTO, aoMudar);
    return () => window.removeEventListener(PAR_EVENTO, aoMudar);
  }, []);
  useEffect(() => {
    const codigo = lerPar();
    if (!codigo) return;
    let vivo = true;
    let aberto: Emissor | null = null;
    void import("./display/emit").then((m) => {
      if (!vivo) return;
      // A presenca sobe para o modulo puro `display/protocol`, e e de la que a
      // tela de Ajustes le a bolinha. Assim a `DisplayScreen` continua sem
      // importar `emit.ts` — o isolamento do pacote da venda fica intacto e
      // nao existe um segundo canal aberto so para desenhar um ponto verde.
      aberto = m.abrirEmissor(codigo, { aoMudarPresenca: marcarPresenca });
      setEmissor(aberto);
    });
    return () => {
      vivo = false;
      aberto?.fechar();
      marcarPresenca(false);
      setEmissor(null);
    };
  }, [parVersao]);

  /**
   * A vitrine mudou nos Ajustes — remonta o payload AGORA.
   *
   * ⚠️ A vitrine pega carona no estado de repouso, e este efeito nao depende do
   * `localStorage`: nada aqui acordava quando o Felipe salvava. O unico gatilho
   * era um `location.reload()` na tela de Ajustes, e a batida de 8s do emissor
   * so reenviava o payload velho ja montado. Com o evento, o "o iPad muda em
   * segundos" vira verdade — sem recarregar nada.
   */
  const [vitrineVersao, setVitrineVersao] = useState(0);
  useEffect(() => {
    const aoMudar = () => setVitrineVersao((n) => n + 1);
    window.addEventListener(VITRINE_EVENTO, aoMudar);
    return () => window.removeEventListener(VITRINE_EVENTO, aoMudar);
  }, []);

  // O que o iPad deve estar mostrando agora. Derivado do estado que ja existe:
  // nenhuma tela do celular muda de comportamento por causa do display, e e
  // por isso que ele pode cair sem afetar a venda.
  useEffect(() => {
    if (!emissor) return;
    let estado: EstadoDisplay;
    if (confirmation) {
      estado = { kind: "obrigado", total: confirmation.total };
    } else if (screen === "review" && payment) {
      estado = {
        kind: "pagamento",
        payment,
        total: order.total,
        recebido,
        // Os copos vao junto para o iPad NAO precisar apagar o pedido ao
        // entrar no pagamento — ver o comentario em `EstadoDisplay`.
        cups: order.cups,
        precoCopo: getCupPrice(),
        precoTopping: getToppingPrice(),
      };
    } else if (
      (screen === "sale" || screen === "payment") &&
      order.cups.length > 0
    ) {
      estado = {
        kind: "pedido",
        cups: order.cups,
        total: order.total,
        // O iPad abre a conta linha por linha, e o preco mora no banco:
        // mandar o numero e o que impede as duas telas de discordarem.
        precoCopo: getCupPrice(),
        precoTopping: getToppingPrice(),
      };
    } else {
      // Home, telas administrativas, pedido vazio: volta a vitrine. O cliente
      // nao tem que ver o Financeiro da Sunbite.
      //
      // A vitrine viaja junto com o repouso, e nao numa mensagem propria: e o
      // unico estado em que ela importa, e assim o iPad recebe a configuracao
      // nova no primeiro instante em que teria como usa-la.
      estado = { kind: "repouso", vitrine: lerVitrine() };
    }
    // O celular manda o estado cru, sempre. Quem decide **quanto tempo** o
    // agradecimento fica na tela e o iPad, porque e a tela que o cliente esta
    // olhando (ver a guarda em `Display.tsx`).
    //
    // ⚠️ Ja tentei resolver isto aqui, engolindo o "repouso" que vem logo
    // depois do "obrigado" — e criei um defeito pior: como o emissor repete o
    // ultimo estado a cada 8s, o ultimo estado ficava "obrigado" para sempre e
    // o iPad nunca voltava a vitrine depois de uma venda. Guardar tempo no
    // lado que nao tem o relogio nao funciona.
    emissor.enviar(estado);
  }, [
    emissor,
    screen,
    payment,
    recebido,
    confirmation,
    order.cups,
    order.total,
    vitrineVersao,
  ]);

  /**
   * Botão/gesto físico de voltar do celular (Android): sem isto, como o app
   * não usa rotas de verdade, ele não tem para onde "voltar" e o sistema
   * fecha o app direto na primeira tela. Espelha exatamente o que cada botão
   * de fechar já faz, para o hardware nunca divergir do toque.
   */
  const goBack = useCallback(() => {
    if (occurrence) {
      setOccurrence(false);
      return;
    }
    if (confirmation) {
      setConfirmation(null);
      return;
    }
    if (error) {
      setError(null);
      return;
    }
    switch (screen) {
      case "review":
        setPayment(null);
        setScreen("sale");
        return;
      case "payment":
        setScreen("sale");
        return;
      case "sales":
      case "menu":
      case "settings":
      case "login":
      case "system":
      case "operation":
      case "equipment":
      case "suppliers":
      case "stock":
      case "finance":
      case "prices":
      case "places":
      case "ai":
        setScreen("home");
        return;
      case "sale":
        setScreen("home");
        return;
      case "home":
        // Na raiz, deixa o botão físico agir normal (sai do app).
        return;
    }
  }, [screen, confirmation, error, occurrence]);

  useEffect(() => {
    const onPopState = () => goBack();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goBack]);

  useEffect(() => {
    // Mantém sempre uma entrada de histórico "de troco" enquanto não está na
    // Home — é o que garante que o botão físico dispare popstate (e caia no
    // goBack de cima) em vez de fechar o app. Na Home, para de empilhar: aí
    // sim o próximo "voltar" deve sair do app, que é o comportamento certo
    // na raiz.
    if (screen !== "home") {
      history.pushState(null, "");
    }
  }, [screen]);

  const showError = (text: string) => {
    setError(text);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 5000);
  };

  /** Escolher o pagamento não grava nada: só leva para a conferência. */
  function choosePayment(p: Payment) {
    setPayment(p);
    setRecebido(null);
    setScreen("review");
  }

  /** O único lugar que grava uma venda. */
  async function commitSale() {
    if (!payment) return;

    const sale: Sale = {
      id: crypto.randomUUID(),
      ...stamp(),
      cup_count: order.cups.length,
      cups: order.cups,
      total: order.total,
      payment,
      device_id: deviceId(),
      operation_id: await getCachedOpenOperationId(),
      synced: false,
    };

    // Grava primeiro, celebra depois. Se o IndexedDB falhar, a tela nao zera.
    try {
      await saveSale(sale);
    } catch (e) {
      showError(t("error.save", { msg: (e as Error).message }));
      void logEvent("error", `Falha ao gravar venda: ${(e as Error).message}`);
      return;
    }

    navigator.vibrate?.(40);
    setConfirmation({
      total: sale.total,
      payment,
      cups: sale.cup_count,
      key: Date.now(),
    });
    order.reset();
    setPayment(null);
    setRecebido(null);
    setScreen("sale");
    void refreshPending();
    void syncNow().then((r) => {
      if (r.ok && r.sent > 0) void refreshPending();
    });
  }

  const empty = order.cups.length === 0;
  /** Cancela o pagamento e devolve o pedido intacto para Vender. */
  const cancelarPagamento = () => setScreen("sale");
  /** Fecha as telas administrativas de volta para a Home. */
  const voltarHome = () => setScreen("home");

  const comBarra = !SEM_BARRA.includes(screen);

  if (screen === "home") {
    return (
      <div className={`h-full ${BOTTOM_NAV_PAD}`}>
        <HomeScreen onNavigate={setScreen} />
        <BottomNav current={screen} onNavigate={setScreen} />
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col bg-brand ${comBarra ? BOTTOM_NAV_PAD : ""}`}>
      <div className="flex items-center justify-between gap-2 bg-brand-dark px-3 pt-3 pb-1 text-cream/80">
        <button
          onClick={() => setScreen("home")}
          aria-label={t("nav.home")}
          className="rounded-lg px-2 py-1 text-2xl leading-none"
        >
          🏠
        </button>
        {/* Ocorrencia sem sair do PDV (PRD 6.4): salva e devolve na hora o
            pedido em aberto. Discreto de proposito — a mao que atende nao
            pode esbarrar nele. */}
        <button
          onClick={() => setOccurrence(true)}
          aria-label={t("pendency.short")}
          className="rounded-lg px-2 py-1 text-lg leading-none opacity-70"
        >
          ＋⚠︎
        </button>
        <div className="ml-auto flex items-center gap-3">
          {/* Sem Supabase configurado, "pendente" não quer dizer nada — vira um
              alarme permanente. Nesse caso o app só diz onde a venda está. */}
          <span className="whitespace-nowrap text-[11px]">
            {!loadConfig()
              ? t("status.localOnly")
              : pending > 0
                ? t("status.pending", { n: pending })
                : t("status.synced")}
          </span>
          <LangToggle />
        </div>
      </div>

      <OrderSummary
        cups={order.cups}
        total={order.total}
        selected={order.selected}
        onSelect={order.setSelected}
      />

      <main className="flex flex-1 flex-col gap-3 p-3">
        <button
          onClick={order.addCup}
          className="flex-[2] rounded-3xl bg-cream text-brand-dark shadow-lg active:scale-[0.98] transition"
        >
          <span className="block text-5xl">🍓</span>
          <span className="block font-display text-3xl">{t("action.addCup")}</span>
        </button>

        {/* 4 toppings em 2×2: a grade fecha certinho, sem cela vazia sobrando.
            Mudou a quantidade de topping? Reveja este grid — 3 ou 5 itens
            voltam a deixar buraco. */}
        <div className="grid flex-[3] grid-cols-2 grid-rows-2 gap-3">
          {TOPPINGS.map((x) => (
            <button
              key={x.id}
              disabled={empty}
              onClick={() => order.addTopping(x.id)}
              className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-cream/90 text-brand-dark disabled:opacity-30 active:scale-[0.97] transition"
            >
              <span className="text-4xl leading-none">{x.emoji}</span>
              <span className="px-1 text-xl leading-tight font-semibold">
                {t(`topping.${x.id}`)}
              </span>
            </button>
          ))}
        </div>

        <button
          disabled={!order.canUndo}
          onClick={order.undo}
          className="rounded-2xl border-2 border-cream/50 py-4 text-xl font-semibold text-cream disabled:opacity-25"
        >
          {t("action.undo")}
        </button>
      </main>

      <footer className="p-3 pb-6">
        <button
          disabled={empty}
          onClick={() => setScreen("payment")}
          className="w-full rounded-3xl bg-cream px-4 py-4 text-brand-dark shadow-lg disabled:opacity-30 active:scale-[0.99] transition"
        >
          <span className="block text-xl uppercase tracking-widest">
            {t("action.finish")}
          </span>
          <Valor chf={order.total} tamanho="gigante" />
        </button>
      </footer>

      {screen === "payment" && (
        <PaymentSheet
          total={order.total}
          onPick={choosePayment}
          onCancel={cancelarPagamento}
        />
      )}

      {screen === "review" && payment && (
        <ReviewSheet
          cups={order.cups}
          total={order.total}
          payment={payment}
          recebido={recebido}
          onRecebido={setRecebido}
          onConfirm={commitSale}
          onBack={() => {
            // Volta o pedido intacto: nada foi gravado ate aqui.
            setPayment(null);
            setRecebido(null);
            setScreen("sale");
          }}
        />
      )}

      {/* AnimatePresence para as telas que deslizam sairem deslizando tambem */}
      <AnimatePresence>
        {screen === "sales" && (
          <SalesScreen
            key="sales"
            onClose={voltarHome}
            onDataChanged={refreshPending}
          />
        )}
        {screen === "menu" && <MenuScreen key="menu" onClose={voltarHome} />}
      </AnimatePresence>

      {screen === "settings" && (
        <SettingsScreen
          onClose={voltarHome}
          onDataChanged={refreshPending}
          onOpenSystem={() => setScreen("system")}
          onOpenPrices={() => setScreen("prices")}
          onOpenMenu={() => setScreen("menu")}
          onOpenSuppliers={() => setScreen("suppliers")}
        />
      )}

      {/* As telas pesadas, todas com a mesma casca (ver LAZY_SCREENS). */}
      {LAZY_SCREENS.map(
        ([nome, Tela, erroKey]) =>
          screen === nome && (
            <LazyScreen key={nome} onClose={voltarHome} errorText={t(erroKey)}>
              <Tela onClose={voltarHome} />
            </LazyScreen>
          ),
      )}

      {/* Falha ao carregar a folha nao pode aparecer por cima do pedido: cai
          em nada e a venda segue. */}
      {occurrence && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <OccurrenceSheet onClose={() => setOccurrence(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

      <SaleConfirmation
        data={confirmation}
        onDone={() => setConfirmation(null)}
      />

      {comBarra && <BottomNav current={screen} onNavigate={setScreen} />}

      {/* Erro nunca é comemoração: fica vermelho, parado e por mais tempo. */}
      {error && (
        <div className="fixed inset-x-4 top-6 z-50 rounded-2xl bg-red-700 px-6 py-5 text-center text-white shadow-xl">
          <p className="text-3xl">⚠️</p>
          <p className="font-semibold">{error}</p>
        </div>
      )}
    </div>
  );
}
