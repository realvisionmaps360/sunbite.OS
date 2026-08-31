import type { Place, SunbiteEvent } from "./types";

/**
 * As contas de Locais e Eventos que não dependem de tela nem de rede.
 *
 * Módulo **puro de propósito**, na mesma família de `cashbox.ts`: não importa
 * `./supabase` nem `./auth`, então é seguro importar de qualquer lugar sem
 * arrastar peso para o caminho da venda.
 *
 * Nasceu na ops 15 Parte 4 porque `googleCalendarUrl` morava dentro de
 * `OperationScreen.tsx` e a tela de Eventos precisava da mesma URL — duas
 * cópias da mesma montagem é jeito garantido de um dia elas discordarem.
 */

/* ------------------------------------------------------------------ */
/* Posição no mapa                                                     */
/* ------------------------------------------------------------------ */

export interface Coords {
  lat: number;
  lng: number;
}

/** Berna fica em 46.9/7.4; nenhuma coordenada real passa destes limites. */
function coordsValidas(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/**
 * Tira latitude e longitude de um link do Google Maps.
 *
 * O Maps produz três formatos, e o Felipe pode colar qualquer um deles:
 *   1. `...!3d46.947974!4d7.444608`        — o link de dentro de um resultado
 *   2. `...?q=46.947974,7.444608`          — o link de "compartilhar → copiar"
 *   3. `.../@46.947974,7.444608,17z/...`  — o link da barra de endereço
 *
 * ⚠️ A ordem importa, e ela custou um erro em teste: o link de um resultado
 * carrega **os dois** — `@` é onde a câmera está e `!3d!4d` é onde o pino
 * está. Tentando `@` primeiro, `/place/Bern/@46.9,7.4,12z/...!3d46.947974`
 * devolvia o centro do mapa, a 6km do local. O pino vem primeiro.
 *
 * ⚠️ O link curto `maps.app.goo.gl/xxxx` **não carrega coordenada nenhuma** —
 * ela só existe depois que o servidor do Google redireciona, e seguir esse
 * redirecionamento daqui exigiria rede e passaria por CORS. Nesse caso a
 * função devolve `null` e quem chama diz isso na tela, em vez de fingir que
 * a posição veio junto.
 */
export function coordsDeMapsUrl(url: string): Coords | null {
  const texto = url.trim();
  if (!texto) return null;

  const padroes = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, //        1. o pino do resultado
    /[?&](?:q|ll|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // 2. ?q=lat,lng
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, //            3. o centro do mapa
  ];

  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (!achado) continue;
    const lat = Number(achado[1]);
    const lng = Number(achado[2]);
    if (coordsValidas(lat, lng)) return { lat, lng };
  }

  // Coordenada colada crua ("46.947974, 7.444608"), que é o que sai quando se
  // toca e segura um ponto no Maps do celular.
  const cru = texto.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (cru) {
    const lat = Number(cru[1]);
    const lng = Number(cru[2]);
    if (coordsValidas(lat, lng)) return { lat, lng };
  }

  return null;
}

/** O link que abre o Maps naquele ponto exato, em qualquer aparelho. */
export function mapsUrlDeCoords({ lat, lng }: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Como a posição aparece escrita na tela: cinco casas bastam para uma feira. */
export function formatarCoords({ lat, lng }: Coords): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * O melhor link de mapa que existe para um local: o que o Felipe colou, ou
 * um montado a partir da posição, ou uma busca pelo endereço escrito.
 */
export function linkDoMapa(place: Place): string | null {
  if (place.maps_url) return place.maps_url;
  if (place.lat !== null && place.lng !== null)
    return mapsUrlDeCoords({ lat: place.lat, lng: place.lng });
  const escrito = [place.address, place.city].filter(Boolean).join(", ");
  if (escrito) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(escrito)}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Google Calendar                                                     */
/* ------------------------------------------------------------------ */

/** yyyymmddThhmmssZ, como o Google Calendar exige na URL de "adicionar evento". */
function toGCalStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * URL padrao do Google Calendar (acao=TEMPLATE) — sem lib nova, sem OAuth,
 * sem servidor guardando acesso. Duracao fixa de 3h porque o schema nao
 * guarda hora de termino do evento.
 */
export function googleCalendarUrl(
  ev: SunbiteEvent,
  lang: "pt" | "de",
  place: Place | null,
): string {
  const title = (lang === "de" ? ev.label_de : ev.label_en) || place?.name || "Sunbite";
  const start = new Date(ev.starts_at);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Sunbite — ${title}`,
    dates: `${toGCalStamp(start.toISOString())}/${toGCalStamp(end.toISOString())}`,
  });
  if (place?.name) params.set("location", place.city ? `${place.name}, ${place.city}` : place.name);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Data e hora                                                         */
/* ------------------------------------------------------------------ */

/**
 * ISO → o valor que um `<input type="datetime-local">` aceita, no fuso do
 * aparelho. `toISOString()` não serve: ele volta para UTC e o evento das 9h
 * aparece como 7h no campo.
 */
export function paraCampoDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
