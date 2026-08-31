import { useState } from "react";
import { money } from "../config";
import { deviceId } from "../db";
import { DisplayScreen } from "./DisplayScreen";
import { useLang } from "../i18n";
import { getCupPrice, getToppingPrice } from "../prices";
import { loadConfig, syncNow } from "../sync";
import { AdminHeader, Card, GridCards, Tile, TileButton } from "./ui";

/**
 * Modulo unico de configuracao (PRD V2 §12). A V2 tirou Cardapio,
 * Fornecedores, Precos e Sistema da Home: eles nao sumiram, passaram a abrir
 * daqui. Era a duplicacao que o PRD aponta — a mesma coisa aparecia em
 * "Ajustes", "Sistema" e "Precos", e nenhum dos tres era o dono.
 */
export function SettingsScreen({
  onClose,
  onDataChanged,
  onOpenSystem,
  onOpenPrices,
  onOpenMenu,
  onOpenSuppliers,
}: {
  onClose: () => void;
  onDataChanged: () => void;
  onOpenSystem: () => void;
  onOpenPrices: () => void;
  onOpenMenu: () => void;
  onOpenSuppliers: () => void;
}) {
  const { t } = useLang();
  const cfg = loadConfig();
  const [msg, setMsg] = useState("");
  const [display, setDisplay] = useState(false);

  async function handleSync() {
    setMsg(t("settings.syncing"));
    const r = await syncNow();
    if (r.ok) {
      setMsg(
        r.sent === 0
          ? t("settings.nothingPending")
          : t("settings.sent", { n: r.sent }),
      );
      onDataChanged();
    } else if (r.reason === "no-config") setMsg(t("settings.noConfig"));
    else if (r.reason === "offline") setMsg(t("settings.offline"));
    else setMsg(t("settings.error", { msg: r.message ?? "" }));
  }

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("settings.title")} onClose={onClose} />

      <div className="space-y-4 p-4 select-text">
        {/* Resumo do preco em vigor, sem botao: quem edita entra pelo card
            "Precos" da grade abaixo. Ate a Parte 3E este cartao acumulava
            resumo + dois botoes, e os botoes de navegacao ficavam escondidos
            dentro dele. */}
        <Card>
          <h2 className="font-display text-xl">{t("settings.prices")}</h2>
          <p className="font-display text-2xl tabular-nums text-brand">{money(getCupPrice())}</p>
          <p className="text-sm text-ink-muted">
            {t("settings.priceLine", {
              cup: money(getCupPrice()),
              topping: money(getToppingPrice()),
              both: money(getCupPrice() + getToppingPrice()),
            })}
          </p>
        </Card>

        {/* A grade e a porta unica para Precos, Cardapio, Fornecedores e
            Sistema (PRD V2 §12) — nenhum destes quatro tem outro caminho na
            V2, entao nenhum pode sair daqui. Mesmo `Tile`/`GridCards` da Home
            e da tela de Operacao: uma copia so do card, para as tres telas
            nunca divergirem de estilo.

            Rotulos curtos de proposito, porque o `Tile` trunca em uma linha e
            o alemao e onde o texto estoura: "Lieferanten" (11) e
            "Kundenanzeige" (13) cabem nos ~134px uteis de uma coluna em
            360px; "Verkaufspreis bearbeiten" nao caberia, por isso o card diz
            "Preise" e a frase longa ficou no cartao de resumo acima. */}
        <GridCards>
          <Tile icone="💰" label={t("settings.prices")} onClick={onOpenPrices} />
          <Tile icone="📖" label={t("home.menu")} onClick={onOpenMenu} />
          <Tile icone="🏭" label={t("home.suppliers")} onClick={onOpenSuppliers} />
          {/* Tela propria, e nao um cartao aqui dentro: parear o iPad, escolher
              o que ele reveza e colar os enderecos dos QR nao cabem num cartao
              sem virar um formulario espremido no meio dos Ajustes. */}
          <Tile icone="📺" label={t("display.title")} onClick={() => setDisplay(true)} />
          <Tile icone="🛠️" label={t("settings.system")} onClick={onOpenSystem} />
        </GridCards>

        {/* Sincronizacao fica FORA da grade de proposito: o card da grade e um
            destino ("me leve para..."), e isto e uma acao que responde na
            propria tela, com o estado da conexao em cima e a mensagem embaixo.
            Um `Tile` truncaria "Synchronisieren" (15 letras) e ainda assim
            nao teria onde dizer se esta conectado. */}
        <Card>
          {/* Diz o estado real. "Não configurado" com conexão ativa é mentira. */}
          {cfg ? (
            <p className="text-sm font-semibold text-green-800">
              ✓ {t("settings.connected", { host: new URL(cfg.url).host })}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">{t("settings.supabaseHint")}</p>
          )}
          <TileButton emoji="🔄" label={t("settings.sync")} variant="outline" onClick={() => void handleSync()} />
        </Card>

        {/* Caminho de volta para a tela do cliente, no proprio tablet.
            ⚠️ `display.html` e uma PAGINA do build (Vite multi-pagina), nao uma
            rota do App.tsx — entao isto e um <a href> de verdade, nunca um
            setScreen nem um <Tile>, que e <button>. Trocar por navegacao
            interna quebra o unico caminho de volta. Existe porque o Felipe
            atualizou o iPad, caiu na Home do PDV e ficou sem como voltar: a
            unica instrucao era digitar a URL na mao no Safari.
            ⚠️ E o rotulo NAO pode virar "abrir a tela do cliente": o card
            "Tela do cliente" (Kundenanzeige) logo acima CONFIGURA o iPad; este
            aqui USA ESTE APARELHO como tela do cliente. Em alemao os dois ja
            ficaram quase identicos uma vez — visto em screenshot, corrigido na
            ops 13.
            Sem truncate e com `text-center`/`leading-snug`: em alemao sao 40
            letras ("Dieses Gerät als Kundenbildschirm nutzen") e a frase
            precisa quebrar em duas linhas, nunca sumir num "…". */}
        <a
          href="/display.html"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand px-4 py-4 text-center font-semibold leading-snug text-brand transition active:scale-[0.98]"
        >
          <span className="shrink-0 text-2xl leading-none">🖥️</span>
          <span className="min-w-0 break-words">{t("settings.openDisplay")}</span>
        </a>

        {msg && (
          <p className="rounded-2xl bg-brand/10 p-3 text-center text-brand">{msg}</p>
        )}

        <p className="text-center text-xs text-ink-muted">
          {t("settings.device", { id: deviceId().slice(0, 8) })}
        </p>
      </div>

      {display && <DisplayScreen onClose={() => setDisplay(false)} />}
    </div>
  );
}
