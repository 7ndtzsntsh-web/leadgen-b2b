export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { expandSearchTerm } from '@/lib/semanticDictionary';
import { resolveLocations, type SearchLocation } from '@/lib/locations';
import { inspectWebsite } from '@/lib/domainValidator';
import { AsyncQueue, runPool } from '@/lib/async';
import { acquireSlot, guardApi } from '@/lib/apiGuard';
import { normalizeText } from '@/lib/text';
import { NO_PHONE, cleanPhone, getPhoneType, matchesSiteFilters, pickWhatsApp, scoreLead, type SiteStatus } from '@/lib/leadRules';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACES_URL = process.env.PLACES_API_URL || 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.primaryType',
  'places.primaryTypeDisplayName', 'places.businessStatus', 'nextPageToken',
].join(',');

const COUNTRIES = ['br', 'pt', 'us', 'es'];
const LANGUAGE: Record<string, string> = { br: 'pt-BR', pt: 'pt-PT', us: 'en', es: 'es' };
const REGION: Record<string, string> = { br: 'BR', pt: 'PT', us: 'US', es: 'ES' };

const MAX_VOLUME = 300;
const MAX_INPUT_LENGTH = 100;     // nicho e cidade: limita o tamanho do que vira consulta paga ao Google
const SEARCH_LIMIT = 20;          // buscas por visitante (IP) ...
const SEARCH_WINDOW_MS = 10 * 60_000; // ... a cada 10 minutos
const MAX_CONCURRENT_SEARCHES = 2;    // buscas simultâneas por visitante
const FETCH_CONCURRENCY = 6;      // consultas simultâneas ao Google
const VALIDATE_CONCURRENCY = 12;  // sites verificados ao mesmo tempo
const MAX_PAGES = 3;              // o Google entrega até 3 páginas (60 resultados) por consulta
const DRY_STREAK_LIMIT = 6;       // para de varrer zonas quando N consultas seguidas não trazem nenhum lugar novo
const HEARTBEAT_MS = 10_000;      // evita que a conexão SSE seja derrubada por inatividade (comum em rede móvel)
const SOFT_DEADLINE_MS = 270_000; // encerra com resumo antes do limite da plataforma (300s)

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
}
interface GoogleResponse { places?: GooglePlace[]; nextPageToken?: string }
interface NominatimPlace { osm_id: number; name?: string; type?: string; display_name: string; extratags?: Record<string, string> }

interface RawLead {
  id: string;
  name: string;
  category: string;
  phone: string;
  address: string;
  rating: number;
  reviewsCount: number;
  reviewsKnown: boolean;
  website?: string;
  /** WhatsApp já conhecido na coleta (ex.: tag do OpenStreetMap). O do site é somado na validação. */
  whatsapp?: string;
  /** UF da localidade pesquisada, usada para validar o DDD do WhatsApp achado no site. */
  uf?: string;
  isExpansion: boolean;
  expansionSource: string;
}

