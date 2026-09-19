import { NextRequest } from 'next/server';
import { searchCities } from '@/lib/brCities';

/** Autocomplete de cidades: devolve só as poucas sugestões que casam, em vez de 5.571 municípios para o celular. */
export function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') || '').slice(0, 60);
  return Response.json(searchCities(query, 8), {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
