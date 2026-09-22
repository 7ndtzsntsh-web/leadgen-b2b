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

export interface DomainCandidates {
  hosts: string[];
  /** Palavras que identificam a empresa e precisam aparecer na página. */
  distinctive: string[];
  /** O endereço é o nome completo de mais de uma palavra ("pizzariabasilico"): específico o bastante para aceitar a cidade. */
  composite: boolean;
}

/** Endereços prováveis a partir do nome e as palavras que identificam a empresa. */
export function candidateDomains(name: string, country: string): DomainCandidates {
  const words = normalizeText(name).replace(/['’`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const distinctive = words.filter((w) => w.length >= 3 && !GENERIC.has(w));
  const slug = words.join("");
  const composite = words.length >= 2;
  if (distinctive.length === 0 || slug.length < 6 || slug.length > 40) return { hosts: [], distinctive, composite };
  return { hosts: (TLDS[country] ?? [".com"]).map((tld) => `${slug}${tld}`), distinctive, composite };
}

/**
 * A página é mesmo desta empresa: nome (palavras inteiras) + telefone; ou nome + cidade quando o endereço é o
 * nome completo de mais de uma palavra. Nome de uma palavra só ("milano.com") precisa do telefone.
 */
export function pageBelongsTo(html: string, { distinctive, composite }: Omit<DomainCandidates, "hosts">, clues: SiteClues): boolean {
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
  const { hosts, ...identity } = candidateDomains(name, clues.country);
  for (const host of hosts) {
    if (!isPublicHost(host) || !(await resolves(host))) continue;
    const page = (await probe(`https://${host}`)) ?? (await probe(`http://${host}`));
    if (!page || page.status >= 400 || !page.html) continue;
    const finalHost = getHostname(page.finalUrl);
    if (!finalHost || isSocialHost(finalHost) || isParkedPage(page.html)) continue;
    if (pageBelongsTo(page.html, identity, clues)) return page.finalUrl.startsWith("https://") ? `https://${host}` : `http://${host}`;
  }
  return undefined;
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
