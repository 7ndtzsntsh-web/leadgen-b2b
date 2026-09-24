import raw from "./data/usCities.json";
import { normalizeText } from "./text";

// Cidades dos EUA que têm leads no Overture (gerado por scripts/us/build.mjs):
// [nome, estado, leads, latitude, longitude]. Latitude/longitude = média dos lugares da cidade.
type Row = [string, string, number, number | null, number | null];

export interface UsCity {
  name: string;
  state: string;
  leads: number;
  lat: number | null;
  lon: number | null;
  norm: string;
}

/**
 * Chave do nome da cidade: "St. Louis", "St Louis" e "Saint Louis" são a mesma (as fichas escrevem de todo jeito).
 * Mesma regra de cityKey em scripts/us/build.mjs, que usa esta chave no nome do arquivo da cidade.
 */
export function usCityKey(name: string): string {
  return normalizeText(name)
    .replace(/[.'’`]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bsainte\b/g, "ste")
    .replace(/\bfort\b/g, "ft")
    .replace(/\bmount\b/g, "mt")
    .replace(/[\s-]+/g, " ")
    .trim();
}

const CITIES: UsCity[] = (raw as Row[]).map(([name, state, leads, lat, lon]) => ({ name, state, leads, lat, lon, norm: usCityKey(name) }));

/** Encontra a cidade pelo nome. Homônimas sem estado ("Springfield"): a que tem mais leads. */
export function findUsCity(name: string, state?: string): UsCity | undefined {
  const norm = usCityKey(name);
  const st = state?.toUpperCase();
  const matches = CITIES.filter((c) => c.norm === norm && (!st || c.state === st));
  if (matches.length === 0) return undefined;
  return matches.reduce((best, c) => (c.leads > best.leads ? c : best));
}

/** Sugestões "Nome - UF" para o autocomplete (prefixo primeiro, depois "contém"), as com mais leads antes. */
export function searchUsCities(query: string, limit = 8): string[] {
  const { name, state } = splitUsInput(query);
  const q = usCityKey(name);
  if (q.length < 2) return [];
  const byLeads = (a: UsCity, b: UsCity) => b.leads - a.leads;
  const inState = (c: UsCity) => !state || c.state === state;
  const starts = CITIES.filter((c) => c.norm.startsWith(q) && inState(c)).sort(byLeads);
  const contains = CITIES.filter((c) => !c.norm.startsWith(q) && c.norm.includes(q) && inState(c)).sort(byLeads);
  // "Texa" -> "Texas" (o estado inteiro) antes de "Texas City". New York e Washington sozinhos são a cidade.
  const states = !state && q.length >= 3
    ? Object.values(US_STATE_NAMES).filter((n) => usCityKey(n).startsWith(q) && !["new york", "washington"].includes(usCityKey(n)))
    : [];
  return [...states.slice(0, 2), ...[...starts, ...contains].map((c) => `${c.name} - ${c.state}`)].slice(0, limit);
}

// ---------------------------------------------------------------------------
// O que a pessoa digitou no campo de cidade (EUA). Antes só "Miami - FL" ou "Miami" funcionavam: "Orlando, FL",
// "orlando fl", "Miami Florida", "Texas" ou "USA" caíam na busca de reserva do mapa (poucos leads, nada confirmado).
// ---------------------------------------------------------------------------

export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
  VI: "U.S. Virgin Islands", GU: "Guam", MP: "Northern Mariana Islands", AS: "American Samoa",
};

// Nome do estado -> sigla, também como o dono escreve em português.
const STATE_BY_NAME = new Map<string, string>([
  ...Object.entries(US_STATE_NAMES).map(([code, name]) => [usCityKey(name), code] as [string, string]),
  ["nova york", "NY"], ["nova iorque", "NY"], ["nova jersey", "NJ"], ["novo mexico", "NM"], ["havai", "HI"],
  ["pensilvania", "PA"], ["luisiana", "LA"], ["carolina do norte", "NC"], ["carolina do sul", "SC"],
  ["dakota do norte", "ND"], ["dakota do sul", "SD"], ["virginia ocidental", "WV"], ["massachussets", "MA"],
  ["washington dc", "DC"],
]);

/** Sigla do estado a partir da sigla ou do nome ("fl", "Florida", "Flórida"); undefined se não for estado. */
export function usStateCode(text: string): string | undefined {
  const key = usCityKey(text);
  const upper = key.toUpperCase();
  if (upper.length === 2 && US_STATE_NAMES[upper]) return upper;
  return STATE_BY_NAME.get(key);
}

const US_COUNTRY = new Set(["usa", "us", "eua", "estados unidos", "united states", "united states of america", "america", "eeuu"]);

// Apelidos de cidade. "NY" e "LA" sozinhos são a cidade (é o que se procura), não o estado.
const US_CITY_ALIASES: Record<string, [string, string]> = {
  nyc: ["New York", "NY"], ny: ["New York", "NY"], "new york city": ["New York", "NY"], manhattan: ["New York", "NY"],
  "nova york": ["New York", "NY"], "nova iorque": ["New York", "NY"], la: ["Los Angeles", "CA"], sf: ["San Francisco", "CA"],
  "san fran": ["San Francisco", "CA"], philly: ["Philadelphia", "PA"], vegas: ["Las Vegas", "NV"], nola: ["New Orleans", "LA"],
  dc: ["Washington", "DC"], "washington dc": ["Washington", "DC"], chi: ["Chicago", "IL"], atl: ["Atlanta", "GA"],
};

/** Separa "Orlando, FL", "Orlando - FL", "orlando fl 32801" ou "Miami Florida" em cidade e sigla do estado. */
export function splitUsInput(raw: string): { name: string; state?: string } {
  const text = raw.replace(/\b\d{5}(?:-\d{4})?\b/g, " ").replace(/\s+/g, " ").trim();
  const sep = /\s+-\s+|,/.exec(text);
  if (sep) {
    const name = text.slice(0, sep.index).trim();
    const rest = text.slice(sep.index + sep[0].length).split(",")[0].trim();
    return { name, state: usStateCode(rest) };
  }
  // Sem separador: estado no fim ("orlando fl", "st louis missouri", "charlotte north carolina").
  const words = text.split(" ");
  for (const n of [3, 2, 1]) {
    if (words.length <= n) continue;
    const state = usStateCode(words.slice(-n).join(" "));
    if (state) return { name: words.slice(0, -n).join(" "), state };
  }
  return { name: text };
}

/** Distância de edição; troca de duas letras vizinhas ("Orlnado") conta como um erro só. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
    }
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Cidade com o nome digitado com um erro ou dois ("Orlnado"), se só uma chegar tão perto. */
function closestUsCity(name: string, state?: string): UsCity | undefined {
  const key = usCityKey(name);
  if (key.length < 5) return undefined;
  const max = key.length >= 8 ? 2 : 1;
  let best: UsCity[] = [];
  let bestDistance = max + 1;
  for (const c of CITIES) {
    if (state && c.state !== state) continue;
    const d = editDistance(key, c.norm, max);
    if (d < bestDistance) { bestDistance = d; best = [c]; }
    else if (d === bestDistance) best.push(c);
  }
  if (bestDistance > max || best.length === 0) return undefined;
  const names = new Set(best.map((c) => c.norm));
  return names.size === 1 ? best.reduce((a, c) => (c.leads > a.leads ? c : a)) : undefined;
}

export type UsPlace =
  | { kind: "city"; city: UsCity }
  /** Cidade e estado digitados, mas a cidade não está na lista (pequena): ainda dá para procurar o arquivo dela. */
  | { kind: "typed"; name: string; state: string }
  | { kind: "state"; state: string }
  | { kind: "country" }
  | { kind: "unknown"; name: string };

/** Entende o campo de cidade dos EUA: cidade (de vários jeitos), estado inteiro ou o país todo. */
export function parseUsPlace(raw: string): UsPlace {
  const text = raw
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
    .replace(/[,\s]+(usa|u\.?s\.?a?\.?|united states( of america)?|eua|estados unidos)[.\s]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const whole = usCityKey(text.replace(/,/g, " "));
  if (!whole || US_COUNTRY.has(whole)) return { kind: "country" };
  const alias = US_CITY_ALIASES[whole];
  if (alias) {
    const city = findUsCity(alias[0], alias[1]);
    if (city) return { kind: "city", city };
  }
  // Estado inteiro: "TX", "Texas", "Flórida". "New York" e "Washington" sozinhos são a cidade.
  const stateOnly = usStateCode(text);
  if (stateOnly && whole !== "new york" && whole !== "washington") return { kind: "state", state: stateOnly };

  // Sem vírgula nem " - ": o texto inteiro pode ser a cidade ("Fort Washington" não é "Fort", no estado de Washington).
  if (!/\s+-\s+|,/.test(text)) {
    const city = findUsCity(text);
    if (city) return { kind: "city", city };
  }
  const { name, state } = splitUsInput(text);
  const exact = name ? findUsCity(name, state) : undefined;
  if (exact) return { kind: "city", city: exact };
  const close = closestUsCity(name, state);
  if (close) return { kind: "city", city: close };
  if (state && name) return { kind: "typed", name: name.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()), state };
  if (state) return { kind: "state", state };
  return { kind: "unknown", name: text };
}

/** Cidades com mais empresas (do estado, ou do país todo), para busca por estado ou país. */
export function topUsCities(state?: string, limit = 20): UsCity[] {
  return CITIES.filter((c) => !state || c.state === state).sort((a, b) => b.leads - a.leads).slice(0, limit);
}

const km = (a: UsCity, b: UsCity) => {
  const rad = Math.PI / 180;
  const dLat = ((b.lat as number) - (a.lat as number)) * rad;
  const dLon = ((b.lon as number) - (a.lon as number)) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat as number) * rad) * Math.cos((b.lat as number) * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/**
 * Cidades vizinhas para expandir a busca: até `radiusKm` de distância (pode ser em outro estado, como
 * Nova York e Jersey City), das que têm mais leads para as que têm menos.
 */
export function usNeighborCities(city: UsCity, limit = 10, radiusKm = 60, minLeads = 20): UsCity[] {
  if (city.lat === null || city.lon === null) return [];
  return CITIES.filter((c) => c !== city && c.leads >= minLeads && c.lat !== null && c.lon !== null && km(city, c) <= radiusKm)
    .sort((a, b) => b.leads - a.leads)
    .slice(0, limit);
}
