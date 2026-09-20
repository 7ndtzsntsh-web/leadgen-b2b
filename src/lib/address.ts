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
  /** Nomes normalizados, para endereços em outros formatos (ex.: OpenStreetMap). */
  names: string[];
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
export function checkAddress(address: string, area: SearchedArea): AddressCheck {
  const { city, uf } = parseAddress(address);
  if (city && uf) {
    if (area.cities.has(areaKey(city, uf))) return { status: "match", city, uf };
    if (!area.ufs.has(uf)) return { status: "wrong-state", city, uf };
    return { status: "other-city", city, uf };
  }

  // Outro formato (ex.: OpenStreetMap "Nome, Rua, Bairro, Cidade, Região, Estado, CEP, Brasil"): procura o nome da cidade.
  const text = ` ${normalizeText(address).replace(/[^a-z0-9]+/g, " ")} `;
  const hit = area.names.find((name) => text.includes(` ${name.replace(/[^a-z0-9]+/g, " ").trim()} `));
  return hit ? { status: "match" } : { status: "unknown" };
}
