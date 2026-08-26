import { useEffect, useState } from "react";
import { LangToggle, useLang } from "../i18n";
import { SunbiteLogo } from "./SunbiteLogo";
import { allSales, today } from "../db";
import { getCachedOpenOperation, type OpenOperationView } from "../operations";
import { isActive } from "../types";
import { Valor } from "./Valor";
import type { Screen } from "../App";

interface Tile {
  emoji: string;
  labelKey: string;
  screen: Screen;
}

/**
 * Seis modulos, exatamente os do PRD V2 §4.5. Compras, Fornecedores, Precos,
 * Cardapio e Sistema saem daqui de proposito — nao sumiram, mudaram de porta:
 * Compras abre dentro de Estoque, o resto dentro de Ajustes. A regra 4 da V2
 * e essa: funcao nova nao ganha botao na Home automaticamente.
 */
const TILES: Tile[] = [
  { emoji: "🎪", labelKey: "home.operation", screen: "operation" },
  { emoji: "📋", labelKey: "home.sales", screen: "sales" },
  { emoji: "💰", labelKey: "home.finance", screen: "finance" },
  { emoji: "📦", labelKey: "home.stock", screen: "stock" },
  { emoji: "📍", labelKey: "home.places", screen: "places" },
  { emoji: "🔧", labelKey: "home.equipment", screen: "equipment" },
];

/** "2026-08-26T08:30:00Z" -> "1h 45min", ou null se ainda nao ha abertura. */
function elapsed(openedAt: string | null | undefined): string | null {
  if (!openedAt) return null;
  const min = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 0) return null;
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

/**
 * Um numero do resumo. Valor em CHF passa pelo <Valor>, que encolhe a fonte
 * conforme o texto cresce — sem ele "CHF 8.50" ja quebrava em duas linhas num
 * cartao de um terco de tela, e "CHF 1234.50" em alemao vazaria de vez.
 */
function Metric({ label, chf, texto }: { label: string; chf?: number; texto?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-brand-dark/40 px-2 py-3 text-center">
      <p className="truncate text-[11px] uppercase tracking-wide text-cream/60">{label}</p>
      {chf !== undefined ? (
        <Valor chf={chf} tamanho="cartao" className="text-cream" />
      ) : (
        <p className="font-display text-xl leading-tight text-cream tabular-nums">{texto}</p>
      )}
    </div>
  );
}

/**
 * Tela inicial (PRD V2 §4). Deixou de ser um menu de 14 ladrilhos e passou a
 * responder "o que eu preciso fazer agora": estado da operacao no topo, uma
 * acao principal grande, o resumo do dia, e so entao os modulos.
 *
 * Continua NAO importando "../auth" nem "../supabase", igual desde a Etapa 6
 * — e essa ausencia, e nao um `if`, que mantem o bundle de entrada leve e o
 * app abrindo offline. O resumo do dia sai do IndexedDB (`allSales`) e o
 * estado da operacao do cache local (`getCachedOpenOperation`), preenchido
 * pelo mesmo efeito de sincronizacao que App.tsx ja roda.
 */
export function HomeScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { t } = useLang();
  const [op, setOp] = useState<OpenOperationView | null>(null);
  const [resumo, setResumo] = useState({ cups: 0, total: 0, cash: 0 });

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [operacao, vendas] = await Promise.all([
        getCachedOpenOperation(),
        allSales(),
      ]);
      if (!vivo) return;
      setOp(operacao);
      const hoje = today();
      const doDia = vendas.filter((s) => s.local_date === hoje && isActive(s));
      setResumo({
        cups: doDia.reduce((n, s) => n + s.cup_count, 0),
        total: doDia.reduce((n, s) => n + s.total, 0),
        cash: doDia.filter((s) => s.payment === "cash").reduce((n, s) => n + s.total, 0),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const aberta = op !== null;
  const duracao = elapsed(op?.opened_at);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-brand">
      <header className="flex items-center justify-between px-4 pt-4 pb-2 text-cream">
        <h1 className="text-3xl">
          <SunbiteLogo />
        </h1>
        <LangToggle />
      </header>

      <div className="px-4 pb-2">
        <p className="text-sm text-cream/70">
          {aberta ? t("home.opOpen") : t("home.opClosed")}
          {op?.place_name ? ` · ${op.place_name}` : ""}
        </p>
      </div>

      {/* Acao principal (§4.3). Com operacao aberta o caminho e voltar a
          vender; sem operacao, e abrir uma. Vender continua alcancavel pela
          barra de baixo nos dois casos — a venda nunca depende de operacao. */}
      <div className="px-4 pb-3">
        <button
          onClick={() => onNavigate(aberta ? "sale" : "operation")}
          className="w-full rounded-3xl bg-cream py-5 font-display text-2xl text-brand-dark shadow-lg transition active:scale-[0.99]"
        >
          {aberta ? t("home.keepSelling") : t("home.startOp")}
        </button>
      </div>

      {/* Resumo do dia (§4.4). "Dinheiro" e o que entrou em cash hoje, nao o
          caixa fisico: o caixa depende de `cash_initial`, que a Etapa 6 fechou
          para quem nao esta logado. A conta completa mora no Financeiro. */}
      {/* 2x2 fixo, e nao uma fileira que cresce. Com os quatro numeros lado a
          lado cada cartao ficava com ~85px e "CHF 1251.50" vazava por cima do
          vizinho — o mesmo problema que criou o <Valor>, so que agora vindo da
          largura da coluna. Duas colunas dobram o espaco de cada um, e o
          "Tempo" aparece sempre (com "—" quando nao ha operacao) para a grade
          nao mudar de forma ao abrir ou fechar a operacao. */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <Metric label={t("home.cups")} texto={String(resumo.cups)} />
        <Metric label={t("home.revenue")} chf={resumo.total} />
        <Metric label={t("home.cash")} chf={resumo.cash} />
        <Metric label={t("home.elapsed")} texto={duracao ?? "—"} />
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={() => onNavigate("ai")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-cream/40 py-3 font-display text-xl text-cream transition active:scale-[0.99]"
        >
          <span aria-hidden>✦</span>
          {t("home.aiCta")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 content-start">
        {TILES.map((tile) => (
          <button
            key={tile.screen}
            onClick={() => onNavigate(tile.screen)}
            className="flex flex-col items-center justify-center gap-2 rounded-3xl bg-cream py-6 text-brand-dark shadow-lg transition active:scale-[0.98]"
          >
            <span className="text-5xl leading-none">{tile.emoji}</span>
            <span className="font-display text-xl">{t(tile.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Ajustes em posicao secundaria (§4.5) — e a porta unica para Precos,
          Cardapio, Fornecedores e Sistema. */}
      <div className="px-4 pt-3 pb-6">
        <button
          onClick={() => onNavigate("settings")}
          className="w-full rounded-2xl py-3 text-center text-cream/70 underline underline-offset-4"
        >
          {t("home.settings")}
        </button>
      </div>
    </div>
  );
}
