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

// Etapa 6+: export const OperationScreen = lazy(() => import("./OperationScreen"));
