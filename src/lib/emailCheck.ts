import { isPublicHost } from "./domainValidator";

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
