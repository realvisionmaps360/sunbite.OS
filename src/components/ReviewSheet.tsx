import { motion } from "framer-motion";
import { LangToggle, useLang } from "../i18n";
import { Valor } from "./Valor";
import type { Cup, Payment } from "../types";

interface Props {
  cups: Cup[];
  total: number;
  payment: Payment;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Ultima conferencia antes de gravar.
 *
 * Nada foi salvo ainda quando esta tela aparece: voltar daqui devolve o pedido
 * inteiro, intacto, e nao deixa rastro nenhum no banco.
 */
export function ReviewSheet({
  cups,
  total,
  payment,
  onConfirm,
  onBack,
}: Props) {
  const { t } = useLang();
  const toppings = cups.reduce((n, c) => n + c.toppings.length, 0);

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col bg-cream-soft"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* Título fica centrado; o toggle vai absoluto à direita para não
          empurrar o centro. O idioma tem que estar aqui também — é a última
          tela que a Romana lê antes de gravar a venda. */}
      <header className="relative bg-brand px-4 py-3 text-center text-cream">
        <h1 className="font-display text-2xl">{t("review.title")}</h1>
        <div className="absolute inset-y-0 right-4 flex items-center">
          <LangToggle />
        </div>
      </header>

      {/* O valor primeiro: é o que se confere antes de tudo */}
      <div className="bg-brand-dark px-4 py-5 text-center text-cream">
        <Valor chf={total} tamanho="gigante" />
        <p className="mt-2 text-xl">
          {payment === "cash" ? "💵" : "📱"}{" "}
          {t(payment === "cash" ? "pay.cash" : "pay.twint")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <Bloco label={t("review.cups")} valor={cups.length} />
        <Bloco label={t("review.toppings")} valor={toppings} />
      </div>

      <ul className="flex-1 divide-y divide-black/10 overflow-y-auto px-4">
        {cups.map((c, i) => (
          <li
            key={c.id}
            className="flex items-start justify-between gap-3 py-3 leading-snug"
          >
            <span className="shrink-0 font-semibold">
              {t("order.cupN", { n: i + 1 })}
            </span>
            <span className="min-w-0 text-right text-ink-muted">
              {c.toppings.length
                ? c.toppings.map((x) => t(`topping.${x}`)).join(" · ")
                : t("order.noTopping")}
            </span>
          </li>
        ))}
      </ul>

      <footer className="space-y-2 p-4 pb-6">
        <button
          onClick={onConfirm}
          className="w-full rounded-3xl bg-brand py-6 font-display text-3xl text-cream shadow-lg active:scale-[0.99] transition"
        >
          {t("review.confirm")}
        </button>
        <button
          onClick={onBack}
          className="w-full py-4 text-lg text-ink-muted underline underline-offset-4"
        >
          {t("review.back")}
        </button>
      </footer>
    </motion.div>
  );
}

function Bloco({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-2xl bg-cream p-4 text-center">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="font-display text-4xl tabular-nums">{valor}</p>
    </div>
  );
}
