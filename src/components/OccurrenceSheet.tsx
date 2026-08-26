import { motion } from "framer-motion";
import { useState } from "react";
import { useLang } from "../i18n";
import { queueWrite } from "../outbox";
import { getCachedOpenOperationId } from "../operations";
import type { Pendency } from "../operations";

/**
 * Folha de Ocorrencia (Fatia 3 da V2, decisao 9 / PRD 6.4).
 *
 * Abre de dois lugares: da tela de Operacao e de DENTRO do PDV. Grava na
 * tabela `pendencies`, que ja existe e ja tem `operation_id` — nenhuma
 * tabela nova.
 *
 * ⚠️ Este arquivo importa `../outbox`, que importa `../supabase`. Por isso
 * ele SO entra por `lazy()` em App.tsx: o caminho da venda nao pode carregar
 * a biblioteca do Supabase, e e essa separacao — nao um `if` — que mantem a
 * garantia de que vender nao depende de login.
 *
 * Salvar nunca bloqueia: `queueWrite` nao lanca e a folha fecha na hora,
 * devolvendo o pedido em aberto intacto. Se a fila falhar, quem espera e a
 * ocorrencia, nunca a venda.
 */
export function OccurrenceSheet({
  onClose,
  createdBy = null,
  onSaved,
}: {
  onClose: () => void;
  /** Id de quem registrou, quando ha sessao. Do PDV vem nulo, de proposito. */
  createdBy?: string | null;
  onSaved?: (row: Pendency) => void;
}) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const [critical, setCritical] = useState(false);

  async function save() {
    const description = text.trim();
    if (!description) return;

    const row: Pendency = {
      id: crypto.randomUUID(),
      description,
      critical,
      status: "aberta",
      origin: "ocorrencia",
      operation_id: await getCachedOpenOperationId(),
      created_by: createdBy,
      created_at: new Date().toISOString(),
      resolved_by: null,
      resolved_at: null,
    };

    onSaved?.(row);
    onClose();
    await queueWrite("pendencies", row);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40">
      {/* O fundo escuro fecha: sair daqui tem que ser tao rapido quanto entrar. */}
      <button
        aria-label={t("pay.back")}
        onClick={onClose}
        className="flex-1"
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="space-y-3 rounded-t-3xl bg-cream-soft p-4 pb-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-brand-dark">
            ⚠️ {t("pendency.short")}
          </h2>
          <button onClick={onClose} className="px-3 py-1 text-3xl leading-none text-ink-muted">
            ×
          </button>
        </div>

        <textarea
          autoFocus
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("pendency.placeholder")}
          className="w-full rounded-2xl border border-black/10 bg-cream px-3 py-3 text-lg"
        />
        <p className="text-sm text-ink-muted">{t("pendency.examples")}</p>

        <button
          onClick={() => setCritical((v) => !v)}
          className={`w-full rounded-2xl border-2 py-3 font-semibold transition ${
            critical
              ? "border-red-700 bg-red-700/10 text-red-800"
              : "border-black/15 text-ink-muted"
          }`}
        >
          {critical ? "🔴" : "⚪️"} {t("pendency.critical")}
        </button>

        <button
          onClick={() => void save()}
          disabled={!text.trim()}
          className="w-full rounded-2xl bg-brand py-4 text-lg font-semibold text-cream disabled:opacity-40"
        >
          {t("pendency.save")}
        </button>
      </motion.div>
    </div>
  );
}

export default OccurrenceSheet;
