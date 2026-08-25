import { lazy } from "react";

/**
 * Barril dos modulos administrativos, todos carregados por React.lazy.
 *
 * So pode importar `lazy()` — nunca `auth.ts` nem `supabase.ts`, nem para
 * um wrapper "comum" de checagem de sessao. Cada modulo chama
 * ensureFreshSession() no proprio useEffect de montagem (ver LoginScreen).
 * E o que garante que este arquivo continua seguro para App.tsx importar
 * de forma estatica, sem arrastar peso nenhum para o caminho da venda.
 */
export const LoginScreen = lazy(() => import("./LoginScreen"));
export const OperationScreen = lazy(() => import("./OperationScreen"));
export const EquipmentScreen = lazy(() => import("./EquipmentScreen"));
export const SuppliersScreen = lazy(() => import("./SuppliersScreen"));
export const StockScreen = lazy(() => import("./StockScreen"));
export const PurchasesScreen = lazy(() => import("./PurchasesScreen"));
export const FinanceScreen = lazy(() => import("./FinanceScreen"));
export const PricesScreen = lazy(() => import("./PricesScreen"));
