export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { expandSearchTerm, placeTypeTerms } from '@/lib/semanticDictionary';
import { resolveLocations, type SearchLocation } from '@/lib/locations';
import { getHostname, inspectWebsite, isSocialHost, type SiteInspection } from '@/lib/domainValidator';
import { AsyncQueue, runPool } from '@/lib/async';
import { acquireSlot, guardApi } from '@/lib/apiGuard';
import { normalizeText } from '@/lib/text';
import { areaKey, checkAddress, type AddressCheck, type SearchedArea, type StructuredAddress } from '@/lib/address';
import { checkEmailDomain, fixEmailTypo, isAccountantEmail } from '@/lib/emailCheck';
import { candidateDomains, findOwnWebsite, siteFromEmail } from '@/lib/siteFinder';
import { CNPJ_UFS, loadCompanies, nicheFilter, type NicheFilter } from '@/lib/cnpjSource';
import { US_STATES, loadUsCompanies, usAreaCodeState, usNicheFilter, type UsNicheFilter } from '@/lib/usSource';
import { US_STATE_NAMES } from '@/lib/usCities';
import { UF_NAMES } from '@/lib/ufData';
import { OVERTURE_FRESH_YEARS, OVERTURE_SURE, RECEITA_PHONE_FRESH_YEARS, buildChecks, isOwnSiteLive, isVerified, yearsSince, type PhoneOrigin, type WhatsAppOrigin } from '@/lib/verification';
import {
  NO_PHONE, cleanPhone, cleanPhones, getPhoneType, matchesSiteFilters, pickWhatsApp, sameNumber, scoreLead, splitPhones,
  type SiteStatus,
} from '@/lib/leadRules';

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

// OpenStreetMap (fonte gratuita, sem chave)
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSM_API_URL = 'https://api.openstreetmap.org/api/0.6';
const OSM_HEADERS = { 'User-Agent': 'LeadGenPro-B2B-App/5.0' };
const NOMINATIM_PAGE = 40;        // máximo que o Nominatim devolve por consulta
const NOMINATIM_MAX_PAGES = 3;    // páginas por tipo de negócio dentro da cidade
const OSM_API_TIMEOUT_MS = 8000;
// Categorias do OpenStreetMap que são negócios (o resto é rua, bairro, rio, limite de cidade...).
const BUSINESS_CATEGORIES = new Set(['amenity', 'shop', 'craft', 'office', 'leisure', 'tourism', 'healthcare', 'club', 'man_made']);
// Cadastro sem nenhuma atualização há tantos anos, e sem site no ar: provavelmente fechou. Não é mostrado.
const STALE_DROP_YEARS = 8;
// A partir daqui o lead aparece com aviso de dados antigos.
const STALE_WARN_YEARS = 5;
// De onde vem o telefone listado, antes de conferir no site da empresa.
const LISTED_ORIGIN: Record<RawLead['source'], PhoneOrigin> = { google: 'google', cnpj: 'receita', overture: 'overture', osm: 'cadastro' };

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
interface NominatimPlace {
  place_id: number;
  osm_type?: string;
  osm_id: number;
  category?: string;
  type?: string;
  name?: string;
  display_name: string;
  boundingbox?: string[];
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

interface RawLead {
  id: string;
  /** cnpj = cadastro da Receita Federal (dados abertos); overture = Overture Maps (EUA). */
  source: 'google' | 'osm' | 'cnpj' | 'overture';
  /** Overture: confiança de que o lugar existe (0 a 100) e mês da última atualização da ficha (AAAA-MM). */
  confidence?: number;
  listingUpdated?: string;
  /** E-mail do cadastro da Receita (os de contador já saem na importação). */
  email?: string;
  cnpj?: string;
  /** Data de abertura na Receita (AAAA-MM-DD). */
  openedOn?: string;
  name: string;
  category: string;
  /** Telefone principal (o celular, quando há: é o canal da abordagem). */
  phone: string;
  /** Outros números válidos da empresa (ex.: o fixo). */
  otherPhones?: string[];
  address: string;
  /** Cidade/UF em campos separados, quando a fonte informa (OpenStreetMap). Confere a cidade melhor que o texto. */
  place?: StructuredAddress;
  rating: number;
  reviewsCount: number;
  reviewsKnown: boolean;
  website?: string;
  /** WhatsApp já conhecido na coleta (ex.: tag do OpenStreetMap). O do site é somado na validação. */
  whatsapp?: string;
  /** UF da localidade pesquisada, usada para validar o DDD do WhatsApp achado no site. */
  uf?: string;
  /** A fonte informou que a empresa está em funcionamento (Google: businessStatus = OPERATIONAL). */
  activeConfirmed: boolean;
  /** Última atualização do cadastro no OpenStreetMap (data ISO). */
  lastEdit?: string;
  /** Última conferência no local por um colaborador do mapa (check_date, data ISO). */
  checkedOn?: string;
  /** Busca por região inteira: não há cidade específica para conferir com o endereço. */
  scope?: 'city' | 'region';
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
  /** Cidades e estados que esta busca cobre, para conferir o endereço de cada lead. */
  area: SearchedArea;
  /** Endereço do próprio site, para ler os arquivos do cadastro da Receita (public/cnpj). */
  origin: string;
  /** Nomes já vindos da Receita: o mesmo lugar no mapa é repetido e fica de fora. */
  knownNames: Set<string>;
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
  if (closed || raw.name === 'Desconhecido') return true; // fechado, ou cadastro sem nome (não dá para abordar)

