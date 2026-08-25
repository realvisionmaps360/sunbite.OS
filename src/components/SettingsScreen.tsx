import { useEffect, useState } from "react";
import { money } from "../config";
import { allSales, deleteToday, deviceId, today } from "../db";
import { LangToggle, useLang } from "../i18n";
import { getCupPrice, getToppingPrice } from "../prices";
import { loadConfig, saveConfig, syncNow } from "../sync";

export function SettingsScreen({
  onClose,
  onDataChanged,
  onOpenSystem,
  onOpenPrices,
}: {
  onClose: () => void;
  onDataChanged: () => void;
  onOpenSystem: () => void;
  onOpenPrices: () => void;
}) {
  const { t } = useLang();
  const cfg = loadConfig();
  const [url, setUrl] = useState(cfg?.url ?? "");
  const [key, setKey] = useState(cfg?.anonKey ?? "");
  const [msg, setMsg] = useState("");
  const [todayCount, setTodayCount] = useState(0);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void allSales().then((rows) =>
      setTodayCount(rows.filter((s) => s.local_date === today()).length),
    );
  }, [msg]);

  function handleSave() {
    saveConfig(
      url.trim() && key.trim() ? { url: url.trim(), anonKey: key.trim() } : null,
    );
    setMsg(t("settings.saved"));
    onDataChanged();
  }

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
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center gap-3 bg-brand px-3 py-3 text-cream">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-2 text-lg font-semibold"
        >
          <span className="text-2xl leading-none">‹</span>
          {t("nav.home")}
        </button>
        <h1 className="flex-1 truncate text-center font-display text-2xl">{t("settings.title")}</h1>
        <LangToggle />
      </header>

      <div className="space-y-6 p-4 select-text">
        <section>
          <h2 className="font-display text-xl">{t("settings.prices")}</h2>
          <p className="text-ink-muted">
            {t("settings.priceLine", {
              cup: money(getCupPrice()),
              topping: money(getToppingPrice()),
              both: money(getCupPrice() + getToppingPrice()),
            })}
          </p>
          <button
            onClick={onOpenPrices}
            className="mt-2 w-full rounded-lg border border-black/20 py-3 font-semibold"
          >
            {t("settings.priceHint")}
          </button>
        </section>

        <section>
          <h2 className="font-display text-xl">Supabase</h2>
          {/* Diz o estado real. "Não configurado" com conexão ativa é mentira. */}
          {cfg ? (
            <p className="mb-2 text-sm font-semibold text-green-800">
              ✓ {t("settings.connected", { host: new URL(cfg.url).host })}
            </p>
          ) : (
            <p className="mb-2 text-sm text-ink-muted">{t("settings.supabaseHint")}</p>
          )}

          <label className="block text-sm font-semibold">{t("settings.url")}</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            inputMode="url"
            autoCapitalize="off"
            className="mb-3 w-full rounded-lg border border-black/20 bg-white px-3 py-2"
          />

          <label className="block text-sm font-semibold">{t("settings.key")}</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="eyJ…"
            autoCapitalize="off"
            className="w-full rounded-lg border border-black/20 bg-white px-3 py-2"
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 rounded-lg bg-brand py-3 font-semibold text-cream"
            >
              {t("settings.save")}
            </button>
            <button
              onClick={handleSync}
              className="flex-1 rounded-lg border border-brand py-3 font-semibold text-brand"
            >
              {t("settings.sync")}
            </button>
          </div>
        </section>

        <section>
          <button
            onClick={onOpenSystem}
            className="w-full rounded-lg border border-black/20 py-3 font-semibold"
          >
            {t("settings.system")}
          </button>
        </section>

        {/* Fica por último de propósito: ninguém encosta aqui sem querer. */}
        <section className="rounded-2xl border-2 border-red-600/30 p-4">
          <h2 className="font-display text-xl text-red-700">
            {t("settings.danger")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("settings.resetHint")}</p>

          {asking ? (
            <div className="mt-3">
              <p className="font-semibold text-red-700">
                {t("settings.resetAsk", { n: todayCount })}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-lg bg-red-700 py-3 font-semibold text-white"
                >
                  {t("settings.resetYes")}
                </button>
                <button
                  onClick={() => setAsking(false)}
                  className="flex-1 rounded-lg border border-black/20 py-3 font-semibold"
                >
                  {t("settings.resetNo")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => (todayCount === 0 ? setMsg(t("settings.resetNone")) : setAsking(true))}
              className="mt-3 w-full rounded-lg border border-red-600/50 py-3 font-semibold text-red-700"
            >
              {t("settings.reset")}
              {todayCount > 0 && ` (${todayCount})`}
            </button>
          )}
        </section>

        {msg && (
          <p className="rounded-lg bg-brand/10 p-3 text-center text-brand">{msg}</p>
        )}

        <p className="text-center text-xs text-ink-muted">
          {t("settings.device", { id: deviceId().slice(0, 8) })}
        </p>
      </div>
    </div>
  );
}
