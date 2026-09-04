import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { money, toppingEmoji } from "../config";
import { lerPar } from "../display/protocol";
import { LangToggle, useLang } from "../i18n";
import { getCupPrice, getToppingPrice } from "../prices";
import { Valor } from "./Valor";
import type { Cup, Payment } from "../types";

interface Props {
  cups: Cup[];
  total: number;
  payment: Payment;
  /** Quanto o cliente deu, em dinheiro. So serve ao iPad; nao vai ao banco. */
  recebido: number | null;
  onRecebido: (v: number | null) => void;
  /** Gorjeta desta venda, em CHF. Vai ao banco na coluna `tip` (ops 17). */
  gorjeta: number;
  onGorjeta: (v: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Fichas de gorjeta.
 *
 * ⚠️ Isto **nao e uma telinha de gorjeta**. A pesquisa que motivou o desenho:
 * na Suica quase 90% das pessoas se incomodam com sugestao de gorjeta
 * pre-definida na maquininha, e em food truck nao ha costume firmado. A
 * Sunbite nunca pede — nada disto aparece no iPad virado para o cliente.
 * Estes botoes sao para a Romana **registrar o que o cliente ja decidiu
 * deixar**, do lado de ca do balcao.
 *
 * Sao valores de nota/moeda suica que a mao alcanca. "Outro" cobre o resto,
 * porque gente deixa mais do que arredondamento — foi exatamente por isso que
 * um botao de "arredondar" nao serviria.
 */
const GORJETAS = [0.5, 1, 2, 5];

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
 *
 * ⚠️ **Refeita em 27/08 a pedido do Felipe**, com os tres defeitos que ele
 * apontou, nesta ordem de importancia:
 *
 * 1. **A conta nao estava aberta.** A tela mostrava so o numero final. Agora
 *    mostra de onde ele vem — quantos copos vezes quanto, quantos toppings
 *    vezes quanto — porque e isso que se confere em voz alta com o cliente.
 * 2. **Pagamento e troco eram pequenos demais.** Eram justamente o que se le
 *    alto. Viraram os dois maiores blocos depois do total.
 * 3. **A lista de copos era pobre.** "Copo 1" com os toppings de lado, tudo do
 *    mesmo tamanho, sem preco e sem emoji — nao dava para bater o olho. Agora
 *    cada copo e um cartao com numero, fichas de topping e o proprio preco.
 *
 * A conta e derivada aqui, mas o `total` continua vindo pronto do reducer:
 * esta tela **nunca** recalcula o que vai ser gravado. Ela so explica.
 */
export function ReviewSheet({
  cups,
  total,
  payment,
  recebido,
  onRecebido,
  gorjeta,
  onGorjeta,
  onConfirm,
  onBack,
}: Props) {
  const { t } = useLang();
  const reduzir = useReducedMotion();
  /** Campo "Outro" aberto. Fechado por padrao: teclado atrasa a fila. */
  const [outro, setOutro] = useState("");
  const [abrirOutro, setAbrirOutro] = useState(false);

  const precoCopo = getCupPrice();
  const precoTopping = getToppingPrice();
  const toppings = cups.reduce((n, c) => n + c.toppings.length, 0);

  const dinheiro = payment === "cash";
  // As notas so aparecem quando ha iPad pareado E o pagamento e dinheiro.
  // Sem display, esta tela nao passa a exigir um toque que nunca exigiu.
  const comNotas = dinheiro && lerPar() !== null;
  /** Arredonda ao rappen: 0.1 + 0.2 nao pode virar troco de 0.30000000004. */
  const rappen = (n: number) => Math.round(n * 100) / 100;
  /**
   * O que sobra do que o cliente deu, ANTES de decidir o que e gorjeta. E
   * este numero que o atalho "ficou com o troco" transforma em gorjeta —
   * calculado a parte de propósito, porque assim que a gorjeta entra o troco
   * vai a zero e o atalho perderia o proprio valor.
   */
  const sobra = recebido !== null ? rappen(Math.max(0, recebido - total)) : null;
  /** Troco de verdade: o que volta para a mao do cliente. */
  const troco = recebido !== null ? rappen(Math.max(0, recebido - total - gorjeta)) : null;
  const podeFicarComTroco = sobra !== null && sobra > 0 && gorjeta !== sobra;

  /** Entrada escalonada, curta. Longa atrasaria a venda; e ela manda aqui. */
  const entra = (i: number) =>
    reduzir
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: 0.04 * i, duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col bg-cream-soft"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* Titulo fica centrado; o toggle vai absoluto a direita para nao
          empurrar o centro. O idioma tem que estar aqui tambem — e a ultima
          tela que a Romana le antes de gravar a venda. */}
      <header className="relative shrink-0 bg-brand px-4 py-2.5 text-center text-cream">
        <h1 className="font-display text-xl">{t("review.title")}</h1>
        <div className="absolute inset-y-0 right-3 flex items-center">
          <LangToggle />
        </div>
      </header>

      {/* ── O valor e a forma de pagamento ─────────────────────────────────
          Juntos, e grandes: sao as duas coisas ditas em voz alta. Antes o
          pagamento era uma linha discreta embaixo do numero. */}
      <div className="shrink-0 bg-brand-dark px-4 pt-3 pb-4 text-center text-cream">
        <Valor chf={total} tamanho="gigante" />
        <motion.p
          {...entra(0)}
          className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full bg-cream px-5 py-1.5 text-brand-dark"
        >
          <span className="text-2xl leading-none">{dinheiro ? "💵" : "📱"}</span>
          <span className="text-xl font-bold">
            {t(dinheiro ? "pay.cash" : "pay.twint")}
          </span>
        </motion.p>
      </div>

      {/* ── O miolo, que rola ──────────────────────────────────────────────
          Cabecalho e rodape ficam parados: o botao Confirmar nunca pode
          depender de rolagem para ser alcancado. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* A conta aberta. */}
        <motion.div {...entra(1)} className="rounded-2xl bg-cream p-3">
          <p className="pb-1.5 text-xs uppercase tracking-wider text-ink-muted">
            {t("review.account")}
          </p>
          <LinhaConta
            titulo={`${cups.length} × ${t("review.cupOne")}`}
            unidade={`${money(precoCopo)} ${t("review.each")}`}
            valor={cups.length * precoCopo}
          />
          {toppings > 0 && (
            <LinhaConta
              titulo={`${toppings} × ${t("review.toppingOne")}`}
              unidade={`${money(precoTopping)} ${t("review.each")}`}
              valor={toppings * precoTopping}
            />
          )}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-black/10 pt-2">
            <span className="text-sm font-bold uppercase tracking-wider text-ink">
              {t("review.total")}
            </span>
            <span className="font-display text-2xl tabular-nums text-brand">
              {money(total)}
            </span>
          </div>
        </motion.div>

        {/* Os copos, um cartao cada. */}
        <ul className="mt-3 space-y-2">
          {cups.map((c, i) => (
            <motion.li
              key={c.id}
              {...entra(2 + i)}
              className="flex items-start gap-2.5 rounded-2xl bg-cream px-3 py-2.5"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand font-display text-sm leading-none text-cream">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg leading-tight text-ink">
                    🍓 {t("review.cupOne")}
                  </span>
                  <span className="shrink-0 font-display text-lg tabular-nums text-ink-muted">
                    {money(precoCopo + c.toppings.length * precoTopping)}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.toppings.length === 0 ? (
                    <span className="text-sm text-ink-muted/70">
                      {t("order.noTopping")}
                    </span>
                  ) : (
                    c.toppings.map((x, n) => (
                      <span
                        key={`${x}-${n}`}
                        className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-sm text-brand-dark"
                      >
                        <span aria-hidden="true">{toppingEmoji(x)}</span>
                        {t(`topping.${x}`)}
                      </span>
                    ))
                  )}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* ── O rodape ───────────────────────────────────────────────────────*/}
      <footer className="shrink-0 border-t border-black/10 bg-cream-soft px-4 pt-2.5 pb-5">
        {comNotas && (
          <div className="pb-2.5">
            <p className="pb-1.5 text-xs uppercase tracking-wider text-ink-muted">
              {t("review.given")}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {NOTAS.map((n) => (
                <button
                  key={n}
                  onClick={() => onRecebido(recebido === n ? null : n)}
                  disabled={n < total}
                  className={`rounded-xl py-2.5 text-base font-semibold tabular-nums transition disabled:opacity-25 ${
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
                className={`rounded-xl py-2.5 text-xs font-semibold transition ${
                  recebido === total ? "bg-brand text-cream" : "bg-cream text-brand-dark"
                }`}
              >
                {t("review.exact")}
              </button>
            </div>
          </div>
        )}

        {/* ── Gorjeta (ops 17) ───────────────────────────────────────────
            Fica ABAIXO das notas e ACIMA do troco, que e a ordem em que a
            coisa acontece no balcao: o cliente da o dinheiro, diz "pode
            ficar", e so entao se sabe qual e o troco.

            A Sunbite nunca pede gorjeta: isto e registro, nao pedido, e nada
            disto vai para o iPad do cliente. Discreto de proposito — a linha
            fica quase invisivel enquanto a gorjeta e zero. */}
        <div className="pb-2.5">
          <div className="flex items-baseline justify-between gap-2 pb-1.5">
            <p className="text-xs uppercase tracking-wider text-ink-muted">
              {t("review.tip")}
            </p>
            <p
              className={`text-sm tabular-nums ${
                gorjeta > 0 ? "font-bold text-brand" : "text-ink-muted/70"
              }`}
            >
              {gorjeta > 0 ? money(gorjeta) : t("review.tipNone")}
            </p>
          </div>

          {/* Atalho do caso mais comum: "pode ficar". Um toque, e o valor ja
              esta na tela — nao precisa somar de cabeca no meio da fila. */}
          {podeFicarComTroco && (
            <button
              onClick={() => onGorjeta(sobra)}
              className="mb-1.5 min-h-[44px] w-full rounded-xl border-2 border-brand px-3 py-2 text-sm font-semibold leading-tight break-words text-brand"
            >
              {t("review.tipKeepChange")} · {money(sobra)}
            </button>
          )}

          <div className="grid grid-cols-5 gap-1.5">
            {GORJETAS.map((v) => (
              <button
                key={v}
                onClick={() => onGorjeta(gorjeta === v ? 0 : v)}
                className={`min-h-[44px] rounded-xl py-2.5 text-base font-semibold tabular-nums transition ${
                  gorjeta === v ? "bg-brand text-cream" : "bg-cream text-brand-dark"
                }`}
              >
                {v.toFixed(2).replace(/\.00$/, "")}
              </button>
            ))}
            <button
              onClick={() => {
                // Tocar em "Outro" com gorjeta posta e o jeito de tirar: quem
                // errou o valor no aperto precisa de uma saida de um toque.
                if (gorjeta > 0 && !abrirOutro) {
                  onGorjeta(0);
                  setOutro("");
                  return;
                }
                setAbrirOutro((x) => !x);
              }}
              className={`min-h-[44px] rounded-xl px-1 py-2.5 text-xs font-semibold leading-tight break-words transition ${
                abrirOutro ? "bg-brand text-cream" : "bg-cream text-brand-dark"
              }`}
            >
              {gorjeta > 0 && !abrirOutro ? t("review.tipClear") : t("review.tipOther")}
            </button>
          </div>

          {abrirOutro && (
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min="0"
              autoFocus
              value={outro}
              onChange={(e) => {
                setOutro(e.target.value);
                const n = Number(e.target.value);
                onGorjeta(Number.isFinite(n) && n > 0 ? rappen(n) : 0);
              }}
              placeholder="CHF"
              className="mt-1.5 w-full rounded-xl border border-black/20 bg-cream px-3 py-2.5 text-xl tabular-nums"
            />
          )}

          {/* Com gorjeta, o numero que a Romana confere em voz alta deixa de
              ser o total da conta. O total do produto continua sendo o que
              vai para o banco — este aqui e so leitura. */}
          {gorjeta > 0 && (
            <p className="pt-1.5 text-right text-sm text-ink-muted">
              {t("review.received")}{" "}
              <span className="font-bold tabular-nums text-ink">
                {money(rappen(total + gorjeta))}
              </span>
            </p>
          )}
        </div>

        {/* O troco aparece no celular tambem, e GRANDE: se o iPad estiver fora
            do ar a Romana ainda tem o numero, e e o numero que mais gera
            discussao no balcao. */}
        {troco !== null && (
          <motion.div
            initial={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="mb-2.5 flex items-center justify-between gap-3 rounded-2xl bg-brand px-4 py-2.5 text-cream"
          >
            <span className="text-sm uppercase tracking-wider text-cream/75">
              {t("review.change")}
            </span>
            <span className="font-display text-3xl tabular-nums">{money(troco)}</span>
          </motion.div>
        )}

        <button
          onClick={onConfirm}
          className="w-full rounded-3xl bg-brand py-5 font-display text-3xl text-cream shadow-lg active:scale-[0.99] transition"
        >
          {t("review.confirm")}
        </button>
        <button
          onClick={onBack}
          className="w-full pt-3 text-lg text-ink-muted underline underline-offset-4"
        >
          {t("review.back")}
        </button>
      </footer>
    </motion.div>
  );
}

/** Uma linha da conta: o que e, quanto custa cada, e quanto da. */
function LinhaConta({
  titulo,
  unidade,
  valor,
}: {
  titulo: string;
  unidade: string;
  valor: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="min-w-0">
        <span className="text-base font-semibold text-ink">{titulo}</span>
        <span className="ml-1.5 text-sm text-ink-muted">{unidade}</span>
      </span>
      <span className="shrink-0 tabular-nums text-ink">{money(valor)}</span>
    </div>
  );
}