  const nameKey = normalizeText(raw.name).split(/\s[-–|]\s/)[0].replace(/[^a-z0-9]/g, '');
  // A Receita vem primeiro e é a fonte mais completa: o mesmo negócio achado depois no mapa é repetição, e o
  // mesmo nome com outro CNPJ (matriz e filial) também — apareciam duas "Cia Sucos".
  // Por cidade: "Padaria Pão Quente" em Florianópolis e em São José são empresas diferentes.
  const cityNameKey = `${normalizeText(loc.city)}|${nameKey}`;
  if (ctx.knownNames.has(cityNameKey)) return true;
  if (raw.source === 'cnpj' || raw.source === 'overture') ctx.knownNames.add(cityNameKey);
  const occurrences = (ctx.nameCounts.get(nameKey) ?? 0) + 1;
  ctx.nameCounts.set(nameKey, occurrences);
  if (nameKey.length > 3 && occurrences > 2) return true;

  if (raw.phone !== NO_PHONE) {
    if (ctx.seenPhones.has(raw.phone)) return true;
    ctx.seenPhones.add(raw.phone);
  }

  queue.push({ ...raw, isExpansion: loc.isExpansion, expansionSource: loc.city, uf: loc.uf, scope: loc.scope ?? 'city' });
  return true;
}

/** Cidades/estados cobertos pela busca (pedida + expansões), para conferir o endereço de cada lead. */
function buildSearchedArea(locations: SearchLocation[]): SearchedArea {
  const area: SearchedArea = { cities: new Set(), ufs: new Set(), names: [] };
  for (const loc of locations) {
    if (loc.scope === 'region') continue;
    if (loc.uf) {
      area.cities.add(areaKey(loc.city, loc.uf));
      area.ufs.add(loc.uf);
    }
    area.names.push(normalizeText(loc.city));
  }
  return area;
}

/** Verifica o site, aplica os filtros, pontua e envia o lead. */
async function processLead(ctx: MiningContext, raw: RawLead): Promise<void> {
  if (ctx.isDone()) return;
  // Sem nenhum canal de contato. (Só e-mail ainda serve aqui: o domínio do e-mail pode levar ao site, e o site ao
  // telefone. No fim, lead sem telefone é descartado.)
  if (!raw.website && raw.phone === NO_PHONE && !raw.whatsapp && !raw.email) return;

  // Confere o endereço ANTES de gastar tempo no site: resultado de outro estado é descartado, e a cidade real
  // do endereço é a que vai no texto de abordagem (não a cidade pesquisada).
  let addressCheck: AddressCheck | null = null;
  if (raw.scope !== 'region' && ctx.area.names.length > 0) {
    addressCheck = checkAddress(raw.address, ctx.area, raw.place);
    if (addressCheck.status === 'wrong-state') return;
  }

  const listedPhones = [raw.phone, ...(raw.otherPhones ?? [])].filter((p) => p !== NO_PHONE);

  // Sem site no cadastro (ou só rede social/diretório, que o cadastro pode ter no lugar do site): procura pelo nome
  // (padariaxyz.com.br), aceitando só o que for comprovadamente da empresa. Achando, o site próprio vale; senão, a
  // rede social continua.
  let website = raw.website;
  let siteFound: string | undefined;
  let siteFoundVia: 'email' | 'nome' | undefined;
  let siteSearched: string[] | undefined;
  const listedHost = website ? getHostname(website) : undefined;
  if ((!website || (listedHost && isSocialHost(listedHost))) && raw.source !== 'google') {
    const city = addressCheck && 'city' in addressCheck && addressCheck.city ? addressCheck.city : raw.expansionSource;
    const clues = { phones: listedPhones, city, country: ctx.country };
    // Primeiro o domínio do e-mail da empresa (contato@padariaxyz.com.br), depois o nome.
    const fromEmail = raw.email ? await siteFromEmail(raw.email, raw.name, clues) : undefined;
    siteFound = fromEmail ?? (await findOwnWebsite(raw.name, clues));
    siteFoundVia = fromEmail ? 'email' : 'nome';
    if (siteFound) website = siteFound;
    else siteSearched = candidateDomains(raw.name, ctx.country).candidates.map((c) => c.host);
  }

  let siteStatus: SiteStatus = 'Sem Site';
  let email = 'N/D';
  let inspection: SiteInspection | undefined;
  if (website) {
    inspection = await inspectWebsite(website);
    siteStatus = inspection.status;
    email = inspection.email;
  }
  if (email === 'N/D' && raw.email) email = raw.email; // o e-mail do site tem preferência sobre o da Receita
  const siteLive = isOwnSiteLive(siteStatus);

  // Telefone: o site da própria empresa é a fonte mais atual. Número do cadastro que aparece no site = confirmado;
  // se o site mostra OUTRO número, vale o do site (era de onde vinham os "números errados").
  let phone = raw.phone;
  let otherPhones = raw.otherPhones ?? [];
  let phoneOrigin: PhoneOrigin = LISTED_ORIGIN[raw.source];
  let phoneReplaced = false;
  const sitePhones = siteLive && inspection ? cleanPhones(inspection.phones, ctx.country, raw.uf) : [];
  if (sitePhones.length > 0) {
    if (listedPhones.some((p) => sitePhones.some((s) => sameNumber(s, p)))) {
      phoneOrigin = 'confirmado';
    } else if (raw.source !== 'google') {
      phone = sitePhones.find((s) => getPhoneType(s, ctx.country) === 'MOBILE') ?? sitePhones[0];
      otherPhones = sitePhones.filter((s) => !sameNumber(s, phone)).slice(0, 2);
      phoneOrigin = 'site';
      phoneReplaced = listedPhones.length > 0;
    }
  }

  // WhatsApp confirmado: link no site/perfil da empresa (o mais repetido) ou o campo de WhatsApp do cadastro.
  let whatsapp = raw.whatsapp;
  let whatsappOrigin: WhatsAppOrigin | undefined = raw.whatsapp ? 'cadastro' : undefined;
  const siteWhatsApp = inspection ? pickWhatsApp(inspection.whatsapp, ctx.country, raw.uf) : undefined;
  if (siteWhatsApp) {
    whatsapp = siteWhatsApp;
    whatsappOrigin = 'site';
  }

  // Empresa que provavelmente fechou: cadastro parado há anos e nenhum sinal de vida (site no ar, conferência recente).
  const lastSeen = [raw.lastEdit, raw.checkedOn].filter((d): d is string => !!d).sort().pop();
  const ageYears = lastSeen && !siteLive && !raw.activeConfirmed ? yearsSince(lastSeen) : undefined;
  if (ageYears !== undefined && ageYears >= STALE_DROP_YEARS) return;

  // O domínio do e-mail precisa existir e receber mensagens; senão o e-mail é descartado (não vai para o lead).
  let emailDomain: 'ok' | 'unknown' | undefined;
  if (email !== 'N/D') {
    email = fixEmailTypo(email); // "gamil.com" -> "gmail.com": senão a mensagem iria para o domínio de outra pessoa
    const status = isAccountantEmail(email, raw.name) ? 'invalid' : await checkEmailDomain(email);
    if (status === 'invalid') email = 'N/D';
    else emailDomain = status;
  }

  // Depois de cada await a meta pode já ter sido atingida por outro lead.
  if (ctx.isDone()) return;
  // Lead bom é lead que dá para chamar: sem telefone nem WhatsApp fica de fora, mesmo com e-mail
  // (o dono reclamou de empresas "sem número" na lista).
  if (phone === NO_PHONE && !whatsapp) return;
  if (!matchesSiteFilters(siteStatus, ctx.onlyNoSite, ctx.onlyInsecure)) return;

  const phoneType = getPhoneType(phone, ctx.country);
  // EUA: o código de área do telefone é do mesmo estado da empresa? (No Brasil o DDD já é validado no cleanPhone.)
  const codeState = ctx.country === 'us' && phone !== NO_PHONE && raw.uf ? usAreaCodeState(phone) : undefined;
  const usAreaCode = codeState && raw.uf
    ? { code: phone.replace(/\D/g, '').slice(-10, -7), codeState: US_STATE_NAMES[codeState] ?? codeState, companyState: US_STATE_NAMES[raw.uf] ?? raw.uf }
    : undefined;
  const checks = buildChecks({
    phone: phone !== NO_PHONE ? phone : undefined,
    phoneOrigin,
    phoneReplaced,
    uf: ctx.country === 'br' ? raw.uf : undefined,
    country: ctx.country,
    usAreaCode,
    whatsapp,
    whatsappOrigin,
    unconfirmedMobile: !whatsapp && phoneType === 'MOBILE',
    email: emailDomain,
    siteStatus,
    siteFound,
    siteFoundVia,
    siteSearched,
    activeConfirmed: raw.activeConfirmed,
    cnpjActive: raw.source === 'cnpj',
    overtureConfidence: raw.confidence,
    listingUpdated: raw.listingUpdated,
    openedOn: raw.openedOn,
    lastEdit: raw.lastEdit,
    checkedOn: raw.checkedOn,
    address: addressCheck,
  });

  const score = scoreLead({
    siteStatus,
    rating: raw.rating,
    reviewsCount: raw.reviewsCount,
    reviewsKnown: raw.reviewsKnown,
    whatsappConfirmed: !!whatsapp,
    phoneType,
    hasPhone: phone !== NO_PHONE || !!whatsapp,
    hasEmail: email !== 'N/D',
    ageYears,
    phoneConfirmed: checks.some((c) => c.key === 'telefone' && c.ok),
  });

  ctx.streamed++;
  ctx.send({
    type: 'lead',
    data: {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      phone,
      otherPhones: otherPhones.length ? otherPhones : undefined,
      address: raw.address,
      rating: raw.rating,
      reviewsCount: raw.reviewsCount,
      website,
      isExpansion: raw.isExpansion,
      expansionSource: raw.expansionSource,
      siteStatus,
      email,
      phoneType,
      whatsapp,
      staleSince: ageYears !== undefined && ageYears >= STALE_WARN_YEARS && lastSeen ? Number(lastSeen.slice(0, 4)) : undefined,
      cnpj: raw.cnpj,
      openedOn: raw.openedOn,
      city: addressCheck && 'city' in addressCheck ? addressCheck.city : undefined,
      checks,
      verified: isVerified(checks),
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
          source: 'google',
          name: p.displayName?.text || 'Desconhecido',
          category: p.primaryTypeDisplayName?.text || (p.primaryType || term).replace(/_/g, ' '),
          phone: cleanPhone(p.nationalPhoneNumber || NO_PHONE, ctx.country, loc.uf),
          address: p.formattedAddress || zone,
          rating: p.rating || 0,
          reviewsCount: p.userRatingCount || 0,
          reviewsKnown: true,
          activeConfirmed: p.businessStatus === 'OPERATIONAL',
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

/** Uma consulta ao Nominatim. Espera 1 s depois: o limite de uso é 1 consulta por segundo. */
async function nominatim(params: Record<string, string>): Promise<NominatimPlace[]> {
  try {
    const res = await fetch(`${NOMINATIM_URL}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', extratags: '1', ...params })}`, {
      headers: OSM_HEADERS,
    });
    return res.ok ? ((await res.json()) as NominatimPlace[]) : [];
  } catch (error) {
    console.error('Nominatim error:', error);
    return [];
  } finally {
    await sleep(1000);
  }
}

/** Caixa (viewbox) do município, para buscar só dentro dele. Sem ela, a busca volta a ser "termo + cidade". */
async function cityBox(loc: SearchLocation, country: string): Promise<string | undefined> {
  if (loc.scope === 'region') return undefined;
  const q = [loc.city, loc.uf ? UF_NAMES[loc.uf] : undefined].filter(Boolean).join(', ');
  const found = await nominatim({ q, countrycodes: country, limit: '5', addressdetails: '0', extratags: '0' });
  const city = normalizeText(loc.city);
  const hit = found.find((p) => (p.category === 'boundary' || p.category === 'place') && normalizeText(p.name ?? '') === city);
  if (hit?.boundingbox?.length !== 4) return undefined;
  const [south, north, west, east] = hit.boundingbox;
  return `${west},${north},${east},${south}`;
}

/**
 * Data da última atualização de cada lugar, direto do banco do OpenStreetMap (uma consulta por tipo, para a
 * página inteira). O Nominatim não informa essa data, e é ela que denuncia cadastro abandonado.
 */
async function lastEdits(places: NominatimPlace[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byType = new Map<string, number[]>();
  for (const p of places) {
    if (p.osm_type === 'node' || p.osm_type === 'way' || p.osm_type === 'relation') {
      byType.set(p.osm_type, [...(byType.get(p.osm_type) ?? []), p.osm_id]);
    }
  }
  await Promise.all([...byType].map(async ([type, ids]) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSM_API_TIMEOUT_MS);
    try {
      const res = await fetch(`${OSM_API_URL}/${type}s.json?${type}s=${ids.join(',')}`, { headers: OSM_HEADERS, signal: controller.signal });
      if (!res.ok) return;
      const data = (await res.json()) as { elements?: { type: string; id: number; timestamp?: string }[] };
      for (const e of data.elements ?? []) if (e.timestamp) out.set(`${e.type}/${e.id}`, e.timestamp);
    } catch {
      /* sem a data: o lead segue, só sem o sinal de cadastro antigo */
    } finally {
      clearTimeout(timer);
    }
  }));
  return out;
}

/** Marcado como fechado no mapa: disused:shop, end_date passada, horário "closed". */
function isMarkedClosed(tags: Record<string, string>, today: string): boolean {
  if (Object.keys(tags).some((k) => /^(disused|was|abandoned):(shop|amenity|craft|office|leisure|tourism|healthcare)$/.test(k))) return true;
  if (tags.disused === 'yes' || tags.abandoned === 'yes') return true;
  if (tags.end_date && tags.end_date <= today) return true;
  return /^\s*(closed|off)\s*$/i.test(tags.opening_hours ?? '');
}

/** Perfil de Instagram/Facebook do cadastro. Antes era ignorado e a empresa aparecia "sem site". */
function socialProfile(tags: Record<string, string>): string | undefined {
  const profile = (value: string, host: string) => (/^https?:\/\//i.test(value) ? value : `https://${host}/${value.replace(/^@/, '').trim()}`);
  const insta = tags['contact:instagram'] || tags.instagram;
  if (insta) return profile(insta, 'instagram.com');
  const facebook = tags['contact:facebook'] || tags.facebook;
  return facebook ? profile(facebook, 'facebook.com') : undefined;
}

/** Última conferência no local registrada no mapa (check_date e variações). */
function checkDateOf(tags: Record<string, string>): string | undefined {
  return ['check_date', 'check_date:opening_hours', 'survey:date', 'survey_date']
    .map((k) => tags[k])
    .filter((d): d is string => !!d && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d))
    .sort()
    .pop();
}

function toRawLead(ctx: MiningContext, loc: SearchLocation, p: NominatimPlace, term: string, lastEdit?: string): RawLead | null {
  const tags = p.extratags || {};
  const name = p.name || tags.brand;
  if (!name) return null;
  // Todos os campos de telefone, inclusive "mobile" (antes ignorado) e vários números no mesmo campo.
  const phones = cleanPhones([tags['contact:mobile'], tags.mobile, tags.phone, tags['contact:phone']], ctx.country, loc.uf);
  const phone = phones.find((ph) => getPhoneType(ph, ctx.country) === 'MOBILE') ?? phones[0] ?? NO_PHONE;
  const parts = p.address || {};
  return {
    id: `${p.osm_type ?? 'osm'}/${p.osm_id}`,
    source: 'osm',
    name,
    category: (p.type || term).replace(/_/g, ' '),
    phone,
    otherPhones: phones.filter((ph) => ph !== phone),
    address: p.display_name,
    place: {
      cities: [parts.city, parts.town, parts.village, parts.municipality].filter((c): c is string => !!c),
      uf: /^BR-([A-Z]{2})$/.exec(parts['ISO3166-2-lvl4'] || '')?.[1],
    },
    rating: 0,
    reviewsCount: 0,
    reviewsKnown: false,
    activeConfirmed: false, // o OpenStreetMap não informa se a empresa ainda funciona
    website: tags.website || tags['contact:website'] || tags.url || socialProfile(tags),
    whatsapp: pickWhatsApp(splitPhones(tags['contact:whatsapp']), ctx.country, loc.uf),
    lastEdit,
    checkedOn: checkDateOf(tags),
    isExpansion: loc.isExpansion,
    expansionSource: loc.city,
  };
}

async function collectFromNominatim(
  ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, terms: string[], typeTerms: string[]
): Promise<void> {
  // Presa à caixa do município: não vem empresa de outra cidade só porque o nome é parecido, e cabem mais resultados.
  // Os termos em inglês ("bakery") trazem pelo TIPO de lugar, inclusive quem não tem "padaria" no nome.
  const box = await cityBox(loc, ctx.country);
  const zone = loc.queries[0] ?? '';
  const searches = box
    ? [terms[0], ...typeTerms, ...terms.slice(1)].map((q) => ({ q, viewbox: box, bounded: '1' }))
    : terms.map((t) => ({ q: `${t} ${zone}`.trim() }));
  const today = new Date().toISOString().slice(0, 10);

  for (const search of searches) {
    const shown: number[] = [];
    for (let page = 0; page < NOMINATIM_MAX_PAGES; page++) {
      if (ctx.isDone()) return;
      const data = await nominatim({
        ...search,
        countrycodes: ctx.country,
        limit: String(NOMINATIM_PAGE),
        ...(shown.length ? { exclude_place_ids: shown.join(',') } : {}),
      });
      shown.push(...data.map((p) => p.place_id));
      const places = data.filter((p) => BUSINESS_CATEGORIES.has(p.category ?? '') && !isMarkedClosed(p.extratags ?? {}, today));
      const edits = await lastEdits(places.filter((p) => !ctx.seenIds.has(`${p.osm_type}/${p.osm_id}`)));
      for (const p of places) {
        const raw = toRawLead(ctx, loc, p, search.q, edits.get(`${p.osm_type}/${p.osm_id}`));
        if (raw) acceptPlace(ctx, queue, loc, raw, false);
      }
      if (!box || data.length < NOMINATIM_PAGE) break; // página incompleta: não há mais
    }
  }
}

// ---------------------------------------------------------------------------
// Coleta: cadastro de CNPJ da Receita Federal (dados abertos, processados por scripts/cnpj/build.mjs)
// ---------------------------------------------------------------------------

/**
 * Ordem das empresas da Receita (menor = antes). Antes era "a mais nova primeiro", e a lista virava só empresa
 * recém-aberta. Agora:
 *   0. celular e empresa com até 6 anos (o telefone do cadastro ainda deve ser do dono: RECEITA_PHONE_FRESH_YEARS);
 *   1. celular de empresa mais antiga (pode ter trocado de número);
 *   2. só fixo, empresa com até 6 anos;
 *   3. só fixo, empresa mais antiga.
 */
function cnpjTier(c: { openedOn: string }, phones: string[], country: string): number {
  const mobile = phones.some((p) => getPhoneType(p, country) === 'MOBILE');
  const fresh = yearsSince(c.openedOn) <= RECEITA_PHONE_FRESH_YEARS;
  return (mobile ? 0 : 2) + (fresh ? 0 : 1);
}

/**
 * Embaralha de um jeito fixo (mesmo CNPJ, mesma posição) dentro de cada faixa, para misturar empresas novas e
 * estabelecidas. A mesma busca continua trazendo os mesmos leads.
 */
function mixKey(cnpj: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cnpj.length; i++) h = Math.imul(h ^ cnpj.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Empresas ATIVAS do nicho na cidade, direto do cadastro oficial. Vem antes do mapa: tem muito mais empresas
 * com telefone e confirma que o CNPJ está ativo. Ordem em `cnpjTier` e `mixKey`.
 */
async function collectFromCnpj(ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, term: string, filter: NicheFilter): Promise<void> {
  if (ctx.country !== 'br' || !loc.uf || !CNPJ_UFS.has(loc.uf) || loc.scope === 'region') return;
  const companies = await loadCompanies(ctx.origin, loc.uf, loc.city, filter);
  if (!companies) return;

  // Só entra quem tem telefone utilizável: empresa só com e-mail não é chance boa de venda.
  const found = companies
    .map((c) => ({ c, phones: cleanPhones(c.phones, ctx.country, loc.uf) }))
    .filter(({ phones }) => phones.length > 0)
    .map((f) => ({ ...f, tier: cnpjTier(f.c, f.phones, ctx.country), mix: mixKey(f.c.cnpj) }));
  found.sort((a, b) => a.tier - b.tier || a.mix - b.mix || a.c.cnpj.localeCompare(b.c.cnpj));

  for (const { c, phones } of found) {
    if (ctx.isDone()) return;
    const phone = phones.find((p) => getPhoneType(p, ctx.country) === 'MOBILE') ?? phones[0] ?? NO_PHONE;
    const cep = c.cep.length === 8 ? `${c.cep.slice(0, 5)}-${c.cep.slice(5)}` : c.cep;
    acceptPlace(ctx, queue, loc, {
      id: `cnpj/${c.cnpj}`,
      source: 'cnpj',
      name: c.name,
      category: term,
      phone,
      otherPhones: phones.filter((p) => p !== phone),
      email: c.email || undefined,
      website: c.site || undefined, // site/rede social que o mapa tem (juntado na importação)
      cnpj: c.cnpj,
      openedOn: c.openedOn,
      address: [c.street, c.district].filter(Boolean).join(' - ') + `, ${loc.city} - ${loc.uf}, ${cep}`,
      place: { cities: [loc.city], uf: loc.uf },
      rating: 0,
      reviewsCount: 0,
      reviewsKnown: false,
      activeConfirmed: false,
      isExpansion: loc.isExpansion,
      expansionSource: loc.city,
    }, false);
  }
}

/**
 * EUA: empresas do Overture Maps (public/us), já sem site próprio. Vêm antes do mapa, como a Receita no Brasil.
 * Ordem: confiança alta e ficha recente primeiro; dentro de cada faixa, misturado de um jeito fixo.
 */
/**
 * EUA: empresas do Overture na cidade. Devolve true quando a cidade tem dados e o nicho é conhecido: aí a busca de
 * reserva do mapa (OpenStreetMap) não roda, porque nos EUA ela quase não tem telefone e não confirma nada (eram os
 * leads "não confirmados" misturados). Nicho fora da tabela ou cidade sem dados: o mapa ainda ajuda.
 */
async function collectFromOverture(ctx: MiningContext, queue: AsyncQueue<RawLead>, loc: SearchLocation, term: string, filter: UsNicheFilter): Promise<boolean> {
  if (ctx.country !== 'us' || !loc.uf || !US_STATES.has(loc.uf) || loc.scope === 'region') return false;
  const companies = await loadUsCompanies(ctx.origin, loc.uf, loc.city, filter);
  if (!companies) return false;
  const covered = !!filter.categories;

  // Nos EUA não há WhatsApp: a abordagem é por e-mail (e ligação). Por isso, entre as que certamente existem, vem
  // primeiro quem tem e-mail; depois a ficha mais recente. Telefone com código de área de OUTRO estado vai para o fim.
  const tierOf = (c: { confidence: number; updated: string; email: string }, phone: string) => {
    const codeState = usAreaCodeState(phone);
    return (codeState && codeState !== loc.uf ? 8 : 0) + (c.confidence >= OVERTURE_SURE ? 0 : 4) + (c.email ? 0 : 2) +
      (c.updated && yearsSince(c.updated) <= OVERTURE_FRESH_YEARS ? 0 : 1);
  };
  // "Certa" = todas as checagens vão passar: confiança >= 80%, ficha recente e código de área do estado. Na 1ª volta
  // pelas cidades só entram as certas; as outras ficam para a 2ª volta (antes a cidade pedida esgotava as incertas
  // antes de a busca chegar às certas das vizinhas).
  const isSure = (tier: number) => tier % 2 === 0 && tier < 4;
  const found = companies
    .map((c) => ({ c, phones: cleanPhones(c.phones, 'us') }))
    .filter(({ phones }) => phones.length > 0)
    .map(({ c, phones }) => ({ c, phones, tier: tierOf(c, phones[0]), mix: mixKey(c.id) }))
    .filter(({ tier }) => !loc.usPass || (loc.usPass === 'sure') === isSure(tier))
    .sort((a, b) => a.tier - b.tier || a.mix - b.mix || a.c.id.localeCompare(b.c.id));

  for (const { c, phones } of found) {
    if (ctx.isDone()) return covered;
    acceptPlace(ctx, queue, loc, {
      id: `overture/${c.id}`,
      source: 'overture',
      name: c.name,
      category: term,
      phone: phones[0],
      otherPhones: phones.slice(1),
      email: c.email || undefined,
      website: c.social || undefined, // rede social/diretório: o site é conferido na validação
      address: [c.street, `${loc.city}, ${loc.uf} ${c.zip}`.trim()].filter(Boolean).join(', '),
      place: { cities: [loc.city], uf: loc.uf },
      confidence: c.confidence,
      listingUpdated: c.updated || undefined,
      rating: 0,
      reviewsCount: 0,
      reviewsKnown: false,
      activeConfirmed: false,
      isExpansion: loc.isExpansion,
      expansionSource: loc.city,
    }, false);
  }
  return covered;
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
  const typeTerms = placeTypeTerms(term).filter((t) => !terms.includes(t.toLowerCase()));
  const cnpjFilter = nicheFilter(term);
  const usFilter = usNicheFilter(term);
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
        streamed: 0, fatal: null, googleWorked: false, area: buildSearchedArea(locations),
        origin: req.nextUrl.origin, knownNames: new Set(),
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
            message: loc.usPass === 'rest'
              ? `Meta ainda não atingida (${ctx.streamed}/${volume}). Buscando as empresas com dados menos confirmados em ${loc.city}...`
              : loc.isExpansion
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
            await collectFromCnpj(ctx, queue, loc, terms[0], cnpjFilter);
            const overtureCovered = await collectFromOverture(ctx, queue, loc, terms[0], usFilter);
            if (GOOGLE_API_KEY) await collectFromGoogle(ctx, queue, loc, terms);
            else if (!overtureCovered && loc.usPass !== 'sure') await collectFromNominatim(ctx, queue, loc, terms, typeTerms);
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
