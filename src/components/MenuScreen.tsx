import { motion } from "framer-motion";
import { TOPPINGS, money } from "../config";
import { LangToggle, useLang } from "../i18n";
import { getCupPrice, getToppingPrice } from "../prices";

/**
 * Cardapio. So leitura.
 *
 * Dois usos: consulta rapida e mostrar ao cliente que pergunta o preco — por
 * isso e grande e limpo, nao uma tabela de configuracao.
 *
 * Preco vem de prices.ts (Etapa 7, DEC-2026-005) — o mesmo numero que o
 * pedido usa. Nenhum numero digitado a mao aqui: mudou no banco, muda aqui.
 */
export function MenuScreen({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const cupPrice = getCupPrice();
  const toppingPrice = getToppingPrice();

  // Veio da direita: para dispensar, empurra de volta para a direita.

  // Derivado de TOPPINGS.length, nunca uma lista fixa: entrou o marshmallow e
  // a tabela passou a ir ate 4 sozinha. A ultima linha e sempre "com todos".
  const combos = Array.from({ length: TOPPINGS.length + 1 }, (_, n) => ({
    n,
    label:
      n === 0
        ? t("menu.combo0")
        : t(n === TOPPINGS.length ? "menu.comboAll" : "menu.comboN", { n }),
    preco: cupPrice + n * toppingPrice,
  }));

  return (
    <motion.div
      className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream"
      /* Entra pela direita: a animação dá direção à abertura e o × devolve
         para o mesmo lado. */
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
    >
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-cream">
        <h1 className="font-display text-2xl">{t("menu.title")}</h1>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button onClick={onClose} className="px-3 py-1 text-3xl leading-none">
            ×
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-7 p-5">
        {/* O produto */}
        <section className="text-center">
          <p className="text-6xl">🍓</p>
          <h2 className="mt-2 font-display text-3xl leading-tight text-ink">
            {t("menu.cup")}
          </h2>
          <p className="mt-2 text-ink-muted">{t("menu.cupDesc")}</p>
          <p className="mt-4 font-display text-6xl tabular-nums text-brand">
            {money(cupPrice)}
          </p>
        </section>

        {/* Toppings */}
        <section>
          <h3 className="mb-3 font-display text-2xl text-ink">
            {t("menu.toppings")}
          </h3>
          <ul className="space-y-2">
            {TOPPINGS.map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between rounded-2xl bg-cream-soft px-4 py-3"
              >
                <span className="flex items-center gap-3 text-xl">
                  <span className="text-3xl">{x.emoji}</span>
                  {t(`topping.${x.id}`)}
                </span>
                <span className="tabular-nums text-xl font-semibold text-brand">
                  + {money(toppingPrice)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* A conta pronta, para não fazer soma na frente do cliente */}
        <section>
          <h3 className="mb-3 font-display text-2xl text-ink">
            {t("menu.combos")}
          </h3>
          <ul className="overflow-hidden rounded-2xl border-2 border-brand/15">
            {combos.map((c, i) => (
              <li
                key={c.n}
                className={`flex items-center justify-between px-4 py-3 ${
                  i % 2 ? "bg-cream-soft" : "bg-transparent"
                }`}
              >
                <span className="text-lg">{c.label}</span>
                <span className="font-display text-2xl tabular-nums text-brand">
                  {money(c.preco)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="pb-4 text-center text-sm text-ink-muted">
          {t("menu.hint")}
        </p>
      </div>
    </motion.div>
  );
}
