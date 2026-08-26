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
  PurchasesScreen,
  StockScreen,
  SuppliersScreen,
} from "./components/adminScreens";
import { TOPPINGS } from "./config";
import { deviceId, pendingSales, saveSale } from "./db";
import { LangToggle, useLang } from "./i18n";
import { logEvent } from "./log";
import { getCachedOpenOperationId, refreshOpenOperationId } from "./operations";
import { useOrder } from "./order";
import { refreshPrices } from "./prices";
import { loadConfig, syncNow } from "./sync";
import type { Payment, Sale } from "./types";

// Este arquivo nunca importa ./auth nem ./supabase, em lugar nenhum — e essa
// ausencia, nao um `if`, que garante que a venda nao depende de login.
// SystemScreen tambem nao exige sessao (funciona offline/deslogada), entao
// nao entra no barril adminScreens.ts — tem seu proprio lazy() aqui.
const SystemScreen = lazy(() => import("./components/SystemScreen"));

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
  | "purchases"
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
  ["purchases", PurchasesScreen, "purchases.loadError"],
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

  /**
   * Botão/gesto físico de voltar do celular (Android): sem isto, como o app
   * não usa rotas de verdade, ele não tem para onde "voltar" e o sistema
   * fecha o app direto na primeira tela. Espelha exatamente o que cada botão
   * de fechar já faz, para o hardware nunca divergir do toque.
   */
  const goBack = useCallback(() => {
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
      case "purchases":
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
  }, [screen, confirmation, error]);

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
        <div className="flex items-center gap-3">
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
          onConfirm={commitSale}
          onBack={() => {
            // Volta o pedido intacto: nada foi gravado ate aqui.
            setPayment(null);
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
