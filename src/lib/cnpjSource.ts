import cnpjIndex from "../../public/cnpj/index.json";
import { runPool } from "./async";
import nicheCnaes from "./data/nicheCnaes.json";
import { loadIndex, loadRows } from "./regionFiles";
import { findDictionaryKey } from "./semanticDictionary";
import { normalizeText } from "./text";

/**
 * Empresas do cadastro de CNPJ da Receita Federal (dados abertos), já filtradas por scripts/cnpj/build.mjs:
 * só ATIVAS, dos nichos do gerador, com nome fantasia e com telefone/e-mail que não é de contador.
 * Ficam em public/cnpj (formato em scripts/cnpj/output.mjs). Estados sem esses arquivos continuam só com o mapa.
 */
export const CNPJ_UFS = new Set(Object.keys(cnpjIndex.ufs));

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

type Row = [string, string, string, string, string, string, string, string[], string, string?];

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

const loadUfIndex = (origin: string, uf: string) => loadIndex(origin, `/cnpj/${uf.toLowerCase()}/index.json`);
const loadFile = (origin: string, path: string) => loadRows(origin, path, toCompany);

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
