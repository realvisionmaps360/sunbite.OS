import { getSupabase } from "../supabase";
import { EVENTO, canal, type EstadoDisplay } from "./protocol";

/**
 * Lado do CELULAR do Customer Display.
 *
 * ⚠️ Este arquivo importa `../supabase`, entao **nada no caminho da venda pode
 * importa-lo estaticamente**. `App.tsx` o carrega por `import()` dinamico, e
 * so quando existe um par guardado (`lerPar()`). Sem iPad pareado, este chunk
 * nunca e baixado — mesma regra do `OccurrenceSheet` e das telas
 * administrativas.
 *
 * Broadcast, nao `postgres_changes`: o pedido em aberto vive num `useReducer`
 * em `src/order.ts` e **nunca toca o banco** antes do Confirmar. O tempo real
 * da Etapa 6 so enxerga o que ja esta gravado, entao nao serve aqui. O
 * broadcast e mensagem efemera de aparelho para aparelho, sem escrita — que e
 * exatamente o que o carrinho precisa e tudo o que o iPad precisa saber.
 */
export interface Emissor {
  enviar(estado: EstadoDisplay): void;
  fechar(): void;
}

/**
 * De quanto em quanto tempo o celular repete o estado atual.
 *
 * ⚠️ Isto nao e enfeite, e um defeito que apareceu no teste: broadcast e
 * mensagem solta, sem historico. O iPad que liga DEPOIS do celular nao recebe
 * nada — ficava no video mostrando a vitrine velha, e so acordava quando
 * alguem tocava no celular. Repetir o estado resolve os dois lados: o iPad
 * que chega atrasado se acerta em segundos, e o relogio de silencio dele
 * (`SILENCIO_MS`) so dispara quando o celular realmente sumiu.
 */
const BATIDA_MS = 8000;

export interface OpcoesEmissor {
  /**
   * Chamado sempre que a resposta a "ha um iPad ouvindo?" muda.
   *
   * ⚠️ Nao da para responder isso pelo `SUBSCRIBED`: um canal de broadcast do
   * Supabase sobe **sozinho**, sem ninguem do outro lado. Quem responde e o
   * Presence — cada lado se anuncia com `track()` e os dois recebem o `sync`.
   */
  aoMudarPresenca?: (temIpad: boolean) => void;
}

export function abrirEmissor(
  codigo: string,
  opcoes: OpcoesEmissor = {},
): Emissor {
  let vivo = true;
  let pronto = false;
  /** Ultimo estado: serve para a espera do canal E para a batida. */
  let atrasado: EstadoDisplay | null = null;
  let ultimo: EstadoDisplay | null = null;
  let enviarDeVerdade: ((e: EstadoDisplay) => void) | null = null;
  let fecharCanal: (() => void) | null = null;

  void (async () => {
    try {
      const supabase = await getSupabase();
      const ch = supabase.channel(canal(codigo), {
        config: {
          broadcast: { self: false },
          // Chave unica por conexao: dois celulares no mesmo canal nao se
          // sobrescrevem, e o `papel` de dentro e que diz quem e quem.
          presence: { key: `celular:${Math.random().toString(36).slice(2)}` },
        },
      });
      ch.on("presence", { event: "sync" }, () => {
        if (!vivo) return;
        const estado = ch.presenceState<{ papel?: string }>();
        const temIpad = Object.values(estado).some((lista) =>
          lista.some((p) => p.papel === "ipad"),
        );
        opcoes.aoMudarPresenca?.(temIpad);
      });
      ch.subscribe((status) => {
        if (status !== "SUBSCRIBED" || !vivo) {
          if (vivo) opcoes.aoMudarPresenca?.(false);
          return;
        }
        void ch.track({ papel: "celular" });
        pronto = true;
        // O que aconteceu enquanto o canal subia nao se perde: o iPad recebe
        // o estado de agora assim que ha por onde.
        if (atrasado) {
          void ch.send({ type: "broadcast", event: EVENTO, payload: atrasado });
          atrasado = null;
        }
      });
      enviarDeVerdade = (e) => {
        void ch.send({ type: "broadcast", event: EVENTO, payload: e });
      };
      fecharCanal = () => void supabase.removeChannel(ch);
      if (!vivo) fecharCanal();
    } catch {
      // Sem configuracao do Supabase, sem sessao, sem rede: o display
      // simplesmente nao acende. **Nenhuma tela do celular espera resposta do
      // iPad** — e por isso que este catch nao mostra erro em tela nenhuma.
      // Mas a bolinha tem que ficar vermelha: sem canal nao ha par.
      opcoes.aoMudarPresenca?.(false);
    }
  })();

  const batida = window.setInterval(() => {
    if (vivo && pronto && ultimo && enviarDeVerdade) enviarDeVerdade(ultimo);
  }, BATIDA_MS);

  return {
    enviar(estado) {
      if (!vivo) return;
      ultimo = estado;
      if (pronto && enviarDeVerdade) enviarDeVerdade(estado);
      else atrasado = estado;
    },
    fechar() {
      vivo = false;
      opcoes.aoMudarPresenca?.(false);
      window.clearInterval(batida);
      fecharCanal?.();
      fecharCanal = null;
      enviarDeVerdade = null;
    },
  };
}
