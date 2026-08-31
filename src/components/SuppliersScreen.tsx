import { useCallback, useEffect, useState } from "react";
import { ensureFreshSession, useAuth } from "../auth";
import { useLang } from "../i18n";
import { getSupabase } from "../supabase";
import type { Supplier } from "../types";
import LoginScreen from "./LoginScreen";
import { AdminHeader, Card, EmptyState, Modal, StatusPill, TileButton } from "./ui";

/**
 * Tela de Fornecedores (Etapa 7) — mesmo padrao de EquipmentScreen: exige
 * sessao, so com internet, sem fila.
 *
 * Parte 3D (ops 16): o card era o mais alto do app, ~290px, com tres campos
 * de texto sempre abertos para dados que quase nunca mudam — um fornecedor
 * nao troca de telefone toda semana. A tela rolava muito para mostrar pouco.
 *
 * Hoje o card fechado tem ~66px e mostra o que identifica de relance (nome +
 * produto/contato). Tocar abre a folha de edicao com os tres campos.
 * **Nada ficou inalcancavel**: o card e sempre tocavel, inclusive offline
 * (offline os campos abrem desabilitados, como ja eram antes, mas o valor
 * continua legivel — antes tambem so dava para ler, nunca para editar).
 *
 * ⚠️ Piso de CSS: Safari 15. Nada de `@container`, `cqw`, `:has()` nem
 * aninhamento nativo — unidade que o navegador nao entende invalida a
 * declaracao inteira e some em silencio (ops 14, o logotipo do iPad).
 */
export default function SuppliersScreen({ onClose }: { onClose: () => void }) {
  const auth = useAuth();

  useEffect(() => {
    void ensureFreshSession();
  }, []);

  const loggedIn = auth.kind === "ativo" || auth.kind === "sessao-offline";
  if (!loggedIn) return <LoginScreen onClose={onClose} />;

  return <SuppliersBody onClose={onClose} />;
}

