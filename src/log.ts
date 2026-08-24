import { appendLog, allLog, pruneLog, type LogRow } from "./db";

export type { LogRow };

const RETENTION_DAYS = 30;
const VERSION_KEY = "sunbite.last_version";

// Poda uma vez por carregamento do app — o app abre todo dia de mercado,
// entao isso basta pra manter os 30 dias sem precisar de cron no servidor.
// Fire-and-forget de proposito: nunca deve atrasar nem falhar o boot.
void pruneLog(RETENTION_DAYS);

// Troca de versao, detectada sozinha. Comparado no localStorage (sincrono,
// nao depende da saude do IndexedDB) contra __APP_VERSION__ (vite.config.ts).
(() => {
  const last = localStorage.getItem(VERSION_KEY);
  if (last && last !== __APP_VERSION__) {
    void logEvent("info", `Versão trocou de ${last} para ${__APP_VERSION__}.`);
  }
  if (last !== __APP_VERSION__) localStorage.setItem(VERSION_KEY, __APP_VERSION__);
})();

/** PT fixo, sempre — este log e para o Felipe, nao muda com o toggle PT·DE. */
export async function logEvent(kind: LogRow["kind"], message: string): Promise<void> {
  await appendLog({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, message });
}

export const readLog = allLog;