interface MiningContext {
  volume: number;
  country: string;
  onlyNoSite: boolean;
  onlyInsecure: boolean;
  seenIds: Set<string>;
  seenPhones: Set<string>;
  nameCounts: Map<string, number>;
  streamed: number;
  fatal: string | null;
  googleWorked: boolean;
  isDone: () => boolean;
  send: (data: unknown) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Registra um lugar novo e o enfileira para validação. Retorna true se o lugar ainda não tinha sido visto.
 * Descarta duplicados, telefones repetidos, negócios fechados e redes/franquias (mesmo nome 3+ vezes:
 * não compram site do dono local, e ocupavam a meta).
 */
function acceptPlace(ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, raw: RawLead, closed: boolean): boolean {
  if (ctx.seenIds.has(raw.id)) return false;
  ctx.seenIds.add(raw.id);
  if (closed) return true;

  const nameKey = normalizeText(raw.name).split(/\s[-–|]\s/)[0].replace(/[^a-z0-9]/g, '');
  const occurrences = (ctx.nameCounts.get(nameKey) ?? 0) + 1;
  ctx.nameCounts.set(nameKey, occurrences);
  if (nameKey.length > 3 && occurrences > 2) return true;

  if (raw.phone !== NO_PHONE) {
    if (ctx.seenPhones.has(raw.phone)) return true;
    ctx.seenPhones.add(raw.phone);
  }

  queue.push({ ...raw, isExpansion: loc.isExpansion, expansionSource: loc.city, uf: loc.uf });
  return true;
}

/** Verifica o site, aplica os filtros, pontua e envia o lead. */
async function processLead(ctx: MiningContext, raw: RawLead): Promise<void> {
  if (ctx.isDone()) return;
  if (!raw.website && raw.phone === NO_PHONE && !raw.whatsapp) return; // sem nenhum canal de contato

  let siteStatus: SiteStatus = 'Sem Site';
  let email = 'N/D';
  let whatsapp = raw.whatsapp;
  if (raw.website) {
    const inspection = await inspectWebsite(raw.website);
    siteStatus = inspection.status;
    email = inspection.email;
    // O WhatsApp do próprio site/perfil da empresa tem prioridade sobre o telefone (pode ser fixo).
    whatsapp = pickWhatsApp(inspection.whatsapp, ctx.country, raw.uf) ?? whatsapp;
  }

  // Depois de cada await a meta pode já ter sido atingida por outro lead.
  if (ctx.isDone()) return;
  if (raw.phone === NO_PHONE && email === 'N/D' && !whatsapp) return;
  if (!matchesSiteFilters(siteStatus, ctx.onlyNoSite, ctx.onlyInsecure)) return;

  const phoneType = getPhoneType(raw.phone, ctx.country);
  const score = scoreLead({
    siteStatus,
    rating: raw.rating,
    reviewsCount: raw.reviewsCount,
    reviewsKnown: raw.reviewsKnown,
    // Com WhatsApp confirmado, o lead é alcançável pelo canal principal mesmo que o telefone seja fixo.
    phoneType: whatsapp ? 'MOBILE' : phoneType,
    hasPhone: raw.phone !== NO_PHONE || !!whatsapp,
    hasEmail: email !== 'N/D',
  });

  ctx.streamed++;
  ctx.send({
    type: 'lead',
    data: {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      phone: raw.phone,
      address: raw.address,
      rating: raw.rating,
      reviewsCount: raw.reviewsCount,
      website: raw.website,
      isExpansion: raw.isExpansion,
      expansionSource: raw.expansionSource,
      siteStatus,
      email,
      phoneType,
      whatsapp,
      score,
    },
  });
}

// ---------------------------------------------------------------------------
// Coleta: Google Places
// ---------------------------------------------------------------------------

async function fetchGooglePage(ctx: MiningContext, body: Record<string, unknown>): Promise<GoogleResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_API_KEY!, 'X-Goog-FieldMask': PLACES_FIELDS },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      ctx.googleWorked = true;
      return (await res.json()) as GoogleResponse;
    }
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      await sleep(800);
      continue;
    }
    console.error('Google API Error:', res.status, await res.text().catch(() => ''));
    if (res.status === 401 || res.status === 403 || (res.status === 400 && !ctx.googleWorked)) {
      ctx.fatal = 'Erro na API do Google Maps: verifique a chave (GOOGLE_MAPS_API_KEY), o billing e as cotas.';
    }
    return null;
  }
  return null;
}

