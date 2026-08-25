/**
 * Reconhecimento de voz do proprio aparelho (Etapa 9).
 *
 * Decisao do Felipe, 25/08: usar o que o celular ja tem, em vez de mandar
 * audio para transcrever no servidor. Custo zero, resposta instantanea, e
 * nao depende de mais nenhuma chave.
 *
 * A transcricao NUNCA e enviada direto para a IA: ela cai no campo de texto
 * da tela, editavel, e o Felipe confere antes de mandar. Portugues misturado
 * com nome de produto em alemao erra, e corrigir uma palavra e mais rapido
 * do que refazer a frase inteira.
 *
 * Este arquivo nao importa nada do app — e so um envelope em volta de uma
 * API do navegador que a lib padrao do TypeScript ainda nao tipa.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getConstructor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * O botao de gravar so aparece se isto for true. Nao ha plano B nesta etapa:
 * sem suporte, o campo de digitar continua funcionando normalmente.
 */
export function voiceSupported(): boolean {
  return getConstructor() !== null;
}

export interface VoiceSession {
  stop: () => void;
}

/**
 * Comeca a escutar. `onText` recebe a transcricao acumulada a cada trecho
 * reconhecido (inclusive os parciais, para a pessoa ver que esta funcionando).
 * `onDone` dispara quando o reconhecimento termina, por qualquer motivo.
 */
export function startListening(opts: {
  lang: string;
  onText: (text: string, isFinal: boolean) => void;
  onDone: (error?: string) => void;
}): VoiceSession | null {
  const Ctor = getConstructor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = opts.lang;
  // continuous: a frase do fim da noite e longa e tem pausas para pensar.
  rec.continuous = true;
  rec.interimResults = true;

  // O evento traz TODOS os trechos desde o inicio, nao so o novo — por isso
  // remonta a frase inteira a cada disparo em vez de concatenar.
  let finalText = "";

  rec.onresult = (e: any) => {
    let interim = "";
    finalText = "";
    for (let i = 0; i < e.results.length; i++) {
      const chunk = e.results[i][0]?.transcript ?? "";
      if (e.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    opts.onText((finalText + interim).trim(), interim === "");
  };

  rec.onerror = (e: any) => {
    // "aborted" e "no-speech" acontecem no uso normal (parar sem falar) —
    // nao sao erro para mostrar na tela.
    const code = e?.error ?? "unknown";
    opts.onDone(code === "aborted" || code === "no-speech" ? undefined : code);
  };

  rec.onend = () => opts.onDone();

  try {
    rec.start();
  } catch {
    return null;
  }

  return { stop: () => rec.stop() };
}
