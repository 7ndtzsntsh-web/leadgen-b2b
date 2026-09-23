import { isPublicHost } from "./domainValidator";
import { normalizeText } from "./text";

export type EmailDomainStatus = "ok" | "invalid" | "unknown";

export const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];
export const DOH_TIMEOUT_MS = 3000;
const MAX_CACHE = 2000;

const EMAIL_SHAPE = /^[a-z0-9._%+-]{1,64}@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)$/i;
const cache = new Map<string, Promise<EmailDomainStatus>>();

interface DohAnswer { type: number; data: string }
interface DohResponse { Status: number; Answer?: DohAnswer[] }

async function queryMx(domain: string): Promise<EmailDomainStatus> {
  for (const endpoint of DOH_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
    try {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(domain)}&type=MX`, {
        headers: { accept: "application/dns-json" },
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as DohResponse;
      if (data.Status === 3) return "invalid"; // NXDOMAIN: o domínio não existe
      if (data.Status !== 0) continue; // falha do resolvedor: tenta o próximo
      // MX "0 ." (RFC 7505) declara que o domínio NÃO recebe e-mail.
      const servers = (data.Answer ?? []).filter((a) => a.type === 15 && !/^\d+\s+\.?$/.test(a.data.trim()));
      return servers.length > 0 ? "ok" : "invalid";
    } catch {
      /* tenta o próximo resolvedor */
    } finally {
      clearTimeout(timer);
    }
  }
  return "unknown"; // não foi possível checar (rede/resolvedor): não descarta, mas o lead não fica "verificado"
}

// Provedores grátis mais usados e nomes parecidos que são OUTROS provedores de verdade (esses não são corrigidos).
const MAIL_PROVIDERS = ["gmail", "hotmail", "outlook", "yahoo", "icloud"];
const OTHER_PROVIDERS = new Set(["mail", "email", "ymail", "gmx"]);
// Final digitado errado no lugar de ".com" ("gmail.con", "hotmail.co").
const COM_TYPOS = new Set(["co", "con", "cm", "om", "comm", "cpm", "vom", "xom", "cim", "cmo", "ocm", "coom", "comn"]);

/** Distância de edição (Damerau: troca de duas letras vizinhas conta 1), limitada a palavras curtas. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Corrige o provedor digitado errado no cadastro ("gamil.com", "hotmial.com", "gmail.con", "gmail.com."): eram
 * milhares nos dados, e a mensagem iria para o domínio de outra pessoa (há quem registre esses domínios para receber
 * e-mail alheio). Só mexe em nome a uma letra de Gmail, Hotmail, Outlook, Yahoo ou iCloud que não seja outro
 * provedor de verdade (ymail, mail.com, email.com). O resto fica como veio.
 */
export function fixEmailTypo(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.{2,}/g, ".").replace(/[^a-z0-9]+$/, "");
  const dot = domain.indexOf(".");
  if (dot < 1) return `${local}@${domain}`;
  let name = domain.slice(0, dot);
  let tld = domain.slice(dot + 1);
  if (name.length >= 4 && !OTHER_PROVIDERS.has(name) && !MAIL_PROVIDERS.includes(name)) {
    const close = MAIL_PROVIDERS.filter((p) => editDistance(name, p) === 1);
    if (close.length === 1) name = close[0];
  }
  if (MAIL_PROVIDERS.includes(name) && COM_TYPOS.has(tld)) tld = "com";
  return `${local}@${name}.${tld}`;
}

// E-mail do escritório de contabilidade que abriu a empresa ("contabilidademarcal@...", "joao.contador@..."): na
// Receita são milhares. A mensagem de venda iria para o contador. Empresa que É de contabilidade fica com o dela.
const ACCOUNTANT = /contab|contador|escritorio|legaliza/;

export function isAccountantEmail(email: string, companyName: string): boolean {
  return ACCOUNTANT.test(email.toLowerCase()) && !ACCOUNTANT.test(normalizeText(companyName).replace(/\s+/g, ""));
}

/**
 * Confere se o domínio do e-mail existe e tem servidor de e-mail (registro MX) por DNS-sobre-HTTPS.
 * Não prova que a caixa postal existe (isso exigiria SMTP), mas elimina domínios inexistentes,
 * digitados errados ou que não recebem e-mail.
 */
export function checkEmailDomain(email: string): Promise<EmailDomainStatus> {
  const match = EMAIL_SHAPE.exec(email.trim());
  if (!match) return Promise.resolve("invalid");
  const domain = match[1].toLowerCase();
  if (!isPublicHost(domain)) return Promise.resolve("invalid");

  const cached = cache.get(domain);
  if (cached) return cached;

  const pending = queryMx(domain);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(domain, pending);
  // Não guarda falha temporária: da próxima vez tenta de novo.
  pending.then((status) => { if (status === "unknown") cache.delete(domain); });
  return pending;
}
