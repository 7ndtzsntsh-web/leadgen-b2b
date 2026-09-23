import cnpjIndex from "../../public/cnpj/index.json";
import { runPool } from "./async";
import nicheCnaes from "./data/nicheCnaes.json";
import { findDictionaryKey } from "./semanticDictionary";
import { normalizeText } from "./text";

/**
 * Empresas do cadastro de CNPJ da Receita Federal (dados abertos), já filtradas por scripts/cnpj/build.mjs:
 * só ATIVAS, dos nichos do gerador, com nome fantasia e com telefone/e-mail que não é de contador.
 * Ficam em public/cnpj (formato em scripts/cnpj/output.mjs). Estados sem esses arquivos continuam só com o mapa.
 */
export const CNPJ_UFS = new Set(Object.keys(cnpjIndex.ufs));

// Reserva: se o próprio site recusar a leitura (proteção anti-robô), lê do repositório público no GitHub.
const RAW_BASE = "https://raw.githubusercontent.com/7ndtzsntsh-web/leadgen-b2b/main/public";
const FETCH_TIMEOUT_MS = 10_000;
// Limite do que fica em memória entre buscas, em empresas e não em arquivos: um ramo de São Paulo tem mais
// empresas que uma cidade pequena inteira.
const MAX_CACHED_COMPANIES = 60_000;
const FILE_CONCURRENCY = 4;

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

const citySlug = (city: string) => normalizeText(city).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

const fetchData = async (origin: string, path: string) => (await fetchJson(`${origin}${path}`)) ?? (await fetchJson(`${RAW_BASE}${path}`));

type Row = [string, string, string, string, string, string, string, string[], string, string?];

interface CityFile {
  linhas: Row[];
}

/** Por cidade: total de empresas (um arquivo) ou, na cidade dividida, empresas por ramo (um arquivo por CNAE). */
interface UfIndex {
  cidades: Record<string, number | Record<string, number>>;
}

const toCompany = ([cnpj, name, cnae, inicio, street, district, cep, phones, email, site]: Row): CnpjCompany => ({
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
});

const ufIndexes = new Map<string, Promise<UfIndex | null>>();

function loadUfIndex(origin: string, uf: string): Promise<UfIndex | null> {
  const cached = ufIndexes.get(uf);
  if (cached) return cached;
  const pending = fetchData(origin, `/cnpj/${uf.toLowerCase()}/index.json`).then((data) => ((data as UfIndex | null)?.cidades ? (data as UfIndex) : null));
  ufIndexes.set(uf, pending);
  pending.then((index) => { if (!index) ufIndexes.delete(uf); }); // falha temporária: tenta de novo na próxima busca
  return pending;
}

const files = new Map<string, Promise<CnpjCompany[] | null>>();
const fileSizes = new Map<string, number>();
let cachedCompanies = 0;

/** Um arquivo de empresas, guardado em memória; os usados há mais tempo saem quando passa do limite. */
function loadFile(origin: string, path: string): Promise<CnpjCompany[] | null> {
  const cached = files.get(path);
  if (cached) {
    files.delete(path);
    files.set(path, cached);
    return cached;
  }
  const pending = fetchData(origin, path).then((data) => (data as CityFile | null)?.linhas?.map(toCompany) ?? null);
  files.set(path, pending);
  pending.then((companies) => {
    if (!companies) {
      files.delete(path);
      return;
    }
    fileSizes.set(path, companies.length);
    cachedCompanies += companies.length;
    for (const [old] of files) {
      if (cachedCompanies <= MAX_CACHED_COMPANIES) break;
      const size = fileSizes.get(old);
      if (size === undefined) continue; // ainda baixando
      files.delete(old);
      fileSizes.delete(old);
      cachedCompanies -= size;
    }
  });
  return pending;
}

/** Empresas do nicho na cidade (null se a cidade não tem cadastro ou o arquivo não pôde ser lido). */
export async function loadCompanies(origin: string, uf: string, city: string, filter: NicheFilter): Promise<CnpjCompany[] | null> {
  const slug = citySlug(city);
  const entry = (await loadUfIndex(origin, uf))?.cidades[slug];
  if (entry === undefined) return null;
  const base = `/cnpj/${uf.toLowerCase()}/${slug}`;
  if (typeof entry === "number") {
    const all = await loadFile(origin, `${base}.json`);
    return all && companiesFor(all, filter);
  }

  // Cidade dividida por ramo: só os arquivos dos ramos do nicho (nicho fora da tabela filtra pelo nome em todos).
  const cnaes = Object.keys(entry).filter((cnae) => !filter.cnaes || filter.cnaes.has(cnae));
  const found: CnpjCompany[] = [];
  let failed = false;
  await runPool(cnaes, FILE_CONCURRENCY, async (cnae) => {
    const companies = await loadFile(origin, `${base}/${cnae}.json`);
    if (!companies) failed = true;
    else for (const c of companiesFor(companies, filter)) found.push(c);
  });
  return failed && found.length === 0 ? null : found;
}

function companiesFor(all: CnpjCompany[], filter: NicheFilter): CnpjCompany[] {
  return all.filter((c) => {
    if (filter.cnaes && !filter.cnaes.has(c.cnae)) return false;
    if (!filter.nameParts) return true;
    const name = normalizeText(c.name);
    return filter.nameParts.some((p) => name.includes(p));
  });
}
