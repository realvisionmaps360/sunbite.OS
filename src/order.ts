import { useCallback, useMemo, useReducer } from "react";
import { CUP_PRICE, TOPPING_PRICE } from "./config";
import type { Cup, OrderAction, ToppingId } from "./types";

export function cupTotal(cup: Cup) {
  return CUP_PRICE + cup.toppings.length * TOPPING_PRICE;
}

export function orderTotal(cups: Cup[]) {
  return cups.reduce((sum, c) => sum + cupTotal(c), 0);
}

interface State {
  cups: Cup[];
  stack: OrderAction[];
  selected: string | null;
}

type Action =
  | { type: "ADD_CUP"; id: string }
  | { type: "ADD_TOPPING"; topping: ToppingId }
  | { type: "SELECT"; id: string }
  | { type: "UNDO" }
  | { type: "RESET" };

const EMPTY: State = { cups: [], stack: [], selected: null };

/**
 * Reducer puro. E de proposito: no aperto, a Romana toca copo e topping
 * quase no mesmo instante, e o reducer sempre enxerga o estado ja atualizado
 * — coisa que um useState com closure nao garante.
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_CUP": {
      const cup: Cup = { id: action.id, toppings: [] };
      return {
        cups: [...state.cups, cup],
        stack: [...state.stack, { type: "cup", cupId: cup.id }],
        selected: cup.id,
      };
    }

    case "ADD_TOPPING": {
      if (state.cups.length === 0) return state; // sem copo, topping nao cai em lugar nenhum
      const known = state.cups.some((c) => c.id === state.selected);
      const targetId = known
        ? state.selected!
        : state.cups[state.cups.length - 1].id;
      return {
        ...state,
        cups: state.cups.map((c) =>
          c.id === targetId
            ? { ...c, toppings: [...c.toppings, action.topping] }
            : c,
        ),
        stack: [
          ...state.stack,
          { type: "topping", cupId: targetId, topping: action.topping },
        ],
        selected: targetId,
      };
    }

    case "SELECT":
      return { ...state, selected: action.id };

    case "UNDO": {
      const last = state.stack[state.stack.length - 1];
      if (!last) return state;
      const stack = state.stack.slice(0, -1);

      if (last.type === "cup") {
        return {
          cups: state.cups.filter((c) => c.id !== last.cupId),
          stack,
          selected: state.selected === last.cupId ? null : state.selected,
        };
      }
      return {
        cups: state.cups.map((c) => {
          if (c.id !== last.cupId) return c;
          const i = c.toppings.lastIndexOf(last.topping);
          if (i < 0) return c;
          const toppings = [...c.toppings];
          toppings.splice(i, 1);
          return { ...c, toppings };
        }),
        stack,
        selected: last.cupId,
      };
    }

    case "RESET":
      return EMPTY;
  }
}

/** Pedido em aberto. Cada lancamento entra numa pilha, e o Desfazer tira o ultimo. */
export function useOrder() {
  const [state, dispatch] = useReducer(reducer, EMPTY);

  // O id nasce fora do reducer para ele continuar puro.
  const addCup = useCallback(
    () => dispatch({ type: "ADD_CUP", id: crypto.randomUUID() }),
    [],
  );
  const addTopping = useCallback(
    (topping: ToppingId) => dispatch({ type: "ADD_TOPPING", topping }),
    [],
  );
  const setSelected = useCallback(
    (id: string) => dispatch({ type: "SELECT", id }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const total = useMemo(() => orderTotal(state.cups), [state.cups]);

  return {
    cups: state.cups,
    total,
    selected: state.selected,
    canUndo: state.stack.length > 0,
    setSelected,
    addCup,
    addTopping,
    undo,
    reset,
  };
}
