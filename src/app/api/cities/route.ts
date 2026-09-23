import { NextRequest } from 'next/server';
import { searchCities } from '@/lib/brCities';
import { searchUsCities } from '@/lib/usCities';
import { guardApi } from '@/lib/apiGuard';

/** Autocomplete de cidades (Brasil ou EUA): devolve só as poucas sugestões que casam, em vez da lista inteira para o celular. */
export function GET(req: NextRequest) {
  const guard = guardApi(req, 'cities', 300, 10 * 60_000);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return new Response('Acesso negado', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return Response.json([], { status: 429, headers: { 'Retry-After': String(guard.retryAfterSec), 'Cache-Control': 'no-store' } });
  }
  const query = (req.nextUrl.searchParams.get('q') || '').slice(0, 60);
  const suggestions = req.nextUrl.searchParams.get('country') === 'us' ? searchUsCities(query, 8) : searchCities(query, 8);
  return Response.json(suggestions, {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
