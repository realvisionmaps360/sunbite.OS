import { LangToggle, useLang } from "../i18n";
import type { Screen } from "../App";

interface Tile {
  emoji: string;
  labelKey: string;
  screen: Screen;
  /** Ocupa a linha inteira sozinho — usado só para Entrar, que fica isolado. */
  wide?: boolean;
}

const TILES: Tile[] = [
  { emoji: "🍓", labelKey: "home.sell", screen: "sale" },
  { emoji: "🎪", labelKey: "home.operation", screen: "operation" },
  { emoji: "📋", labelKey: "home.sales", screen: "sales" },
  { emoji: "📖", labelKey: "home.menu", screen: "menu" },
  { emoji: "🔧", labelKey: "home.equipment", screen: "equipment" },
  { emoji: "🏭", labelKey: "home.suppliers", screen: "suppliers" },
  { emoji: "📦", labelKey: "home.stock", screen: "stock" },
  { emoji: "⚙️", labelKey: "home.settings", screen: "settings" },
  { emoji: "🛠️", labelKey: "home.system", screen: "system" },
  { emoji: "👤", labelKey: "home.login", screen: "login", wide: true },
];

/**
 * Tela inicial (hub) — hoje a primeira coisa que abre. So navegacao: NAO
 * importa "../auth" nem "../supabase", igual App.tsx nunca importou — assim
 * o botao "Entrar" continua neutro (nunca mostra logado/deslogado aqui) e o
 * bundle de entrada continua leve.
 */
export function HomeScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { t } = useLang();

  return (
    <div className="flex h-full flex-col bg-brand">
      <header className="flex items-center justify-between px-4 pt-4 pb-2 text-cream">
        <h1 className="font-display text-3xl">{t("home.title")}</h1>
        <LangToggle />
      </header>

      <div className="grid flex-1 grid-cols-2 gap-3 p-4 content-start">
        {TILES.map((tile) => (
          <button
            key={tile.screen}
            onClick={() => onNavigate(tile.screen)}
            className={`flex flex-col items-center justify-center gap-2 rounded-3xl bg-cream py-6 text-brand-dark shadow-lg active:scale-[0.98] transition ${
              tile.wide ? "col-span-2" : ""
            }`}
          >
            <span className="text-5xl leading-none">{tile.emoji}</span>
            <span className="font-display text-xl">{t(tile.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
