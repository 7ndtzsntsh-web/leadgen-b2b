import usIndex from "../../public/us/index.json";
import { runPool } from "./async";
import nicheOverture from "./data/nicheOverture.json";
import { loadIndex, loadRows } from "./regionFiles";
import { findDictionaryKey } from "./semanticDictionary";
import { normalizeText } from "./text";

/**
 * Empresas dos EUA do Overture Maps (base aberta: Meta, Microsoft, Amazon e outras), já filtradas por
 * scripts/us/build.mjs: abertas, sem marca (rede), com telefone válido e SEM site próprio. Ficam em public/us,
 * no mesmo formato de public/cnpj (ramo = categoria do Overture).
 */
export const US_STATES = new Set(Object.keys(usIndex.estados));

const FILE_CONCURRENCY = 4;

export interface UsCompany {
  id: string;
  name: string;
  category: string;
  street: string;
  zip: string;
  /** Telefones com 10 dígitos (DDD de 3 + 7), já validados. */
  phones: string[];
  email: string;
  /** Rede social ou diretório (Facebook, Yelp...): a empresa não tem site próprio. */
  social: string;
  /** Confiança do Overture de que o lugar existe, de 0 a 100. */
  confidence: number;
  /** Última atualização da ficha nas fontes (AAAA-MM). */
  updated: string;
}

type Row = [string, string, string, string, string, string[], string, string, number, string];

const toCompany = ([id, name, category, street, zip, phones, email, social, confidence, updated]: Row): UsCompany => ({
  id, name, category, street, zip, phones, email, social, confidence, updated,
});

export interface UsNicheFilter {
  categories?: Set<string>;
  /** Nicho fora da tabela: o nome da empresa ou a categoria precisa conter um desses pedaços. */
  nameParts?: string[];
}

const RULES = nicheOverture as Record<string, string[]>;
const CATEGORIES = new Set(Object.values(RULES).flat());

/**
 * Categorias do Overture do nicho. Aceita o nicho em português (mesmas chaves de nicheCnaes.json) ou o nome da
 * categoria em inglês ("barber", "nail salon"). Fora disso: filtra pelo nome da empresa ou da categoria.
 */
export function usNicheFilter(term: string): UsNicheFilter {
  const t = normalizeText(term);
  const singular = t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
  const dictionaryKey = findDictionaryKey(term);
  const key = [t, singular, dictionaryKey ? normalizeText(dictionaryKey) : ""].find((k) => k && RULES[k]?.length);
  if (key) return { categories: new Set(RULES[key]) };
  const category = [t, singular].map((s) => s.replace(/[\s-]+/g, "_")).find((c) => CATEGORIES.has(c));
  if (category) return { categories: new Set([category]) };
  return { nameParts: [singular, singular.replace(/\s+/g, "_")] };
}

const citySlug = (city: string) => normalizeText(city).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const loadStateIndex = (origin: string, state: string) => loadIndex(origin, `/us/${state.toLowerCase()}/index.json`);
const loadFile = (origin: string, path: string) => loadRows(origin, path, toCompany);

function companiesFor(all: UsCompany[], filter: UsNicheFilter): UsCompany[] {
  return all.filter((c) => {
    if (filter.categories) return filter.categories.has(c.category);
    const text = `${normalizeText(c.name)} ${c.category}`;
    return (filter.nameParts ?? []).some((p) => text.includes(p));
  });
}

/** Empresas do nicho na cidade (null se a cidade não tem dados ou o arquivo não pôde ser lido). */
export async function loadUsCompanies(origin: string, state: string, city: string, filter: UsNicheFilter): Promise<UsCompany[] | null> {
  const slug = citySlug(city);
  const entry = (await loadStateIndex(origin, state))?.cidades[slug];
  if (entry === undefined) return null;
  const base = `/us/${state.toLowerCase()}/${slug}`;
  if (typeof entry === "number") {
    const all = await loadFile(origin, `${base}.json`);
    return all && companiesFor(all, filter);
  }

  // Cidade dividida por categoria: só os arquivos das categorias do nicho (fora da tabela, filtra em todos).
  const categories = Object.keys(entry).filter((cat) => !filter.categories || filter.categories.has(cat));
  const found: UsCompany[] = [];
  let failed = false;
  await runPool(categories, FILE_CONCURRENCY, async (cat) => {
    const companies = await loadFile(origin, `${base}/${cat}.json`);
    if (!companies) failed = true;
    else for (const c of companiesFor(companies, filter)) found.push(c);
  });
  return failed && found.length === 0 ? null : found;
}
