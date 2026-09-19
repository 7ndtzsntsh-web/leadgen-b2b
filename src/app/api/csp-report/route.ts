import { NextRequest } from 'next/server';
import { clientIp, rateLimit } from '@/lib/apiGuard';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Recebe os relatórios de violação da Content-Security-Policy enviados pelos navegadores e os registra
 * nos logs da Vercel. Assim, se um CSP bloquear algo em uso real, a gente descobre em vez de o site quebrar em silêncio.
 * Sem armazenamento, corpo limitado e limite por IP para não virar vetor de spam nos logs.
 */
export async function POST(req: NextRequest) {
  const tooBig = Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES;
  if (tooBig || !rateLimit(`csp:${clientIp(req)}`, 60, 10 * 60_000).ok) return new Response(null, { status: 204 });

  try {
    const body = JSON.parse((await req.text()).slice(0, MAX_BODY_BYTES));
    // Formatos: `application/csp-report` ({"csp-report": {...}}) e Reporting API (lista com `body`).
    const report = body?.['csp-report'] ?? (Array.isArray(body) ? body[0]?.body : body?.body) ?? {};
    const clean = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);
    console.warn(
      '[csp-violation]',
      JSON.stringify({
        directive: clean(report['effective-directive'] ?? report.effectiveDirective ?? report['violated-directive']),
        blocked: clean(report['blocked-uri'] ?? report.blockedURL),
        page: clean(report['document-uri'] ?? report.documentURL),
        sample: clean(report['script-sample'] ?? report.sample),
      })
    );
  } catch {
    /* relatório malformado: ignora */
  }
  return new Response(null, { status: 204 });
}
