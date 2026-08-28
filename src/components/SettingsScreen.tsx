import { useState } from "react";
import { money } from "../config";
import { deviceId } from "../db";
import { DisplayScreen } from "./DisplayScreen";
import { useLang } from "../i18n";
import { getCupPrice, getToppingPrice } from "../prices";
import { loadConfig, syncNow } from "../sync";
import { AdminHeader, Card, TileButton } from "./ui";

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

      <div className="space-y-3 p-4 select-text">
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
          <TileButton emoji="💰" label={t("settings.priceHint")} variant="outline" onClick={onOpenPrices} />
          <TileButton emoji="📖" label={t("home.menu")} variant="outline" onClick={onOpenMenu} />
        </Card>

        <Card>
          <h2 className="font-display text-xl">{t("home.stock")}</h2>
          <TileButton emoji="🏭" label={t("home.suppliers")} variant="outline" onClick={onOpenSuppliers} />
        </Card>

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

        {/* Tela propria, e nao um cartao aqui dentro: parear o iPad, escolher
            o que ele reveza e colar os enderecos dos QR nao cabem num cartao
            sem virar um formulario espremido no meio dos Ajustes. */}
        <TileButton
          emoji="📺"
          label={t("display.title")}
          variant="outline"
          onClick={() => setDisplay(true)}
        />

        <TileButton emoji="🛠️" label={t("settings.system")} variant="outline" onClick={onOpenSystem} />

        {/* Caminho de volta para a tela do cliente, no proprio tablet.
            `display.html` e uma PAGINA do build, nao uma rota do App — entao
            e um link de verdade, nao um setScreen. Existe porque o Felipe
            atualizou o iPad, caiu na Home do PDV e ficou sem como voltar: a
            unica instrucao era digitar a URL na mao no Safari. */}
        <a
          href="/display.html"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand py-4 font-semibold text-brand transition active:scale-[0.98]"
        >
          <span className="text-2xl leading-none">🖥️</span>
          {t("settings.openDisplay")}
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
