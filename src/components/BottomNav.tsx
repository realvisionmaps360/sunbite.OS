import { useLang } from "../i18n";
import type { Screen } from "../App";

/**
 * Barra fixa de navegacao (PRD V2 §3.3), a pedido do Felipe para testar na
 * pratica se ajuda ou atrapalha.
 *
 * **`sale` esta aqui porque precisa estar.** A Home V2 seguiu o PRD §4.5 e
 * deixou de ter ladrilho "Vender": a acao principal cobre isso, mas so leva a
 * vender quando ha operacao aberta. Sem esta barra, ficar sem operacao aberta
 * deixava a venda inalcancavel — quebrando a decisao 1 da V2, que diz que
 * vender nunca depende de operacao. Achado na verificacao da Fatia 2.
 * Se um dia alguem tirar `sale` daqui, tem que devolver o caminho na Home.
 *
 * Operacao ficou de fora de proposito: e uma acao de comeco e fim de dia, ja
 * alcancavel pelo botao grande e pelo ladrilho. A barra e para o que se toca
 * o tempo todo.
 *
 * ⚠️ A barra NAO aparece na venda, no pagamento nem na conferencia — quem
 * decide isso e App.tsx. Durante o atendimento o dedo da Romana nao pode
 * encostar em navegacao por acidente, que foi exatamente o motivo de os
 * gestos laterais terem sido removidos na Etapa 9 (commit ed96986). Repetir
 * o mesmo erro com uma barra fixa seria trocar seis por meia duzia.
 */
const DESTINOS: { screen: Screen; emoji: string; labelKey: string }[] = [
  { screen: "home", emoji: "🏠", labelKey: "nav.start" },
  { screen: "sale", emoji: "🍓", labelKey: "home.sell" },
  { screen: "sales", emoji: "📋", labelKey: "home.sales" },
  { screen: "ai", emoji: "✦", labelKey: "home.ai" },
];

export function BottomNav({
  current,
  onNavigate,
}: {
  current: Screen;
  onNavigate: (s: Screen) => void;
}) {
  const { t } = useLang();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-cream/15 bg-brand-dark pb-[env(safe-area-inset-bottom)]">
      {DESTINOS.map((d) => {
        const ativo = current === d.screen;
        return (
          <button
            key={d.screen}
            onClick={() => onNavigate(d.screen)}
            aria-current={ativo ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition ${
              ativo ? "text-cream" : "text-cream/50"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden>
              {d.emoji}
            </span>
            <span className="text-[11px] leading-none">{t(d.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Altura reservada para a barra nao cobrir o ultimo botao de cada tela.
 * Uma constante so, para nao existirem dois numeros que precisam bater.
 */
export const BOTTOM_NAV_PAD = "pb-16";
