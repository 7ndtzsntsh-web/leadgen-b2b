import nicheCnaes from "./data/nicheCnaes.json";
import { findDictionaryKey } from "./semanticDictionary";
import { normalizeText } from "./text";

/**
 * Empresas do cadastro de CNPJ da Receita Federal (dados abertos), já filtradas por scripts/cnpj/build.mjs:
 * só ATIVAS, dos nichos do gerador, com nome fantasia e com telefone/e-mail que não é de contador.
 * Ficam em public/cnpj/<uf>/<cidade>.json. Estados sem esses arquivos continuam só com o mapa.
 */
export const CNPJ_UFS = new Set(["SC"]);

// Reserva: se o próprio site recusar a leitura (proteção anti-robô), lê do repositório público no GitHub.
const RAW_BASE = "https://raw.githubusercontent.com/7ndtzsntsh-web/leadgen-b2b/main/public";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CACHED_CITIES = 30;

export interface CnpjCompany {
  cnpj: string;
  name: string;
  cnae: string;
  /** Data de abertura, AAAA-MM-DD. */
  openedOn: string;
  street: string;
  district: string;
  cep: string;
  /** Telefones como vieram da Receita (DDD + número, só dígitos). */
  phones: string[];
  email: string;
  /** Site ou rede social que o OpenStreetMap tem para esta empresa (a Receita não tem site). */
  site: string;
}

interface NicheRule {
  cnaes: string[];
  nome?: string[];
}

export interface NicheFilter {
  cnaes?: Set<string>;
  /** O nome fantasia precisa conter um desses pedaços (sem acento, minúsculo). */
  nameParts?: string[];
}

const RULES = nicheCnaes as unknown as Record<string, NicheRule>;

/** Ramos oficiais (CNAE) do nicho. Nicho fora da tabela: filtra só pelo nome fantasia. */
export function nicheFilter(term: string): NicheFilter {
  const t = normalizeText(term);
  const singular = t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
  const dictionaryKey = findDictionaryKey(term);
  const key = [t, singular, dictionaryKey ? normalizeText(dictionaryKey) : ""].find((k) => k && RULES[k] && !k.startsWith("_"));
  const rule = key ? RULES[key] : undefined;
  if (!rule) return { nameParts: [singular] };
  return { cnaes: new Set(rule.cnaes), nameParts: rule.nome };
}

export const citySlug = (city: string) => normalizeText(city).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface CityFile {
  linhas: [string, string, string, string, string, string, string, string[], string, string?][];
}

const cache = new Map<string, Promise<CnpjCompany[] | null>>();

/** Empresas da cidade (null se o estado/cidade não tem arquivo). */
export function loadCity(origin: string, uf: string, city: string): Promise<CnpjCompany[] | null> {
  const path = `/cnpj/${uf.toLowerCase()}/${citySlug(city)}.json`;
  const cached = cache.get(path);
  if (cached) return cached;

  const pending = (async () => {
    const data = ((await fetchJson(`${origin}${path}`)) ?? (await fetchJson(`${RAW_BASE}${path}`))) as CityFile | null;
    if (!data?.linhas) return null;
    return data.linhas.map(([cnpj, name, cnae, inicio, street, district, cep, phones, email, site]) => ({
      cnpj,
      name,
      cnae,
      openedOn: `${inicio.slice(0, 4)}-${inicio.slice(4, 6)}-${inicio.slice(6, 8)}`,
      street,
      district,
      cep,
      phones,
      email,
      site: site ?? "",
    }));
  })();

  if (cache.size >= MAX_CACHED_CITIES) cache.delete(cache.keys().next().value as string);
  cache.set(path, pending);
  pending.then((r) => { if (!r) cache.delete(path); }); // falha temporária: tenta de novo na próxima busca
  return pending;
}

/** Empresas do nicho pesquisado. */
export function companiesFor(all: CnpjCompany[], filter: NicheFilter): CnpjCompany[] {
  return all.filter((c) => {
    if (filter.cnaes && !filter.cnaes.has(c.cnae)) return false;
    if (!filter.nameParts) return true;
    const name = normalizeText(c.name);
    return filter.nameParts.some((p) => name.includes(p));
  });
}
