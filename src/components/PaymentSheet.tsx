import { money } from "../config";
import { LangToggle, useLang } from "../i18n";
import type { Payment } from "../types";

interface Props {
  total: number;
  onPick: (p: Payment) => void;
  onCancel: () => void;
}

/** Passo 7 do fluxo: Dinheiro ou TWINT, dois alvos enormes. */
export function PaymentSheet({ total, onPick, onCancel }: Props) {
  const { t } = useLang();

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-brand-dark p-4">
      <div className="flex items-start justify-between">
        <span className="w-20" />
        <div className="text-center">
          <p className="text-cream/70 uppercase tracking-widest text-sm">
            {t("pay.title")}
          </p>
          {/* Nunca quebra linha: e o numero que a Romana fala para o cliente. */}
          <p className="font-display text-5xl text-cream tabular-nums whitespace-nowrap">
            {money(total)}
          </p>
        </div>
        <LangToggle className="text-cream/80" />
      </div>

      <div className="mt-6 grid flex-1 grid-rows-2 gap-4">
        <button
          onClick={() => onPick("cash")}
          className="rounded-3xl bg-cream text-brand-dark active:scale-[0.98] transition"
        >
          <span className="block text-6xl">💵</span>
          <span className="block font-display text-4xl">{t("pay.cash")}</span>
        </button>
        <button
          onClick={() => onPick("twint")}
          className="rounded-3xl bg-cream text-brand-dark active:scale-[0.98] transition"
        >
          <span className="block text-6xl">📱</span>
          <span className="block font-display text-4xl">{t("pay.twint")}</span>
        </button>
      </div>

      <button
        onClick={onCancel}
        className="mt-4 py-4 text-cream/70 text-lg underline underline-offset-4"
      >
        {t("pay.back")}
      </button>
    </div>
  );
}
