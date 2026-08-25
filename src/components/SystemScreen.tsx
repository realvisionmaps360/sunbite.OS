import { useCallback, useEffect, useState } from "react";
import { allSales, deviceId, pendingSales } from "../db";
import { useLang } from "../i18n";
import { readLog, type LogRow } from "../log";
import { ensureFreshSession, useAuth, type AuthState } from "../auth";
import { getSupabase } from "../supabase";
import type { Sale } from "../types";
import { AdminHeader, Card, EmptyState } from "./ui";

type Tab = "errors" | "log" | "device";

/**
 * Tela diagnostica (Etapa 5). Diferente de LoginScreen, esta tela NAO exige
 * sessao — funciona offline e deslogada, entao entra via React.lazy proprio
 * em App.tsx, fora do barril adminScreens.ts (que e so para telas que
 * exigem sessao). Pode importar useAuth()/ensureFreshSession pela mesma
 * razao que LoginScreen pode: so carrega quando a tela abre.
 */
export default function SystemScreen({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("errors");
  const [pending, setPending] = useState<Sale[]>([]);
  const [salesCount, setSalesCount] = useState(0);
  const [logRows, setLogRows] = useState<LogRow[]>([]);

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const load = useCallback(async () => {
    const [p, all, log] = await Promise.all([pendingSales(), allSales(), readLog()]);
    setPending(p);
    setSalesCount(all.length);
    setLogRows(log);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-cream-soft">
      <AdminHeader title={t("system.title")} onClose={onClose} />

      <nav className="flex gap-1 bg-brand px-3 pb-3">
        {(["errors", "log", "device"] as Tab[]).map((v) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              tab === v ? "bg-cream text-brand-dark" : "bg-black/20 text-cream"
            }`}
          >
            {t(`system.tab.${v}`)}
          </button>
        ))}
      </nav>

      {tab === "errors" && <ErrorsTab pending={pending} logRows={logRows} />}
      {tab === "log" && <LogTab auth={auth} logRows={logRows} />}
      {tab === "device" && (
        <DeviceTab auth={auth} salesCount={salesCount} logCount={logRows.length} />
      )}
    </div>
  );
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/* ------------------------------------------------------------- Erros */

function ErrorsTab({ pending, logRows }: { pending: Sale[]; logRows: LogRow[] }) {
  const { t } = useLang();
  const lastFailure = logRows.find((r) => r.kind === "error");

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      <div className="space-y-3 rounded-2xl bg-brand-dark p-4 text-cream">
        <p className="text-xs uppercase tracking-widest opacity-70">
          {pending.length === 0
            ? t("system.errors.pendingEmpty")
            : t(pending.length === 1 ? "system.errors.pending_one" : "system.errors.pending", {
                n: pending.length,
              })}
        </p>
        {pending.length > 0 && (
          <ul className="space-y-1 text-sm">
            {pending.map((s) => (
              <li key={s.id} className="opacity-90">
                {s.local_date} {s.local_time.slice(0, 5)} · {s.cup_count} ·{" "}
                {s.payment === "cash" ? "💵" : "📱"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-display text-xl">{t("system.errors.lastFailure")}</h2>
        {lastFailure ? (
          <Card className="bg-red-700/10">
            <p className="text-xs text-red-800/70">{fmtWhen(lastFailure.at)}</p>
            <p className="font-semibold text-red-800">{lastFailure.message}</p>
          </Card>
        ) : (
          <EmptyState emoji="✅" text={t("system.errors.noFailure")} />
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">{t("system.errors.history")}</h2>
        <LogList rows={logRows} emptyText={t("system.empty")} />
      </section>
    </div>
  );
}

/* --------------------------------------------------------- Quem fez o quê */

interface ServerLogRow {
  occurred_at: string;
  device_id: string | null;
  action: string;
  message: string;
}

function LogTab({ auth, logRows }: { auth: AuthState; logRows: LogRow[] }) {
  const { t } = useLang();
  const [server, setServer] = useState<ServerLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const podeTentarServidor = navigator.onLine && auth.kind === "ativo";

  useEffect(() => {
    if (!podeTentarServidor) {
      setServer(null);
      return;
    }
    let cancelado = false;
    setLoading(true);
    void (async () => {
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from("activity_log")
          .select("occurred_at, device_id, action, message")
          .order("occurred_at", { ascending: false })
          .limit(200);
        if (!cancelado) setServer(error ? null : (data ?? []));
      } catch {
        if (!cancelado) setServer(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeTentarServidor]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="font-display text-xl">{t("system.log.heading")}</h2>

      {server ? (
        server.length === 0 ? (
          <EmptyState emoji="🗒️" text={t("system.empty")} />
        ) : (
          <div className="space-y-2">
            {server.map((r, i) => (
              <Card key={i}>
                <p className="text-xs text-ink-muted">{fmtWhen(r.occurred_at)}</p>
                <p>{r.message}</p>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {loading ? t("system.log.loading") : t("system.log.onlyThisDevice")}
          </p>
          <LogList rows={logRows} emptyText={t("system.empty")} />
        </>
      )}
    </div>
  );
}

function LogList({ rows, emptyText }: { rows: LogRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <EmptyState emoji="🗒️" text={emptyText} />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.id}>
          <p className="text-xs text-ink-muted">{fmtWhen(r.at)}</p>
          <p className={r.kind === "error" ? "text-red-800" : ""}>{r.message}</p>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Aparelho */

function DeviceTab({
  auth,
  salesCount,
  logCount,
}: {
  auth: AuthState;
  salesCount: number;
  logCount: number;
}) {
  const { t } = useLang();
  const [online, setOnline] = useState(navigator.onLine);
  const [storage, setStorage] = useState<{ usedMB: number; persisted: boolean | null }>({
    usedMB: 0,
    persisted: null,
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const usedMB = (await navigator.storage?.estimate?.())?.usage;
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      setStorage({ usedMB: usedMB ? Math.round(usedMB / 1024 / 1024) : 0, persisted });
    })();
  }, []);

  const rows: [string, string][] = [
    [
      t("system.device.connection"),
      online ? t("system.device.online") : t("system.device.offline"),
    ],
    [t("system.device.version"), __APP_VERSION__],
    [t("system.device.session"), t(`system.device.session.${auth.kind}`)],
    [
      t("system.device.storage"),
      `${storage.usedMB} MB · ${
        storage.persisted === null
          ? t("system.device.storageUnknown")
          : storage.persisted
            ? t("system.device.storagePersisted")
            : t("system.device.storageNotPersisted")
      }`,
    ],
    [t("system.device.id"), deviceId()],
    [t("system.device.salesCount"), String(salesCount)],
    [t("system.device.logCount"), String(logCount)],
  ];

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <Card>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 border-b border-black/5 pb-2 last:border-0 last:pb-0">
            <span className="text-sm text-ink-muted">{label}</span>
            <span className="text-right text-sm font-semibold">{value}</span>
          </div>
        ))}
      </Card>
      <p className="text-center text-sm text-ink-muted">{t("system.device.updateInfo")}</p>
    </div>
  );
}
