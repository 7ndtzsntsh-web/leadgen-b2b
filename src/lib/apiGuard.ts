/**
 * Proteções das rotas de API (busca e autocomplete). A busca gasta a cota paga do Google Places, e o site
 * de produção é público, então é preciso impedir uso por terceiros e loops de automação.
 *
 * - Origem: em produção só aceita chamadas feitas pelo próprio site (o navegador envia `Sec-Fetch-Site`,
 *   que scripts de outros sites não conseguem forjar).
 * - Limite por visitante (IP) e limite de buscas simultâneas.
 *
 * O estado fica na memória da instância (edge/serverless): é uma proteção "melhor esforço". O limite firme
 * deve ficar no provedor (cota e alerta de orçamento no Google Cloud; regra de rate limit no firewall da Vercel).
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'limited'; retryAfterSec: number };

const RETENTION_MS = 60 * 60_000;
const MAX_TRACKED_KEYS = 5000;

const hitsByKey = new Map<string, number[]>();
const activeByKey = new Map<string, number>();

/** IP do visitante. Na Vercel o `x-forwarded-for` é definido pela plataforma (o cliente não consegue forjá-lo). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

/** A requisição partiu de uma página do próprio site? Sem cabeçalho de origem, considera-se que não. */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';

  // Navegadores antigos sem Sec-Fetch-*: compara Origin/Referer com o host da requisição.
  const source = req.headers.get('origin') ?? req.headers.get('referer');
  if (!source) return false;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/** Janela deslizante: no máximo `limit` chamadas por `windowMs` para a mesma chave. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): GuardResult {
  const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    hitsByKey.set(key, hits);
    return { ok: false, reason: 'limited', retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }
  hits.push(now);
  hitsByKey.set(key, hits);
  if (hitsByKey.size > MAX_TRACKED_KEYS) pruneOldKeys(now);
  return { ok: true };
}

function pruneOldKeys(now: number): void {
  for (const [key, hits] of hitsByKey) {
    if (hits.length === 0 || now - hits[hits.length - 1] > RETENTION_MS) hitsByKey.delete(key);
  }
  // Ainda cheio (ataque com muitos IPs): descarta os mais antigos para a memória não crescer sem limite.
  if (hitsByKey.size > MAX_TRACKED_KEYS) {
    for (const key of Array.from(hitsByKey.keys()).slice(0, hitsByKey.size - MAX_TRACKED_KEYS / 2)) hitsByKey.delete(key);
  }
}

/** Verificação padrão de uma rota: origem (só em produção) e limite por IP. */
export function guardApi(req: Request, name: string, limit: number, windowMs: number): GuardResult {
  if (process.env.NODE_ENV === 'production' && !isSameOriginRequest(req)) return { ok: false, reason: 'forbidden' };
  return rateLimit(`${name}:${clientIp(req)}`, limit, windowMs);
}

/** Reserva uma vaga de execução simultânea. Devolve a função que a libera, ou null se o IP já está no limite. */
export function acquireSlot(req: Request, name: string, max: number): (() => void) | null {
  const key = `${name}:${clientIp(req)}`;
  const current = activeByKey.get(key) ?? 0;
  if (current >= max) return null;
  activeByKey.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (activeByKey.get(key) ?? 1) - 1;
    if (left <= 0) activeByKey.delete(key);
    else activeByKey.set(key, left);
  };
}

/** Só para testes. */
export function resetGuardState(): void {
  hitsByKey.clear();
  activeByKey.clear();
}
