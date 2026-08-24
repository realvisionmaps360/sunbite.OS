import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { getCache, setCache, deleteCache } from "./db";

/**
 * Maquina de 4 estados da sessao (Etapa 4).
 *
 * NAO e um Context React de proposito: se fosse, App.tsx precisaria montar
 * um <AuthProvider>, o que forcaria um import estatico deste arquivo (e,
 * por tabela, de supabase.ts) mesmo na tela de venda. Como store externo,
 * so quem chama useAuth() — hoje so LoginScreen, via React.lazy — avalia
 * este modulo. App.tsx nunca importa auth.ts em lugar nenhum: a garantia
 * "vender nunca depende de login" fica estrutural, nao um `if`.
 */

const IDENTITY_KEY = "sunbite.identity";

export interface Identity {
  userId: string;
  email: string;
  /** Segundos desde a epoch — mesmo formato de session.expires_at. */
  expiresAt: number;
}

export type AuthState =
  | { kind: "deslogado" }
  | { kind: "ativo"; identity: Identity }
  | { kind: "sessao-offline"; identity: Identity }
  | { kind: "expirado"; identity: Identity };

function readLocalIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

function writeLocalIdentity(identity: Identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

function clearLocalIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
  void deleteCache(IDENTITY_KEY);
}

function stateFor(identity: Identity): AuthState {
  const fresh = Date.now() < identity.expiresAt * 1000;
  return fresh ? { kind: "ativo", identity } : { kind: "sessao-offline", identity };
}

// Leitura sincrona no carregamento do modulo — roda antes do primeiro
// render de LoginScreen, porque React.lazy resolve o import() antes de
// chamar o componente.
let state: AuthState = (() => {
  const identity = readLocalIdentity();
  return identity ? stateFor(identity) : { kind: "deslogado" };
})();

const listeners = new Set<() => void>();

function publish(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Reforco assincrono: so importa se o localStorage tiver sido limpo mas o
// espelho no IndexedDB (store `cache`, da Etapa 3) ainda tiver a identidade
// — caso raro (celular limpando armazenamento entre temporadas).
void (async () => {
  if (state.kind !== "deslogado") return;
  const cached = await getCache<Identity>(IDENTITY_KEY).catch(() => undefined);
  if (!cached || state.kind !== "deslogado") return;
  writeLocalIdentity(cached);
  publish(stateFor(cached));
})();

async function commitSession(session: Session): Promise<void> {
  const identity: Identity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  };
  writeLocalIdentity(identity);
  void setCache(IDENTITY_KEY, identity);
  publish({ kind: "ativo", identity });
  // So depois do primeiro login de verdade. Chamar de novo e inofensivo —
  // o navegador trata como idempotente.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Best-effort: nunca bloqueia nem falha o login por causa disso.
  }
}

let subscribed = false;

/** Client autenticado, com o listener de mudanca de sessao registrado uma vez. */
async function client() {
  const supabase = await getSupabase();
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void commitSession(session);
      // SIGNED_OUT nunca e tratado aqui: logout() ja publica o estado
      // sozinho. Nada externo apaga a sessao deste aparelho.
    });
  }
  return supabase;
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await client();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return { ok: false, message: error?.message ?? "Falha ao entrar" };
    }
    await commitSession(data.session);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * Sai so deste aparelho (`scope: "local"`). Nunca chamado automaticamente —
 * so pelo botao Sair. Mesmo que o pedido ao servidor falhe (sem rede), o
 * aparelho sai localmente: sair e uma acao local por natureza.
 */
export async function logout(): Promise<void> {
  try {
    const supabase = await client();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Sem rede, ou erro do servidor: mesmo assim, sai localmente.
  }
  clearLocalIdentity();
  publish({ kind: "deslogado" });
}

/**
 * Unica funcao que tenta confirmar a sessao vencida contra o servidor.
 * So faz algo quando o estado atual e `sessao-offline` — chamada pela
 * LoginScreen ao montar, nunca de fora do caminho administrativo.
 *
 * A distincao que importa: um erro de REDE (fetch que nem respondeu, ou
 * AuthRetryableFetchError) nao e a mesma coisa que o SERVIDOR dizer "essa
 * sessao nao vale mais" (AuthApiError). So a segunda vira `expirado` — e e
 * o unico lugar do sistema em que a identidade local e apagada.
 */
export async function ensureFreshSession(): Promise<void> {
  if (state.kind !== "sessao-offline") return;
  if (!navigator.onLine) return;

  const { identity } = state;
  try {
    const supabase = await client();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      // Duck-typing em vez de importar AuthApiError/isAuthApiError como
      // valor: um import de valor de "@supabase/supabase-js" aqui faria o
      // bundler tratar a biblioteca como estatica neste modulo, anulando o
      // import() dinamico de supabase.ts. `.name` e atribuido no
      // construtor da propria classe, nao muda entre versoes menores.
      if (error.name === "AuthApiError") {
        clearLocalIdentity();
        publish({ kind: "expirado", identity });
      }
      // Qualquer outro erro (rede, timeout): permanece sessao-offline,
      // tenta de novo na proxima vez que a tela abrir.
      return;
    }
    if (data.session) await commitSession(data.session);
  } catch {
    // fetch nem chegou a responder. Mantem sessao-offline.
  }
}