async function collectFromGoogle(ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, terms: string[]): Promise<void> {
  const collectZone = async (term: string, zone: string): Promise<number> => {
    let pageToken: string | undefined;
    let added = 0;
    for (let page = 0; page < MAX_PAGES && !ctx.isDone() && !ctx.fatal; page++) {
      const data = await fetchGooglePage(ctx, {
        textQuery: `${term} ${zone}`.trim(),
        pageSize: 20,
        pageToken,
        languageCode: LANGUAGE[ctx.country],
        regionCode: REGION[ctx.country],
      });
      if (!data) break;

      for (const p of data.places ?? []) {
        const closed = !!p.businessStatus && p.businessStatus !== 'OPERATIONAL';
        const isNew = acceptPlace(ctx, queue, loc, {
          id: p.id,
          name: p.displayName?.text || 'Desconhecido',
          category: p.primaryTypeDisplayName?.text || (p.primaryType || term).replace(/_/g, ' '),
          phone: cleanPhone(p.nationalPhoneNumber || NO_PHONE, ctx.country, loc.uf),
          address: p.formattedAddress || zone,
          rating: p.rating || 0,
          reviewsCount: p.userRatingCount || 0,
          reviewsKnown: true,
          website: p.websiteUri,
          isExpansion: loc.isExpansion,
          expansionSource: loc.city,
        }, closed);
        if (isNew) added++;
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return added;
  };

  // Termo a termo (o digitado pelo usuário vem primeiro); dentro de cada termo, as zonas em paralelo.
  for (const term of terms) {
    if (ctx.isDone() || ctx.fatal) break;
    let dryStreak = 0;
    await runPool(loc.queries, FETCH_CONCURRENCY, async (zone) => {
      if (dryStreak >= DRY_STREAK_LIMIT) return;
      const added = await collectZone(term, zone);
      dryStreak = added === 0 ? dryStreak + 1 : 0;
    }, () => ctx.isDone() || !!ctx.fatal);
  }
}

// ---------------------------------------------------------------------------
// Coleta: OpenStreetMap / Nominatim (fallback sem chave do Google; sem avaliações reais)
// ---------------------------------------------------------------------------

async function collectFromNominatim(ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, terms: string[]): Promise<void> {
  // O Nominatim aceita só 1 consulta por segundo e não entende "Zona Norte, Cidade": só a cidade inteira (1ª consulta)
  // traz resultados. Repetir cada termo em várias zonas só multiplicava a espera (20 s+ por cidade pequena).
  for (const zone of loc.queries.slice(0, 1)) {
    for (const term of terms) {
      if (ctx.isDone()) return;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${term} ${zone}`.trim())}&format=json&addressdetails=1&extratags=1&limit=20`,
          { headers: { 'User-Agent': 'LeadGenPro-B2B-App/5.0' } }
        );
        if (res.ok) {
          const data = (await res.json()) as NominatimPlace[];
          for (const p of data) {
            const tags = p.extratags || {};
            const rawPhone = tags.phone || tags['contact:phone'] || NO_PHONE;
            const name = p.name || tags.brand;
            if (!name) continue;
            const whatsapp = tags['contact:whatsapp'] ? pickWhatsApp([tags['contact:whatsapp']], ctx.country, loc.uf) : undefined;
            acceptPlace(ctx, queue, loc, {
              id: String(p.osm_id),
              name,
              category: (p.type || term).replace(/_/g, ' '),
              phone: cleanPhone(rawPhone, ctx.country, loc.uf),
              address: p.display_name,
              rating: 0,
              reviewsCount: 0,
              reviewsKnown: false,
              website: tags.website || tags['contact:website'] || tags.url,
              whatsapp,
              isExpansion: loc.isExpansion,
              expansionSource: loc.city,
            }, false);
          }
        }
      } catch (error) {
        console.error('Nominatim error:', error);
      }
      await sleep(1000); // limite de uso do Nominatim
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Aviso que a tela mostra normalmente (evento `error` do stream), em vez de um erro de conexão genérico. */
function streamNotice(message: string, retryAfterSec?: number): Response {
  return new Response(`data: ${JSON.stringify({ type: 'error', message })}\n\n`, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      ...(retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : {}),
    },
  });
}

export async function GET(req: NextRequest) {
  // Só o próprio site pode chamar (em produção) e há limite por visitante: cada busca gasta a cota paga do Google.
  const guard = guardApi(req, 'search', SEARCH_LIMIT, SEARCH_WINDOW_MS);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return new Response('Acesso negado', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return streamNotice(`Muitas buscas em pouco tempo. Tente novamente em ${Math.ceil(guard.retryAfterSec / 60)} min.`, guard.retryAfterSec);
  }

  const params = req.nextUrl.searchParams;
  const term = (params.get('category') || '').trim().slice(0, MAX_INPUT_LENGTH);
  if (!term) return new Response('Parâmetro category é obrigatório', { status: 400 });
  const rawCity = (params.get('city') || '').slice(0, MAX_INPUT_LENGTH);

  const requestedCountry = params.get('country') || 'br';
  const country = COUNTRIES.includes(requestedCountry) ? requestedCountry : 'br';
  const requestedVolume = parseInt(params.get('volume') || '50', 10);
  const volume = Math.min(Math.max(Number.isFinite(requestedVolume) ? requestedVolume : 50, 1), MAX_VOLUME);
  const onlyNoSite = params.get('noSite') === 'true';
  const onlyInsecure = params.get('insecure') === 'true';

  const releaseSlot = acquireSlot(req, 'search', MAX_CONCURRENT_SEARCHES);
  if (!releaseSlot) return streamNotice('Você já tem buscas em andamento. Aguarde terminar ou interrompa uma delas.');

  const terms = expandSearchTerm(term, country);
  const locations = resolveLocations(rawCity, country);

  const encoder = new TextEncoder();
  let cancelled = false;
  req.signal.addEventListener('abort', () => { cancelled = true; });

  const stream = new ReadableStream({
    async start(controller) {
      const write = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { cancelled = true; }
      };
      const deadline = Date.now() + SOFT_DEADLINE_MS;
      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

      const ctx: MiningContext = {
        volume, country, onlyNoSite, onlyInsecure,
        seenIds: new Set(), seenPhones: new Set(), nameCounts: new Map(),
        streamed: 0, fatal: null, googleWorked: false,
        // Quando o usuário fecha a página/toca em "parar", a mineração para e não gasta mais chamadas à API.
        isDone: () => cancelled || ctx.streamed >= volume || Date.now() > deadline,
        send: (data) => write(`data: ${JSON.stringify(data)}\n\n`),
      };

      try {
        ctx.send({ type: 'info', message: `Meta de ${volume} leads para "${terms[0]}"...` });

        for (const loc of locations) {
          if (ctx.isDone() || ctx.fatal) break;
          ctx.send({
            type: 'info',
            message: loc.isExpansion
              ? `Meta ainda não atingida (${ctx.streamed}/${volume}). Expandindo para ${loc.city}...`
              : `Buscando em ${loc.city}...`,
          });

          // Coleta e validação rodam ao mesmo tempo: cada lugar encontrado já entra na fila de verificação.
          const queue = new AsyncQueue<RawLead>();
          const validators = Array.from({ length: VALIDATE_CONCURRENCY }, async () => {
            for (;;) {
              const raw = await queue.next();
              if (!raw) return;
              if (ctx.isDone()) continue;
              try { await processLead(ctx, raw); } catch (error) { console.error('Lead error:', error); }
            }
          });

          try {
            if (GOOGLE_API_KEY) await collectFromGoogle(ctx, queue, loc, terms);
            else await collectFromNominatim(ctx, queue, loc, terms);
          } finally {
            queue.close();
          }
          await Promise.all(validators);
        }

        if (ctx.fatal) {
          ctx.send({ type: 'error', message: ctx.fatal });
        } else if (!cancelled) {
          if (ctx.streamed >= volume) {
            ctx.send({ type: 'done', message: `🎯 Meta alcançada! ${ctx.streamed} leads capturados.` });
          } else if (Date.now() > deadline) {
            ctx.send({ type: 'done', message: `Tempo máximo da busca atingido. ${ctx.streamed} leads capturados.` });
          } else {
            const hint = ctx.streamed === 0 && (onlyNoSite || onlyInsecure)
              ? ' Tente desmarcar os filtros ou usar um nicho mais genérico.'
              : '';
            ctx.send({ type: 'done', message: `Varredura concluída: ${ctx.streamed} leads qualificados encontrados.${hint}` });
          }
        }
      } catch (error) {
        console.error('SSE Error:', error);
        ctx.send({ type: 'error', message: 'Ocorreu um erro na mineração.' });
      } finally {
        clearInterval(heartbeat);
        releaseSlot();
        try { controller.close(); } catch { /* já encerrado pelo cliente */ }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
