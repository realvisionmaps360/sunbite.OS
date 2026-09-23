import { money } from "../config";
import { useLang } from "../i18n";
import { hora, type ResumoDoDia } from "../resumo";
import { Linha, Modal } from "./ui";

/**
 * O resumo do dia, num lugar so (ops 24). Nasceu dentro da tela de Operacao,
 * para responder ao toque em encerrar; a tela Vendas passou a abrir a mesma
 * folha para qualquer dia passado. Duas copias da folha seriam um jeito
 * garantido de um dia elas discordarem.
 *
 * ⚠️ Este arquivo NAO importa "../supabase" nem "../auth": so desenha. Quem
 * le do banco e quem chama. E o que deixa a tela Vendas, que esta no pacote
 * da venda, usa-lo sem arrastar o cliente do Supabase junto.
 */

/** Duracao entre dois instantes, no formato curto da Home ("3h 40min"). */
function duracao(inicio: string | null, fim: string): string | null {
  if (!inicio) return null;
  const min = Math.floor((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 0) return null;
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

/**
 * Copos por hora — o numero que separa ponto bom de ponto ruim (9,0 em 18/09
 * e 9,3 em 06/09, contra 4,0 em 22/08). Nulo quando nao da para dividir: sem
 * hora de inicio, ou um intervalo de menos de cinco minutos, onde a conta
 * viraria um numero enorme sem significado nenhum.
 */
function ritmo(cups: number, inicio: string | null, fim: string): number | null {
  if (!inicio || cups <= 0) return null;
  const horas = (new Date(fim).getTime() - new Date(inicio).getTime()) / 3_600_000;
  if (!Number.isFinite(horas) || horas < 5 / 60) return null;
  const porHora = Math.round((cups / horas) * 10) / 10;
  // ⚠️ Zero arredondado e um numero que mente. Aconteceu no preview com uma
  // operacao esquecida aberta por 599 horas: 5 copos viraram "0 copos/hora",
  // que se le como "nao vendeu nada" em vez de "ficou aberta tempo demais".
  // Melhor nao mostrar a linha do que mostrar esse zero.
  return porHora === 0 ? null : porHora;
}


/**
 * O dia inteiro numa folha so — o que o encerramento passou a responder.
 *
 * Usa o `Modal` de ui.tsx, que ja tem `max-h` e rolagem propria: esta folha
 * passa de 780px com todas as linhas, e a folha do local ja tinha ensinado
 * que sem isso o titulo sai cortado em 360x780.
 */
export function FolhaDoResumo({ resumo, onClose }: { resumo: ResumoDoDia; onClose: () => void }) {
  const { t } = useLang();
  const tempo = duracao(resumo.inicio, resumo.fim);
  const copasPorHora = ritmo(resumo.cups, resumo.inicio, resumo.fim);
  return (
    <Modal
      title={resumo.data ? t("summary.dayTitle", { date: dataLonga(resumo.data) }) : t("summary.title")}
      onClose={onClose}
    >
      <p className="font-display text-lg tabular-nums">
        {t("summary.period", { start: hora(resumo.inicio), end: hora(resumo.fim) })}
      </p>
      {resumo.inicioEstimado && (
        <p className="text-xs text-ink-muted">{t("summary.paceEstimated")}</p>
      )}
      {resumo.fimEstimado && (
        <p className="text-xs text-ink-muted">{t("summary.endEstimated")}</p>
      )}

      <div className="space-y-1 pt-1">
        {tempo && <Linha label={t("summary.duration")} value={tempo} />}
        {resumo.placeName && <Linha label={t("summary.place")} value={resumo.placeName} />}
        {resumo.eventName && <Linha label={t("summary.event")} value={resumo.eventName} />}
        <Linha label={t("summary.cups")} value={String(resumo.cups)} />
        <Linha label={t("summary.sales")} value={String(resumo.vendas)} />
        {copasPorHora !== null && (
          <Linha
            label={t("summary.pace")}
            value={t("summary.paceValue", { n: copasPorHora })}
          />
        )}
      </div>

      <div className="space-y-1 border-t border-black/10 pt-2">
        <Linha label={t("summary.revenue")} value={money(resumo.revenue)} />
        <Linha label={t("summary.cash")} value={money(resumo.cash)} />
        <Linha label={t("summary.twint")} value={money(resumo.twint)} />
        {resumo.tips > 0 && <Linha label={t("summary.tips")} value={money(resumo.tips)} />}
      </div>

      {resumo.expected && (
        <div className="space-y-1 border-t border-black/10 pt-2">
          <Linha label={t("close.expected")} value={money(resumo.expected.expected)} />
          <Linha
            label={t("close.counted")}
            value={resumo.counted === null ? "—" : money(resumo.counted)}
          />
          <Linha
            label={t("close.difference")}
            value={resumo.diff === null ? "—" : money(resumo.diff)}
            destaque={resumo.diff !== null && resumo.diff !== 0}
          />
          {resumo.reason && (
            <p className="text-xs text-ink-muted break-words">
              {t("summary.reason")}: {resumo.reason}
            </p>
          )}
        </div>
      )}

      {/* Os avisos ficam por ultimo e sao informativos: dizem o que este dia
          tem de torto, sem tentar consertar nada por conta propria. */}
      {(resumo.semAbertura || resumo.semOperacao || resumo.soLocal || resumo.orfas > 0 || !resumo.online) && (
        <div className="space-y-1 border-t border-black/10 pt-2">
          {resumo.soLocal && (
            <p className="text-sm font-semibold text-red-800 break-words">
              {t("summary.localOnly")}
            </p>
          )}
          {resumo.semOperacao && (
            <p className="text-sm font-semibold text-red-800 break-words">
              {t("summary.noOperation")}
            </p>
          )}
          {resumo.semAbertura && !resumo.semOperacao && (
            <p className="text-sm font-semibold text-red-800 break-words">
              {t("summary.noOpening")}
            </p>
          )}
          {resumo.orfas > 0 && (
            <p className="text-sm font-semibold text-red-800 break-words">
              {t("summary.orphanSales", { n: resumo.orfas })}
            </p>
          )}
          {!resumo.online && (
            <p className="text-sm text-ink-muted break-words">{t("summary.offline")}</p>
          )}
        </div>
      )}

      <button
        onClick={onClose}
        className="min-h-[44px] w-full rounded-2xl bg-brand py-3 font-semibold text-cream"
      >
        {t("summary.close")}
      </button>
    </Modal>
  );
}

/** "2026-09-18" -> "18.09.2026". Sem Date: fuso nenhum mexe na data. */
function dataLonga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}.${m}.${a}`;
}
