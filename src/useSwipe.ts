import { useEffect, useRef } from "react";

interface Opcoes {
  onDireita?: () => void;
  onEsquerda?: () => void;
  /** desliga o gesto sem desmontar nada — usado quando ha tela por cima */
  ativo?: boolean;
}

/** Distancia minima na horizontal para valer como gesto. */
const MINIMO = 60;

/** Quanto a horizontal precisa vencer a vertical. Protege a rolagem da lista. */
const DOMINANCIA = 1.5;

/** Gesto que demora demais e hesitacao, nao intencao. */
const TEMPO_MAXIMO = 700;

/**
 * Arrastar o dedo na horizontal.
 *
 * As duas travas sao o que decide se isso ajuda ou irrita: sem exigir distancia
 * e dominancia horizontal, rolar a lista de vendas abriria tela sem querer no
 * meio do atendimento.
 */
export function useSwipe({ onDireita, onEsquerda, ativo = true }: Opcoes) {
  const inicio = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (!ativo) return;

    const comecou = (e: TouchEvent) => {
      const t = e.touches[0];
      inicio.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    };

    const terminou = (e: TouchEvent) => {
      const p = inicio.current;
      inicio.current = null;
      if (!p) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - p.x;
      const dy = t.clientY - p.y;

      if (Date.now() - p.t > TEMPO_MAXIMO) return;
      if (Math.abs(dx) < MINIMO) return;
      if (Math.abs(dx) < Math.abs(dy) * DOMINANCIA) return;

      if (dx > 0) onDireita?.();
      else onEsquerda?.();
    };

    window.addEventListener("touchstart", comecou, { passive: true });
    window.addEventListener("touchend", terminou, { passive: true });
    return () => {
      window.removeEventListener("touchstart", comecou);
      window.removeEventListener("touchend", terminou);
    };
  }, [ativo, onDireita, onEsquerda]);
}
