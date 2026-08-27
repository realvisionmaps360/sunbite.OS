import { getSupabase } from "../supabase";
import { EVENTO, SILENCIO_MS, canal, type EstadoDisplay } from "./protocol";

/**
 * Lado do iPAD do Customer Display: ouve o canal e entrega o estado.
 *
 * Espelha `src/realtime.ts` na forma (abre canal, devolve a funcao que
 * fecha), mas em modo **broadcast** e nao `postgres_changes` — ver o porque
 * em `emit.ts`.
 */
export type Conexao = "ligando" | "ligado" | "caiu";

export function ouvir(
  codigo: string,
  aoReceber: (estado: EstadoDisplay) => void,
  aoConectar: (estado: Conexao) => void,
): () => void {
  let vivo = true;
  let fechar: (() => void) | null = null;

  /**
   * Volta ao repouso sozinho depois de um silencio longo.
   *
   * Regra da Etapa 10: o display e enfeite que ajuda, **nunca** um passo do
   * fluxo. Celular sem bateria no meio de um pedido nao pode deixar o iPad
   * congelado com o pedido de outra pessoa na cara do proximo cliente.
   */
  let relogio: number | undefined;
  const armar = () => {
    window.clearTimeout(relogio);
    relogio = window.setTimeout(() => aoReceber({ kind: "repouso" }), SILENCIO_MS);
  };

  void (async () => {
    try {
      const supabase = await getSupabase();
      const ch = supabase.channel(canal(codigo));
      ch.on("broadcast", { event: EVENTO }, ({ payload }) => {
        if (!vivo) return;
        armar();
        aoReceber(payload as EstadoDisplay);
      });
      ch.subscribe((status) => {
        if (!vivo) return;
        if (status === "SUBSCRIBED") {
          aoConectar("ligado");
          armar();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Sem sinal o iPad **volta ao video**, e nao mostra erro: quem esta
          // na frente dele e o cliente, nao o operador.
          aoConectar("caiu");
          aoReceber({ kind: "repouso" });
        }
      });
      fechar = () => void supabase.removeChannel(ch);
      if (!vivo) fechar();
    } catch {
      aoConectar("caiu");
    }
  })();

  return () => {
    vivo = false;
    window.clearTimeout(relogio);
    fechar?.();
  };
}