function SuppliersBody({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Supplier[]>([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const online = navigator.onLine;

  const load = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("suppliers").select("*").order("name");
      if (data) setItems(data as Supplier[]);
    } catch {
      // Offline ou sem sessao valida: fica com o que ja tem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateItem(id: string, patch: Partial<Supplier>) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const supabase = await getSupabase();
      await supabase.from("suppliers").update(patch).eq("id", id);
    } catch {
      void load();
    }
  }

  async function addItem() {
    if (!newName.trim()) return;
    try {
      const supabase = await getSupabase();
      const { data } = await supabase.from("suppliers").insert({ name: newName.trim() }).select().single();
      if (data) setItems((prev) => [...prev, data as Supplier]);
      setNewName("");
      setAdding(false);
    } catch {
      // Sem rede: nada a fazer, o aviso ja esta na tela.
    }
  }

  const editando = items.find((x) => x.id === editandoId) ?? null;

  return (
    <div className="tela-sobreposta z-20 flex flex-col overflow-y-auto bg-cream-soft">
      <AdminHeader title={t("suppliers.title")} onClose={onClose} />

      {!online && (
        <p className="bg-black/10 px-4 py-2 text-center text-sm text-brand-dark">
          {t("suppliers.needsInternet")}
        </p>
      )}

      {loading && <p className="p-6 text-center text-ink-muted">{t("operation.loading")}</p>}

      {!loading && (
        <div className="flex-1 space-y-3 p-4">
          {items.length === 0 && <EmptyState emoji="🏭" text={t("suppliers.empty")} />}

          {items.length > 0 && (
            <div className="space-y-2.5">
              {items.map((sup) => (
                <FornecedorCard
                  key={sup.id}
                  sup={sup}
                  hint={t("suppliers.productPlaceholder")}
                  onClick={() => setEditandoId(sup.id)}
                />
              ))}
            </div>
          )}

          {adding ? (
            <Card>
              <input
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("suppliers.namePlaceholder")}
                className="w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2"
              />
              <div className="flex gap-2">
                <TileButton emoji="✓" label={t("suppliers.add")} onClick={() => void addItem()} disabled={!newName.trim()} />
                <button
                  onClick={() => setAdding(false)}
                  className="min-h-11 min-w-11 rounded-2xl border border-black/20 px-4"
                >
                  ×
                </button>
              </div>
            </Card>
          ) : (
            <TileButton emoji="➕" label={t("suppliers.add")} variant="dashed" onClick={() => setAdding(true)} disabled={!online} />
          )}
        </div>
      )}

      {editando && (
        /* A folha de edicao. Os campos continuam gravando no `onBlur`, exatamente
           como antes — fechar a folha (no × ou no fundo) tira o foco do campo
           antes do clique fechar, entao o `blur` sempre dispara primeiro e nada
           digitado se perde. Redesenho de casca: nenhuma mudanca de gravacao. */
        <Modal title={editando.name} onClose={() => setEditandoId(null)}>
          {/* O nome NUNCA foi editavel nesta tela — achado (nao regressao) ao
              redesenha-la na Parte 3, e o mesmo buraco que existia em Locais.
              Fechado na Parte 4, com a mesma cabeca nos dois lugares.
              Nome vazio nao grava: `name` e `not null` no banco, e um card sem
              nome seria intocavel. Apagar tudo e recarregar devolve o valor. */}
          <CampoFornecedor
            emoji="🏭"
            label={t("suppliers.namePlaceholder")}
            value={editando.name}
            disabled={!online}
            onChange={(v) => setItems((prev) => prev.map((x) => (x.id === editando.id ? { ...x, name: v } : x)))}
            onCommit={(v) => (v.trim() ? void updateItem(editando.id, { name: v.trim() }) : void load())}
          />
          <CampoFornecedor
            emoji="📦"
            label={t("suppliers.productPlaceholder")}
            value={editando.product ?? ""}
            disabled={!online}
            onChange={(v) => setItems((prev) => prev.map((x) => (x.id === editando.id ? { ...x, product: v } : x)))}
            onCommit={(v) => void updateItem(editando.id, { product: v })}
          />
          <CampoFornecedor
            emoji="📞"
            label={t("suppliers.contactPlaceholder")}
            value={editando.contact ?? ""}
            disabled={!online}
            onChange={(v) => setItems((prev) => prev.map((x) => (x.id === editando.id ? { ...x, contact: v } : x)))}
            onCommit={(v) => void updateItem(editando.id, { contact: v })}
          />
          <CampoFornecedor
            emoji="📝"
            label={t("suppliers.notesPlaceholder")}
            value={editando.notes ?? ""}
            disabled={!online}
            onChange={(v) => setItems((prev) => prev.map((x) => (x.id === editando.id ? { ...x, notes: v } : x)))}
            onCommit={(v) => void updateItem(editando.id, { notes: v })}
          />
          {!online && <p className="text-xs text-ink-muted">{t("suppliers.needsInternet")}</p>}
        </Modal>
      )}
    </div>
  );
}

/**
 * O card fechado. ~66px de altura com o nome numa linha (contra ~290px do
 * card antigo): moldura do desenho 40px + as duas linhas de texto dentro do
 * `py-3`. Alvo de toque folgado acima dos 44px minimos.
 *
 * O nome usa `break-words` e NAO trunca — nome de fornecedor cortado e a
 * mesma familia de defeito do `line-clamp` do checklist (ops 15) e do
 * `AdminHeader` da ops 13. Se ele quebrar em duas linhas o card cresce, que e
 * o comportamento certo. A linha de apoio pode truncar: e resumo, e o valor
 * inteiro esta a um toque de distancia dentro da folha de edicao.
 */
function FornecedorCard({
  sup,
  hint,
  onClick,
}: {
  sup: Supplier;
  hint: string;
  onClick: () => void;
}) {
  const apoio = [sup.product, sup.contact].filter(Boolean).join(" · ");
  return (
    <button
      onClick={onClick}
      className="flex w-full min-h-16 items-center gap-3 rounded-3xl bg-cream px-4 py-3 text-left shadow-lg transition active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-3xl leading-none">
        🏭
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-display text-lg leading-tight text-brand-dark">
          {sup.name}
        </span>
        <span
          className={`mt-0.5 block truncate text-sm leading-tight ${
            apoio ? "text-ink-muted" : "text-ink-muted/60"
          }`}
        >
          {apoio || hint}
        </span>
      </span>
      {sup.notes ? <StatusPill tone="neutral">📝</StatusPill> : null}
      <span className="shrink-0 text-2xl leading-none text-ink-muted">›</span>
    </button>
  );
}

function CampoFornecedor({
  emoji,
  label,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  emoji: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted">
        {emoji} {label}
      </label>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-black/10 bg-cream-soft px-3 py-2 text-sm disabled:opacity-40"
      />
    </div>
  );
}
