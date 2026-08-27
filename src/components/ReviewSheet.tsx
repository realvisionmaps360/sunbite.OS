import { motion } from "framer-motion";
import { money } from "../config";
import { lerPar } from "../display/protocol";
import { LangToggle, useLang } from "../i18n";
import { Valor } from "./Valor";
import type { Cup, Payment } from "../types";

interface Props {
  cups: Cup[];
  total: number;
  payment: Payment;
  /** Quanto o cliente deu, em dinheiro. So serve ao iPad; nao vai ao banco. */
  recebido: number | null;
  onRecebido: (v: number | null) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Notas que a mao alcanca num balcao. Nao e teclado: e um toque so, e toque
 * errado se corrige com outro toque.
 */
const NOTAS = [10, 20, 50, 100];

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
  recebido,
  onRecebido,
  onConfirm,
  onBack,
}: Props) {
  const { t } = useLang();
  const toppings = cups.reduce((n, c) => n + c.toppings.length, 0);

  // As notas so aparecem quando ha iPad pareado E o pagamento e dinheiro.
  // Sem display, esta tela continua exatamente como sempre foi: o PDV nunca
  // precisou saber quanto o cliente deu, e nao passa a precisar agora.
  const comNotas = payment === "cash" && lerPar() !== null;

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

      {/* `min-h-0` nao e enfeite: sem ele o `flex-1` nao encolhe abaixo do
          conteudo, e com 9 copos a lista empurrava a linha das notas para
          cima dela — "ERHALTEN" ficava colado no ultimo Becher. So a imagem
          mostrou. */}
      <ul className="min-h-0 flex-1 divide-y divide-black/10 overflow-y-auto px-4">
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

      {comNotas && (
        <div className="shrink-0 border-t border-black/10 px-4 pt-3 pb-1">
          <p className="pb-2 text-xs uppercase tracking-wider text-ink-muted">
            {t("review.given")}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {NOTAS.map((n) => (
              <button
                key={n}
                onClick={() => onRecebido(recebido === n ? null : n)}
                disabled={n < total}
                className={`rounded-2xl py-3 text-lg font-semibold tabular-nums transition disabled:opacity-25 ${
                  recebido === n
                    ? "bg-brand text-cream"
                    : "bg-cream text-brand-dark"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => onRecebido(recebido === total ? null : total)}
              className={`rounded-2xl py-3 text-sm font-semibold transition ${
                recebido === total
                  ? "bg-brand text-cream"
                  : "bg-cream text-brand-dark"
              }`}
            >
              {t("review.exact")}
            </button>
          </div>
          {/* O troco aparece no celular tambem: se o iPad estiver fora do ar,
              a Romana ainda tem o numero. O display e enfeite que ajuda. */}
          {recebido !== null && (
            <p className="pt-2 text-right text-lg">
              <span className="text-ink-muted">{t("review.change")}: </span>
              <span className="font-display tabular-nums">
                {money(Math.max(0, recebido - total))}
              </span>
            </p>
          )}
        </div>
      )}

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
