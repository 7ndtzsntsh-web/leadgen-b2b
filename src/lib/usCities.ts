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
  const q = usCityKey(query.split(" - ")[0]);
  if (q.length < 2) return [];
  const byLeads = (a: UsCity, b: UsCity) => b.leads - a.leads;
  const starts = CITIES.filter((c) => c.norm.startsWith(q)).sort(byLeads);
  const contains = CITIES.filter((c) => !c.norm.startsWith(q) && c.norm.includes(q)).sort(byLeads);
  return [...starts, ...contains].slice(0, limit).map((c) => `${c.name} - ${c.state}`);
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
