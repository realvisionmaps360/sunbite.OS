import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { money } from "../config";
import { useLang } from "../i18n";
import type { Payment } from "../types";

export interface Confirmation {
  total: number;
  payment: Payment;
  cups: number;
  /** muda a cada venda: força o React a remontar e a animação a rodar de novo */
  key: number;
}

interface Props {
  data: Confirmation | null;
  onDone: () => void;
}

/** Morangos que saem voando do centro. Ângulos fixos — nada de aleatório piscando. */
const SPARKS = [
  { x: -110, y: -90, r: -25, d: 0.06 },
  { x: 110, y: -80, r: 20, d: 0.12 },
  { x: -130, y: 40, r: -15, d: 0.18 },
  { x: 130, y: 55, r: 30, d: 0.1 },
  { x: -55, y: -140, r: 12, d: 0.22 },
  { x: 60, y: -145, r: -20, d: 0.16 },
];

const AUTO_CLOSE_MS = 1900;

/**
 * Tela de confirmação da venda.
 *
 * Ela some sozinha, mas um toque em qualquer lugar fecha na hora — numa fila,
 * esperar animação acabar é tempo perdido, e o PDV existe para ganhar segundos.
 */
export function SaleConfirmation({ data, onDone }: Props) {
  const { t } = useLang();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(onDone, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [data, onDone]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key={data.key}
          onClick={onDone}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-brand-dark"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.15 }}
        >
          {/* Ondas que abrem a partir do centro */}
          {!reduce &&
            [0, 0.18].map((delay) => (
              <motion.span
                key={delay}
                className="absolute h-40 w-40 rounded-full border-2 border-cream"
                initial={{ scale: 0.3, opacity: 0.5 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 1.1, delay, ease: "easeOut" }}
              />
            ))}

          {/* Morangos voando */}
          {!reduce &&
            SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute text-3xl"
                initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                animate={{
                  x: s.x,
                  y: s.y,
                  scale: [0, 1.15, 0.9],
                  opacity: [0, 1, 0],
                  rotate: s.r,
                }}
                transition={{ duration: 1.2, delay: s.d, ease: "easeOut" }}
              >
                🍓
              </motion.span>
            ))}

          {/* Selo com o certo desenhado à mão */}
          <motion.div
            className="relative flex h-36 w-36 items-center justify-center rounded-full bg-cream"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={
              reduce
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 320, damping: 16, delay: 0.05 }
            }
          >
            <svg viewBox="0 0 100 100" className="h-24 w-24">
              <motion.path
                d="M25 52 L43 70 L76 33"
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: reduce ? 0.15 : 0.42,
                  delay: reduce ? 0 : 0.22,
                  ease: "easeOut",
                }}
              />
            </svg>
          </motion.div>

          {/* Valor: o que a Romana confere de relance */}
          <motion.p
            className="mt-8 font-display text-6xl text-cream tabular-nums whitespace-nowrap"
            initial={{ opacity: 0, y: 24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              reduce
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 260, damping: 18, delay: 0.3 }
            }
          >
            {money(data.total)}
          </motion.p>

          <motion.div
            className="mt-4 flex items-center gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : 0.45 }}
          >
            <span className="rounded-full bg-cream/15 px-4 py-1.5 text-lg text-cream">
              {data.payment === "cash" ? "💵" : "📱"}{" "}
              {t(data.payment === "cash" ? "pay.cash" : "pay.twint")}
            </span>
            <span className="rounded-full bg-cream/15 px-4 py-1.5 text-lg text-cream">
              🍓 {data.cups}{" "}
              {t(data.cups === 1 ? "order.cup" : "order.cups")}
            </span>
          </motion.div>

          <motion.p
            className="absolute bottom-14 text-cream/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : 0.7 }}
          >
            {t("confirm.next")}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
