import { money, toppingEmoji } from "../config";
import { useLang } from "../i18n";
import { cupTotal } from "../order";
import type { Cup } from "../types";

interface Props {
  cups: Cup[];
  total: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

/** Topo da tela: o que o cliente pediu, sempre visivel. */
export function OrderSummary({ cups, total, selected, onSelect }: Props) {
  const { t } = useLang();
  const activeId = selected ?? cups[cups.length - 1]?.id ?? null;

  return (
    <section className="bg-brand-dark text-cream px-4 pt-4 pb-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm uppercase tracking-widest opacity-70">
          {cups.length === 0
            ? t("order.new")
            : `${cups.length} ${t(cups.length === 1 ? "order.cup" : "order.cups")}`}
        </span>
        <span className="font-display text-4xl leading-none tabular-nums">
          {money(total)}
        </span>
      </div>

      {cups.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {cups.map((cup, i) => {
            const active = cup.id === activeId;
            return (
              <li key={cup.id}>
                <button
                  onClick={() => onSelect(cup.id)}
                  /* O copo ativo precisa ser inequívoco: é nele que o próximo
                     topping cai. Anel fraco não resolve isso numa fila. */
                  /* items-start, não items-center: com 4 toppings a lista
                     quebra em duas linhas, e o valor tem que continuar
                     ancorado na linha do "Copo N", não boiando no meio. */
                  className={`flex w-full items-start justify-between rounded-lg px-3 py-2 text-left leading-snug transition ${
                    active
                      ? "bg-cream text-brand-dark font-semibold"
                      : "bg-black/15"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {t("order.cupN", { n: i + 1 })}
                    </span>
                    {cup.toppings.length === 0 ? (
                      <span className="ml-2 text-sm opacity-80">
                        {t("order.noTopping")}
                      </span>
                    ) : (
                      <span
                        className="ml-2 text-base tracking-widest"
                        /* Emoji é decorativo aqui: quem lê tela lê o nome. */
                        aria-label={cup.toppings
                          .map((x) => t(`topping.${x}`))
                          .join(", ")}
                      >
                        {cup.toppings.map(toppingEmoji).join("")}
                      </span>
                    )}
                  </span>
                  <span className="ml-3 shrink-0 tabular-nums opacity-90">
                    {money(cupTotal(cup))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
