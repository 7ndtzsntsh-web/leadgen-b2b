import { NextRequest } from 'next/server';
import { searchCities } from '@/lib/brCities';
import { guardApi } from '@/lib/apiGuard';

/** Autocomplete de cidades: devolve só as poucas sugestões que casam, em vez de 5.571 municípios para o celular. */
export function GET(req: NextRequest) {
  const guard = guardApi(req, 'cities', 300, 10 * 60_000);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return new Response('Acesso negado', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return Response.json([], { status: 429, headers: { 'Retry-After': String(guard.retryAfterSec), 'Cache-Control': 'no-store' } });
  }
  const query = (req.nextUrl.searchParams.get('q') || '').slice(0, 60);
  return Response.json(searchCities(query, 8), {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
