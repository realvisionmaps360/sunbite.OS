import { useState, type ReactNode } from "react";
import { LangToggle, useLang } from "../i18n";

/**
 * Kit visual compartilhado das telas administrativas (pos-Etapa 7).
 *
 * Ate aqui cada tela (Equipamento, Fornecedores, Estoque, Compras,
 * Financeiro, Precos, Sistema) repetia a mesma sopa de classes Tailwind
 * para cabecalho, lista e badge — e o resultado parecia lista de texto, sem
 * a hierarquia visual da Home. Este arquivo junta esses blocos num lugar
 * so, para toda tela nova (ou redesenhada) puxar daqui em vez de reinventar.
 *
 * So usa os tokens de cor que ja existem em index.css — nenhuma cor nova.
 *
 * Hierarquia de fundo (V2, PRD 3.2). Cada camada precisa ser diferente da
 * de baixo, senao o elemento some — foi o que aconteceu com os campos do
 * login quando o `Card` virou creme:
 *   pagina `bg-cream-soft` › `Card` `bg-cream` › campo dentro do Card `bg-cream-soft`
 *   pagina `bg-cream-soft` › campo solto na pagina `bg-cream`
 */

export function AdminHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useLang();
  return (
    <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
      <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold">
        <span className="text-2xl leading-none">‹</span>
        {t("nav.home")}
      </button>
      {/* text-xl, nao text-2xl: em 360px sobram ~150px entre o "‹ Inicio" e o
          PT·DE, e "Tela do cliente" saia como "Tela do clie…". Titulo de tela
          cortado e defeito, nao detalhe — foi visto em screenshot. */}
      <h1 className="min-w-0 flex-1 truncate text-center font-display text-xl">{title}</h1>
      <LangToggle />
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-3 rounded-2xl bg-cream p-4 shadow-sm ${className}`}>{children}</div>;
}

export function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-cream p-8 text-center">
      <span className="text-4xl">{emoji}</span>
      <p className="text-ink-muted">{text}</p>
    </div>
  );
}

type Tone = "ok" | "warn" | "danger" | "neutral";

const PILL_TONE: Record<Tone, string> = {
  ok: "bg-green-700/10 text-green-800",
  warn: "bg-amber-600/15 text-amber-800",
  danger: "bg-red-700/10 text-red-800",
  neutral: "bg-black/10 text-ink-muted",
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_TONE[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Botao grande no mesmo estilo dos tiles da Home — para a acao primaria de
 * cada tela (adicionar, registrar movimento, salvar). `variant="dashed"` e
 * o botao de "adicionar novo", com borda tracejada em vez de preenchido.
 */
export function TileButton({
  emoji,
  label,
  onClick,
  disabled,
  variant = "solid",
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "dashed" | "outline";
}) {
  const base = "flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
  const styles: Record<string, string> = {
    solid: "bg-brand text-cream shadow-sm",
    outline: "border-2 border-brand text-brand",
    dashed: "border-2 border-dashed border-brand/40 text-brand",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]}`}>
      <span className="text-2xl leading-none">{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Substitui um <select> por uma fileira de botoes com emoji + rotulo — a
 * peca central do pedido do Felipe: "botoes visuais", nao menu suspenso.
 */
export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; emoji: string; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40 ${
              active ? "bg-brand text-cream" : "bg-cream-soft text-ink"
            }`}
          >
            <span className="text-base leading-none">{opt.emoji}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Caixa que cobre a tela para uma explicacao curta. Fecha no X e no toque
 * fora — nunca e um passo obrigatorio, so leitura.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-2xl bg-cream p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <h2 className="flex-1 font-display text-xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="×"
            className="-mt-1 shrink-0 rounded-lg px-2 text-2xl leading-none text-ink-muted"
          >
            ×
          </button>
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}

/**
 * O "?" do tutorial embutido (V2, decisao 12 / PRD 7.7). Fica ao lado do
 * rotulo e abre duas ou tres frases explicando aquele numero.
 *
 * Existe porque o PRD 7.1 e explicito: se uma funcao financeira exige
 * raciocinio contabil, ela precisa ser simplificada **ou** acompanhada de
 * tutorial dentro da propria tela. Como a conta do caixa nao da para
 * simplificar mais do que ja esta, o tutorial vem junto.
 *
 * `topic` e a chave em i18n: `explain.<topic>.title` e `explain.<topic>.body`.
 */
export function Explain({ topic }: { topic: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("explain.aria")}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 align-middle text-xs font-bold text-brand"
      >
        ?
      </button>
      {open && (
        <Modal title={t(`explain.${topic}.title`)} onClose={() => setOpen(false)}>
          <p>{t(`explain.${topic}.body`)}</p>
        </Modal>
      )}
    </>
  );
}

/**
 * Linha rotulo × valor. Grade de duas colunas: o valor tem largura propria e
 * nunca briga com o rotulo, mesmo em CHF 1234.50. Nasceu no fechamento e a
 * Fatia 4 passou a usar a mesma linha no Financeiro — a conta do caixa tem
 * que se parecer igual nas duas telas, senao vira duas contas aos olhos de
 * quem le.
 *
 * `explain` acrescenta o "?" do tutorial ao lado do rotulo.
 */
export function Linha({
  label,
  value,
  destaque,
  explain,
}: {
  label: string;
  value: string;
  destaque?: boolean;
  explain?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${destaque ? "font-semibold text-red-800" : "text-ink-muted"}`}>
        {label}
        {explain && <Explain topic={explain} />}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          destaque ? "font-semibold text-red-800" : "font-semibold"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
