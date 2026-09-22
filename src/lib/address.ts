import { normalizeText } from "./text";

export interface ParsedAddress {
  city?: string;
  uf?: string;
}

/** Cidades e estados que a busca cobre (a cidade pedida e as vizinhas da expansão). */
export interface SearchedArea {
  /** "cidade normalizada|UF" */
  cities: Set<string>;
  ufs: Set<string>;
  /** Nomes normalizados, para fontes que não informam a UF (ex.: buscas fora do Brasil). */
  names: string[];
}

/** Cidade e UF que o OpenStreetMap devolve em campos separados (`addressdetails=1`). */
export interface StructuredAddress {
  /** Nomes que podem ser o município (city, town, village, municipality). */
  cities: string[];
  uf?: string;
}

export type AddressCheck =
  | { status: "match"; city?: string; uf?: string }
  | { status: "other-city"; city: string; uf?: string }
  | { status: "wrong-state"; city?: string; uf: string }
  | { status: "unknown" };

export const areaKey = (city: string, uf: string) => `${normalizeText(city)}|${uf}`;

/**
 * Extrai cidade e UF de um endereço do Google no formato brasileiro:
 * "R. das Flores, 123 - Centro, Americana - SP, 13465-000, Brasil".
 */
export function parseAddress(address: string): ParsedAddress {
  let found: ParsedAddress = {};
  for (const part of address.split(",")) {
    const match = /^\s*(.+?)\s+-\s+([A-Z]{2})\s*$/.exec(part);
    if (match) found = { city: match[1].trim(), uf: match[2] };
  }
  return found;
}

/**
 * Confere se o endereço do lead está mesmo na área pesquisada. Serve para não dizer "encontrei vocês em Americana"
 * a uma empresa de outra cidade, e para descartar resultados de outro estado.
 */
export function checkAddress(address: string, area: SearchedArea, place?: StructuredAddress): AddressCheck {
  const { city, uf } = parseAddress(address);
  if (city && uf) {
    if (area.cities.has(areaKey(city, uf))) return { status: "match", city, uf };
    if (!area.ufs.has(uf)) return { status: "wrong-state", city, uf };
    return { status: "other-city", city, uf };
  }

  // OpenStreetMap: usa a cidade e a UF dos campos separados. Procurar o nome da cidade no texto do endereço dava
  // falso positivo, porque o texto começa com o NOME DA EMPRESA ("Panificadora São José", de Belmonte, passava
  // como São José) e rua com nome de cidade é comum ("Rua Blumenau"). Sem os campos, não dá para confirmar.
  if (place && place.cities.length > 0) {
    const { cities, uf: placeUf } = place;
    const inArea = (name: string) =>
      placeUf && area.cities.size > 0 ? area.cities.has(areaKey(name, placeUf)) : area.names.includes(normalizeText(name));
    const hit = cities.find(inArea);
    if (hit) return { status: "match", city: hit, uf: placeUf };
    if (placeUf && area.ufs.size > 0 && !area.ufs.has(placeUf)) return { status: "wrong-state", city: cities[0], uf: placeUf };
    return { status: "other-city", city: cities[0], uf: placeUf };
  }
  return { status: "unknown" };
}
