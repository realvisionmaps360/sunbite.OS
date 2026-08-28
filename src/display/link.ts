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
   * ⚠️ **"Ligado" e ter um CELULAR na sala, nao ter WebSocket.**
   *
   * Era `status === "SUBSCRIBED"` — e um canal de broadcast do Supabase da
   * SUBSCRIBED mesmo sozinho, sem ninguem do outro lado. Resultado real: um
   * iPad que nao estava pareado com celular nenhum se dizia ligado, e o codigo
   * de 4 digitos — que so aparece quando NAO ha conexao — sumia da tela. Quem
   * chegasse para parear nao tinha o numero para digitar.
   *
   * Presence responde a pergunta certa: cada lado se anuncia com `track()`, e
   * o `sync` diz quem esta na sala agora.
   */
  let temCelular = false;
  let mudo = false;
  let ultima: Conexao | null = null;
  const recalcular = () => {
    const agora: Conexao = temCelular && !mudo ? "ligado" : "caiu";
    if (agora === ultima) return;
    ultima = agora;
    aoConectar(agora);
  };

  /**
   * Volta ao repouso sozinho depois de um silencio longo.
   *
   * Regra da Etapa 10: o display e enfeite que ajuda, **nunca** um passo do
   * fluxo. Celular sem bateria no meio de um pedido nao pode deixar o iPad
   * congelado com o pedido de outra pessoa na cara do proximo cliente.
   *
   * E o silencio tambem **rebaixa a conexao**: antes ele devolvia a vitrine e
   * deixava `conexao` em "ligado", entao o iPad ficava mudo e sem codigo na
   * tela ao mesmo tempo — o pior dos dois mundos.
   */
  let relogio: number | undefined;
  const armar = () => {
    window.clearTimeout(relogio);
    mudo = false;
    recalcular();
    relogio = window.setTimeout(() => {
      if (!vivo) return;
      mudo = true;
      aoReceber({ kind: "repouso" });
      recalcular();
    }, SILENCIO_MS);
  };

  void (async () => {
    try {
      const supabase = await getSupabase();
      const ch = supabase.channel(canal(codigo), {
        config: {
          presence: { key: `ipad:${Math.random().toString(36).slice(2)}` },
        },
      });
      ch.on("broadcast", { event: EVENTO }, ({ payload }) => {
        if (!vivo) return;
        armar();
        aoReceber(payload as EstadoDisplay);
      });
      ch.on("presence", { event: "sync" }, () => {
        if (!vivo) return;
        const estado = ch.presenceState<{ papel?: string }>();
        const antes = temCelular;
        temCelular = Object.values(estado).some((lista) =>
          lista.some((p) => p.papel === "celular"),
        );
        // Celular que saiu da sala nao deixa o pedido dele na cara do proximo
        // cliente: a vitrine volta na hora, junto com o codigo.
        if (antes && !temCelular) aoReceber({ kind: "repouso" });
        recalcular();
      });
      ch.subscribe((status) => {
        if (!vivo) return;
        if (status === "SUBSCRIBED") {
          void ch.track({ papel: "ipad" });
          armar();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Sem sinal o iPad **volta a vitrine**, e nao mostra erro: quem esta
          // na frente dele e o cliente, nao o operador.
          temCelular = false;
          recalcular();
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
