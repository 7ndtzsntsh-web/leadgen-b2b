import raw from "./data/brCities.json";
import { normalizeText } from "./text";

// Dados do IBGE (gerados por scripts/build-br-cities.mjs):
// [nome, UF, regiãoImediataId, regiãoIntermediáriaId, população]
type Row = [string, string, number, number, number];

export interface City {
  name: string;
  uf: string;
  immediate: number;
  intermediate: number;
  pop: number;
  norm: string;
}

const CITIES: City[] = (raw as Row[]).map(([name, uf, immediate, intermediate, pop]) => ({
  name,
  uf,
  immediate,
  intermediate,
  pop,
  norm: normalizeText(name),
}));

/** Encontra um município pelo nome. Se houver homônimos e nenhuma UF, escolhe o mais populoso. */
export function findCity(name: string, uf?: string): City | undefined {
  const norm = normalizeText(name);
  const matches = CITIES.filter((c) => c.norm === norm && (!uf || c.uf === uf));
  if (matches.length === 0) return undefined;
  return matches.reduce((best, c) => (c.pop > best.pop ? c : best));
}

/** Sugestões "Nome - UF" para o autocomplete (prefixo primeiro, depois "contém"), mais populosas antes. */
export function searchCities(query: string, limit = 8): string[] {
  const q = normalizeText(query.split(" - ")[0]);
  if (q.length < 2) return [];
  const byPop = (a: City, b: City) => b.pop - a.pop;
  const starts = CITIES.filter((c) => c.norm.startsWith(q)).sort(byPop);
  const contains = CITIES.filter((c) => !c.norm.startsWith(q) && c.norm.includes(q)).sort(byPop);
  return [...starts, ...contains].slice(0, limit).map((c) => `${c.name} - ${c.uf}`);
}

/**
 * Cidades vizinhas para expandir a busca: primeiro a mesma região imediata, depois a intermediária,
 * sempre das mais populosas (mais comércio) para as menos. Ignora municípios muito pequenos.
 */
export function neighborCities(city: City, limit = 10, minPop = 10000): City[] {
  const candidates = CITIES.filter((c) => c !== city && c.uf === city.uf && c.pop >= minPop);
  const byPop = (a: City, b: City) => b.pop - a.pop;
  const near = candidates.filter((c) => c.immediate === city.immediate).sort(byPop);
  const far = candidates.filter((c) => c.immediate !== city.immediate && c.intermediate === city.intermediate).sort(byPop);
  return [...near, ...far].slice(0, limit);
}
