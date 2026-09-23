import { DOH_ENDPOINTS, DOH_TIMEOUT_MS } from "./emailCheck";
import { getHostname, isParkedPage, isPublicHost, isSocialHost, probe } from "./domainValidator";
import { normalizeText } from "./text";

/**
 * Procura o site da empresa quando o cadastro não traz nenhum ("Padaria Passarinho" -> padariapassarinho.com.br).
 *
 * Por que é rigoroso: num teste com 96 empresas "sem site" de Florianópolis, 78 nomes batiam com um domínio que
 * existe, mas quase sempre de OUTRA empresa (estrela.com.br, milano.com). Só vale o site que mostra o nome da
 * empresa E o telefone dela (ou a cidade). Com nome de uma palavra só ("Milano"), só o telefone serve.
 */

// Palavras que não identificam a empresa: tipo de negócio, artigos, sufixos.
const GENERIC = new Set([
  "e", "de", "da", "do", "das", "dos", "the", "and", "o", "a", "os", "as", "ltda", "me", "eireli", "epp", "sa",
  "padaria", "panificadora", "confeitaria", "cafe", "cafeteria", "restaurante", "lanchonete", "bar", "pizzaria",
  "hamburgueria", "churrascaria", "bistro", "salao", "beleza", "barbearia", "barber", "shop", "cabeleireiro",
  "cabeleireiros", "cabeleireira", "studio", "estudio", "espaco", "clinica", "consultorio", "odontologia",
  "academia", "pet", "loja", "mercado", "supermercado", "mercearia", "oficina", "auto", "center", "centro",
  "casa", "grupo", "comercio", "servicos", "store", "restaurant", "bakery", "hair", "beauty", "salon",
]);

const TLDS: Record<string, string[]> = { br: [".com.br", ".com"], pt: [".pt", ".com"], es: [".es", ".com"], us: [".com"] };

// Apelidos que os sites usam no lugar do nome oficial ("O Padeiro de Sevilha" escreve "Floripa").
// Só apelidos longos: "SP" ou "BH" aparecem em qualquer endereço e não provam nada.
const CITY_NICKNAMES: Record<string, string[]> = { florianopolis: ["floripa"], "sao paulo": ["sampa"] };

const MAX_CACHE = 1000;
const cache = new Map<string, Promise<string | undefined>>();

export interface SiteClues {
  /** Telefones da empresa (qualquer formato). */
  phones: string[];
  /** Cidade da empresa. */
  city?: string;
  country: string;
}

export interface DomainCandidate {
  host: string;
  /** Endereço de mais de uma palavra ("pizzariabasilico"): específico o bastante para aceitar nome + cidade. */
  composite: boolean;
}

export interface DomainCandidates {
  candidates: DomainCandidate[];
  /** Palavras que identificam a empresa: TODAS precisam aparecer na página. */
  distinctive: string[];
}

/**
 * Endereços prováveis a partir do nome. Além do nome inteiro, só as palavras que identificam a empresa
 * ("Taberna Iberica Restaurante" -> tabernaiberica), o começo do nome e a versão com hífen: nomes longos
 * ("Trigales Padaria, Confeitaria e Cafeteria") quase nunca viram o endereço inteiro.
 */
