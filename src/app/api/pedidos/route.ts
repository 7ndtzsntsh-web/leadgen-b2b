export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { guardApi } from '@/lib/apiGuard';
import { SOURCE_ORIGIN, siteRequestsFrom, type SiteRequest } from '@/lib/siteRequests';

/**
 * Pedidos de site abertos no 99Freelas (o que é e por que só ele: src/lib/siteRequests.ts).
 * Lê as 5 primeiras páginas da categoria Web (50 projetos, uns 2 a 3 dias) e guarda por 10 minutos: no máximo 5
 * leituras a cada 10 minutos, com um nome de robô honesto. A lista é pública e o robots.txt dela libera /projects.
 */
const PAGES = 5;
const CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'LeadHunter/1.0 (ferramenta interna da Vanguard Web Studio; le a lista publica de projetos)';

interface Feed {
  fetchedAt: number;
  requests: SiteRequest[];
  /** Projetos lidos (de todos os tipos) e páginas que falharam. */
  scanned: number;
  failedPages: number;
}

let cached: Feed | null = null;
let pending: Promise<Feed> | null = null;

async function fetchPage(page: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SOURCE_ORIGIN}/projects?categoria=web-mobile-e-software&page=${page}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: controller.signal,
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadFeed(): Promise<Feed> {
  const pages = await Promise.all(Array.from({ length: PAGES }, (_, i) => fetchPage(i + 1)));
  const byId = new Map<string, SiteRequest>();
  let scanned = 0;
  for (const html of pages) {
    if (!html) continue;
    scanned += (html.match(/class="[^"]*result-item/g) ?? []).length;
    for (const r of siteRequestsFrom(html)) byId.set(r.id, r);
  }
  return {
    fetchedAt: Date.now(),
    requests: [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt),
    scanned,
    failedPages: pages.filter((p) => !p).length,
  };
}

export async function GET(req: NextRequest) {
  const guard = guardApi(req, 'pedidos', 30, 10 * 60_000);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return new Response('Acesso negado', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ error: 'Muitas atualizações seguidas. Espere um pouco.' }, {
      status: 429, headers: { 'Retry-After': String(guard.retryAfterSec), 'Cache-Control': 'no-store' },
    });
  }

  if (!cached || Date.now() - cached.fetchedAt > CACHE_MS) {
    // Várias pessoas abrindo ao mesmo tempo: uma leitura só.
    pending ??= loadFeed().finally(() => { pending = null; });
    const feed = await pending;
    // Tudo falhou: mantém a lista anterior (se houver) em vez de mostrar vazio.
    if (feed.failedPages < PAGES || !cached) cached = feed;
  }

  if (cached.failedPages === PAGES) {
    return Response.json({ error: 'O 99Freelas não respondeu agora. Tente de novo em alguns minutos.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(cached, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
