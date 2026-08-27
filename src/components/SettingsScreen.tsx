import { useEffect, useState } from "react";
import { money } from "../config";
import { allSales, deleteToday, deviceId, today } from "../db";
import {
  apagarPar,
  codigoValido,
  gravarPar,
  lerPar,
} from "../display/protocol";
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
  const [todayCount, setTodayCount] = useState(0);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void allSales().then((rows) =>
      setTodayCount(rows.filter((s) => s.local_date === today()).length),
    );
  }, [msg]);

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

  async function handleReset() {
    const n = await deleteToday();
    setAsking(false);
    setMsg(n === 0 ? t("settings.resetNone") : t("settings.resetDone", { n }));
    onDataChanged();
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

        <Pareamento aviso={setMsg} />

        <TileButton emoji="🛠️" label={t("settings.system")} variant="outline" onClick={onOpenSystem} />

        {/* Fica por último de propósito: ninguém encosta aqui sem querer. */}
        <Card className="border-2 border-red-600/30">
          <h2 className="font-display text-xl text-red-700">
            {t("settings.danger")}
          </h2>
          <p className="text-sm text-ink-muted">{t("settings.resetHint")}</p>

          {asking ? (
            <div className="space-y-3">
              <p className="font-semibold text-red-700">
                {t("settings.resetAsk", { n: todayCount })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-2xl bg-red-700 py-3 font-semibold text-white"
                >
                  {t("settings.resetYes")}
                </button>
                <button
                  onClick={() => setAsking(false)}
                  className="flex-1 rounded-2xl border border-black/20 py-3 font-semibold"
                >
                  {t("settings.resetNo")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => (todayCount === 0 ? setMsg(t("settings.resetNone")) : setAsking(true))}
              className="w-full rounded-2xl border border-red-600/50 py-3 font-semibold text-red-700"
            >
              {t("settings.reset")}
              {todayCount > 0 && ` (${todayCount})`}
            </button>
          )}
        </Card>

        {msg && (
          <p className="rounded-2xl bg-brand/10 p-3 text-center text-brand">{msg}</p>
        )}

        <p className="text-center text-xs text-ink-muted">
          {t("settings.device", { id: deviceId().slice(0, 8) })}
        </p>
      </div>
    </div>
  );
}

/**
 * Parear o iPad da tela do cliente (Etapa 10).
 *
 * Fica nos Ajustes, e nao na Home, de proposito: parear acontece uma vez por
 * feira, e nada que a mao encosta durante o atendimento pode levar aqui.
 *
 * ⚠️ Este componente so escreve no `localStorage`. Quem abre canal e fala com
 * o Supabase e `display/emit.ts`, carregado por `App.tsx` sob demanda — os
 * Ajustes nao podem arrastar o client do Supabase para dentro deste chunk.
 */
function Pareamento({ aviso }: { aviso: (s: string) => void }) {
  const { t } = useLang();
  const [par, setPar] = useState<string | null>(lerPar);
  const [campo, setCampo] = useState("");
  const cfg = loadConfig();

  function parear() {
    const codigo = campo.trim();
    if (!codigoValido(codigo)) {
      aviso(t("display.invalid"));
      return;
    }
    gravarPar(codigo);
    setPar(codigo);
    setCampo("");
    // Recarrega porque o emissor abre uma vez, no `useEffect` de montagem do
    // App: sem isto o par so valeria na proxima abertura do app — e o Felipe
    // ficaria olhando um iPad parado sem saber por que.
    location.reload();
  }

  return (
    <Card>
      <h2 className="font-display text-xl">{t("display.title")}</h2>

      {!cfg && (
        <p className="text-sm text-ink-muted">{t("display.needsConfig")}</p>
      )}

      {par ? (
        <>
          <p className="text-sm font-semibold text-green-800">
            ✓ {t("display.paired", { code: par })}
          </p>
          <TileButton
            emoji="🔌"
            label={t("display.unpair")}
            variant="outline"
            onClick={() => {
              apagarPar();
              setPar(null);
              location.reload();
            }}
          />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{t("display.hint")}</p>
          <label className="block text-sm">
            <span className="text-ink-muted">{t("display.code")}</span>
            <input
              value={campo}
              onChange={(e) => setCampo(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={4}
              className="mt-1 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-2xl tabular-nums tracking-[0.4em]"
            />
          </label>
          <TileButton
            emoji="📺"
            label={t("display.pair")}
            variant="outline"
            onClick={parear}
          />
        </>
      )}
    </Card>
  );
}
