import { useEffect, useState, type FormEvent } from "react";
import { ensureFreshSession, login, logout, useAuth } from "../auth";
import { LangToggle, useLang } from "../i18n";

export default function LoginScreen({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const state = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Unico ponto do app que tenta confirmar uma sessao vencida contra o
  // servidor — so faz algo se o estado for sessao-offline (ver auth.ts).
  useEffect(() => {
    void ensureFreshSession();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  const loggedIn = state.kind === "ativo" || state.kind === "sessao-offline";

  return (
    <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-cream">
        <h1 className="font-display text-2xl">{t("auth.title")}</h1>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button onClick={onClose} className="px-3 py-1 text-3xl leading-none">
            ×
          </button>
        </div>
      </header>

      <div className="space-y-6 p-4">
        {loggedIn && (
          <section>
            <p className="font-semibold">
              {t("auth.loggedInAs", { email: state.identity.email })}
            </p>
            {state.kind === "sessao-offline" && (
              <p className="mt-1 text-sm text-ink-muted">{t("auth.offlineBadge")}</p>
            )}
            <button
              onClick={() => void logout()}
              className="mt-4 w-full rounded-lg border border-brand py-3 font-semibold text-brand"
            >
              {t("auth.signOut")}
            </button>
          </section>
        )}

        {!loggedIn && (
          <section>
            {state.kind === "expirado" && (
              <p className="mb-3 text-sm font-semibold text-red-700">
                {t("auth.expiredNotice")}
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)}>
              <label className="block text-sm font-semibold">{t("auth.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="off"
                autoComplete="username"
                className="mb-3 w-full rounded-lg border border-black/20 bg-white px-3 py-2"
              />

              <label className="block text-sm font-semibold">{t("auth.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mb-3 w-full rounded-lg border border-black/20 bg-white px-3 py-2"
              />

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="w-full rounded-lg bg-brand py-3 font-semibold text-cream disabled:opacity-40"
              >
                {busy ? t("auth.entering") : t("auth.enter")}
              </button>
            </form>

            {error && (
              <p className="mt-3 rounded-lg bg-red-700/10 p-3 text-center text-red-700">
                {t("auth.error", { msg: error })}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
