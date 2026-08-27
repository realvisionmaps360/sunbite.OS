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

export function abrirEmissor(codigo: string): Emissor {
  let vivo = true;
  let pronto = false;
  /** Ultimo estado, guardado enquanto o canal ainda esta subindo. */
  let atrasado: EstadoDisplay | null = null;
  let enviarDeVerdade: ((e: EstadoDisplay) => void) | null = null;
  let fecharCanal: (() => void) | null = null;

  void (async () => {
    try {
      const supabase = await getSupabase();
      const ch = supabase.channel(canal(codigo), {
        config: { broadcast: { self: false } },
      });
      ch.subscribe((status) => {
        if (status !== "SUBSCRIBED" || !vivo) return;
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
      // iPad** — e por isso que este catch e vazio de proposito.
    }
  })();

  return {
    enviar(estado) {
      if (!vivo) return;
      if (pronto && enviarDeVerdade) enviarDeVerdade(estado);
      else atrasado = estado;
    },
    fechar() {
      vivo = false;
      fecharCanal?.();
      fecharCanal = null;
      enviarDeVerdade = null;
    },
  };
}