export function candidateDomains(name: string, country: string): DomainCandidates {
  const words = normalizeText(name).replace(/['’`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const distinctive = words.filter((w) => w.length >= 3 && !GENERIC.has(w));
  if (distinctive.length === 0) return { candidates: [], distinctive };

  const slugs: { slug: string; composite: boolean }[] = [];
  const add = (parts: string[], separator = "") => {
    const slug = parts.join(separator);
    if (slug.length >= 6 && slug.length <= 40 && !slugs.some((s) => s.slug === slug)) slugs.push({ slug, composite: parts.length >= 2 });
  };
  add(words);
  add(distinctive);
  if (words.length >= 3) add(words.slice(0, 2));
  if (words.length >= 2) add(words, "-");

  const tlds = TLDS[country] ?? [".com"];
  return { candidates: slugs.flatMap(({ slug, composite }) => tlds.map((tld) => ({ host: `${slug}${tld}`, composite }))), distinctive };
}

/**
 * A página é mesmo desta empresa: todas as palavras do nome (inteiras) + telefone; ou + cidade quando o endereço
 * tem mais de uma palavra. Endereço de uma palavra só ("milano.com") precisa do telefone.
 */
export function pageBelongsTo(html: string, { distinctive, composite }: { distinctive: string[]; composite: boolean }, clues: SiteClues): boolean {
  const text = ` ${normalizeText(html.replace(/<[^>]*>/g, " ")).replace(/[^a-z0-9]+/g, " ")} `;
  if (!distinctive.every((w) => text.includes(` ${w} `))) return false;

  const digits = html.replace(/\D/g, "");
  const phoneHit = clues.phones.some((p) => {
    const tail = p.replace(/\D/g, "").slice(-8);
    return tail.length === 8 && digits.includes(tail);
  });
  if (phoneHit) return true;

  const city = clues.city ? normalizeText(clues.city).replace(/[^a-z0-9]+/g, " ").trim() : "";
  if (!composite || !city) return false;
  return [city, ...(CITY_NICKNAMES[city] ?? [])].some((form) => text.includes(` ${form} `));
}

/** O domínio existe (tem endereço IP), por DNS-sobre-HTTPS. */
async function resolves(host: string): Promise<boolean> {
  for (const endpoint of DOH_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
    try {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(host)}&type=A`, {
        headers: { accept: "application/dns-json" },
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { Status: number; Answer?: { type: number }[] };
      if (data.Status === 3) return false; // não existe
      if (data.Status !== 0) continue;
      return (data.Answer ?? []).some((a) => a.type === 1 || a.type === 5);
    } catch {
      /* tenta o próximo resolvedor */
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

async function search(name: string, clues: SiteClues): Promise<string | undefined> {
  const { candidates, distinctive } = candidateDomains(name, clues.country);
  // DNS de todos ao mesmo tempo: a maioria dos endereços nem existe, e só os que existem são abertos.
  const existing = await Promise.all(candidates.map(async (c) => (isPublicHost(c.host) && (await resolves(c.host)) ? c : null)));
  for (const candidate of existing) {
    if (!candidate) continue;
    const { host, composite } = candidate;
    const page = (await probe(`https://${host}`)) ?? (await probe(`http://${host}`));
    if (!page || page.status >= 400 || !page.html) continue;
    const finalHost = getHostname(page.finalUrl);
    if (!finalHost || isSocialHost(finalHost) || isParkedPage(page.html)) continue;
    if (pageBelongsTo(page.html, { distinctive, composite }, clues)) return page.finalUrl.startsWith("https://") ? `https://${host}` : `http://${host}`;
  }
  return undefined;
}

// Provedores de e-mail gratuitos: o domínio não é da empresa.
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br",
  "globo.com", "globomail.com", "r7.com", "oi.com.br", "zipmail.com.br", "protonmail.com", "proton.me", "aol.com",
]);

/**
 * Site pelo domínio do e-mail da empresa (contato@padariaxyz.com.br -> padariaxyz.com.br).
 * - Site no ar: o domínio já é da empresa, então basta a página ter UMA palavra do nome (o site da "Blessy Gelatos e
 *   Doces" se chama "Blessy Benditas Delícias") ou o telefone.
 * - Site quebrado ou domínio estacionado: devolve o endereço mesmo assim (vira "fora do ar", ótimo argumento de
 *   venda), mas só se o próprio domínio tiver uma palavra do nome — "caroline@ducont.com.br" é do contador.
 */
export async function siteFromEmail(email: string, name: string, clues: SiteClues): Promise<string | undefined> {
  const domain = email.split("@")[1]?.toLowerCase().replace(/\.$/, "");
  if (!domain || FREE_MAIL.has(domain) || !isPublicHost(domain)) return undefined;
  const words = candidateDomains(name, clues.country).distinctive.filter((w) => w.length >= 4);
  const domainIsTheirs = words.some((w) => domain.replace(/[^a-z0-9]/g, "").includes(w));

  let resolved = false;
  for (const host of [domain, `www.${domain}`]) {
    if (!(await resolves(host))) continue;
    resolved = true;
    const page = (await probe(`https://${host}`)) ?? (await probe(`http://${host}`));
    if (!page || page.status >= 400 || !page.html) continue;
    const finalHost = getHostname(page.finalUrl);
    if (!finalHost || isSocialHost(finalHost) || isParkedPage(page.html)) continue;
    const text = ` ${normalizeText(page.html.replace(/<[^>]*>/g, " ")).replace(/[^a-z0-9]+/g, " ")} `;
    const nameHit = words.some((w) => text.includes(` ${w} `));
    const digits = page.html.replace(/\D/g, "");
    const phoneHit = clues.phones.some((p) => {
      const tail = p.replace(/\D/g, "").slice(-8);
      return tail.length === 8 && digits.includes(tail);
    });
    if (nameHit || phoneHit) return page.finalUrl.startsWith("https://") ? `https://${host}` : `http://${host}`;
    return undefined; // site no ar, mas de outra empresa
  }
  return resolved && domainIsTheirs ? `https://${domain}` : undefined;
}

/** Site próprio da empresa, ou undefined se não houver um que dê para confirmar. */
export function findOwnWebsite(name: string, clues: SiteClues): Promise<string | undefined> {
  const key = `${normalizeText(name)}|${normalizeText(clues.city ?? "")}|${clues.country}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = search(name, clues).catch(() => undefined);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, pending);
  return pending;
}
