import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
            /* `min-h-11` = 44px. Medido no navegador na Parte 4: as abas
               tinham 36px de altura, abaixo do minimo, e sao o caminho de
               troca de aba em Locais, Estoque e Financeiro. Mesma regra que
               levou os dois botoes da barra do PDV a 44x44 na Parte 3. */
            className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40 ${
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
        /* `max-h` + rolagem propria: a folha do local (Parte 4) tem sete
           campos mais o bloco da posicao e passa de 780px de altura. Sem
           isto o titulo saia cortado no topo e o fim da folha ficava
           inalcancavel em 360x780 — visto em foto, nao deduzido. */
        className="max-h-[85vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl bg-cream p-5 shadow-lg"
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

/* ------------------------------------------------------------------ */
/* Cards no estilo da Home (Parte 2 da ops 13)                         */
/* ------------------------------------------------------------------ */

/**
 * O card vertical da Home V2. Ate a ops 15 ele existia so inline dentro de
 * HomeScreen.tsx, e a tela de Operacao teria virado uma segunda copia — duas
 * copias do mesmo card e um jeito garantido de um dia elas discordarem.
 *
 * `tremer` e o erro suave: o card balanca e nada bloqueia. Trocar de valor
 * dispara a animacao de novo (a chave da animacao e o proprio numero), entao
 * tocar duas vezes numa fase bloqueada balanca duas vezes.
 *
 * ⚠️ Respeita `prefers-reduced-motion`: quem desligou animacao no aparelho
 * recebe so o Aviso, sem o balanco.
 */
/**
 * O rotulo do card encolhe em vez de quebrar no meio da palavra — a mesma
 * decisao que `Valor.tsx` tomou para os numeros, aplicada ao texto.
 *
 * Nasceu na Parte 4 com um caso que o `break-words` sozinho nao resolve:
 * "Weihnachtsmarkt Bahnhofstrasse" (30 letras) saia como "Weihnachtsmar/kt" na
 * coluna de ~150px. `hyphens: auto` nao salva — o Chrome desta maquina nao tem
 * dicionario alemao — e o U+00AD escrito a mao so serve para rotulo de i18n:
 * **nome de local e dado que o Felipe digita**, nao texto que eu escrevo.
 *
 * Degraus medidos na coluna do grid de 2 em 360px: "Weihnachtsmarkt" sozinha
 * ocupa ~150px em `text-xl` e ~120px em `text-base`.
 */
function tamanhoDoRotulo(label: string): string {
  if (label.length <= 14) return "text-xl";
  if (label.length <= 22) return "text-lg";
  return "text-base";
}

export function Tile({
  icone,
  label,
  apoio,
  pill,
  onClick,
  atenuado,
  destacado,
  tremer = 0,
}: {
  icone: ReactNode;
  label: string;
  apoio?: string;
  pill?: ReactNode;
  onClick: () => void;
  atenuado?: boolean;
  /** Anel claro em volta: "e por aqui que voce continua". */
  destacado?: boolean;
  tremer?: number;
}) {
  const semMovimento = useReducedMotion();
  /* `lang` no rotulo para o navegador saber onde parte a palavra composta
     alema: sem ele, `hyphens: auto` nao tem dicionario e "Kundenanzeige"
     quebra em "Kundenanzei/ge". `hyphens` existe desde o Safari 9 — dentro
     do piso 15. */
  const { lang } = useLang();
  return (
    <motion.button
      onClick={onClick}
      animate={tremer > 0 && !semMovimento ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      key={tremer}
      className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-3xl bg-cream px-3 py-6 text-brand-dark shadow-lg transition active:scale-[0.98] ${
        atenuado ? "opacity-55" : ""
      } ${destacado ? "ring-4 ring-cream/60" : ""}`}
    >
      <span className="flex h-12 w-12 items-center justify-center text-5xl leading-none">
        {icone}
      </span>
      {/* `break-words`, nunca `truncate`: em 360px a coluna do grid tem ~134px
          e "Kundenanzeige" saia como "Kundenanz…" nos Ajustes — a mesma
          familia do "Tela do clie…" da ops 13 e do rotulo do checklist na
          ops 15. Rotulo de card cortado e defeito. O card cresce, e a linha
          inteira do grid cresce junto. */}
      <span
        lang={lang}
        className={`hyphens-auto w-full break-words text-center font-display leading-tight ${tamanhoDoRotulo(label)}`}
      >
        {label}
      </span>
      {/* A linha de apoio tambem quebra em vez de truncar. Ela era `truncate`
          porque nasceu carregando "3 de 18" na tela de Operacao; na Parte 4
          ela passou a carregar o **nome do local** de um evento, e
          "Weihnachtsmarkt B…" nao identifica evento nenhum. */}
      {apoio && (
        <span lang={lang} className="hyphens-auto w-full break-words text-center text-sm text-ink-muted">
          {apoio}
        </span>
      )}
      {pill}
    </motion.button>
  );
}

/**
 * Grade dos cards. Duas colunas para as fases, tres para os itens do
 * checklist — os nomes de classe sao literais de proposito: o Tailwind v4 le
 * o codigo-fonte, e `grid-cols-${n}` montado em tempo de execucao nao gera
 * classe nenhuma.
 */
export function GridCards({ colunas = 2, children }: { colunas?: 2 | 3; children: ReactNode }) {
  return (
    <div className={`grid gap-3 ${colunas === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>
  );
}

/**
 * O item do checklist como botao fisico. Marcado nao e texto riscado: o botao
 * **afunda** (sombra interna, escala menor, fundo tingido) e ganha o visto no
 * canto. Riscar deixava o rotulo ilegivel no sol, e a Romana marca isso com a
 * mao molhada de morango.
 *
 * Alvo de toque: `py-3` + a moldura do desenho da 88px de altura, bem acima
 * dos 44px minimos.
 */
export function CardToggle({
  icone,
  label,
  marcado,
  selo,
  onClick,
}: {
  icone: ReactNode;
  label: string;
  marcado: boolean;
  selo?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={marcado}
      className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition ${
        marcado
          ? "scale-[0.97] bg-brand/15 shadow-inner"
          : "bg-cream shadow-sm active:scale-[0.97]"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">{icone}</span>
      {/* Sem `line-clamp`: em 3 colunas de 360px o card tem ~100px, e
          "Dinheiro contado dentro da caixa" saia como "Dinheiro contado
          dentr…". Rotulo de item cortado e defeito — quem le "Bateria da
          geladeira…" nao sabe se e a carregada ou a de reserva. O card cresce
          e a linha inteira do grid cresce junto, que e o comportamento certo.
          `break-words` porque o alemao tem palavra de 19 letras
          (Kuehlschrankbatterie) que estoura 100px sozinha. */}
      <span className="w-full break-words text-xs font-semibold leading-tight text-brand-dark">
        {label}
      </span>
      {selo}
      {marcado && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-cream">
          ✓
        </span>
      )}
    </button>
  );
}

/**
 * Recado que sobe, avisa e some — nunca bloqueia toque nenhum
 * (`pointer-events-none`). Ate a ops 15 o unico aviso do app era um banner
 * preso dentro de App.tsx, que nenhuma outra tela alcancava.
 *
 * Quem chama controla o tempo: passar `null` em `texto` faz sumir.
 */
export function Aviso({ texto }: { texto: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <AnimatePresence>
        {texto && (
          <motion.p
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            /* Creme com borda escura, e nao `bg-brand-dark`: o aviso sobe tanto
               sobre a grade das fases (fundo `bg-brand`, vermelho) quanto
               dentro de uma fase (fundo creme). Vermelho escuro sobre vermelho
               ficou ilegivel — visto em screenshot. A borda e a sombra e o que
               faz o creme se separar do creme. */
            className="max-w-sm rounded-2xl border-2 border-brand-dark bg-cream px-4 py-3 text-center text-sm font-semibold text-brand-dark shadow-xl"
          >
            {texto}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
