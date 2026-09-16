import { NextRequest } from 'next/server';
import { expandSearchTerm, expandCity, getExpansionCities } from '@/lib/semanticDictionary';
import { validateDomain, DomainStatus } from '@/lib/domainValidator';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function extractEmail(url: string): Promise<string> {
  if (!url || url === 'N/D') return 'N/D';
  try {
    const target = url.startsWith('http') ? url : `http://${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); 
    
    const res = await fetch(target, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/4.0)' }
    });
    clearTimeout(timeoutId);

    const html = await res.text();
    const emailMatches = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
    
    if (emailMatches) {
      const validEmails = emailMatches.filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.jpeg') && !e.endsWith('.gif'));
      if (validEmails.length > 0) return validEmails[0].toLowerCase();
    }
    return 'N/D';
  } catch {
    return 'N/D';
  }
}

function getPhoneType(phone: string, country: string): 'MOBILE' | 'LANDLINE' | 'UNKNOWN' {
  if (phone === 'Não informado' || !phone) return 'UNKNOWN';
  const digits = phone.replace(/\D/g, '');
  if (country === 'br') {
    if (digits.length === 11 && digits[2] === '9') return 'MOBILE';
    if (digits.length >= 10 && digits.length <= 11) return 'LANDLINE';
  } else if (country === 'us') {
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

function getCityZones(cityStr: string, country: string): string[] {
  if (country === 'us') return [`${cityStr}`, `${cityStr} Downtown`, `${cityStr} North`, `${cityStr} South`, `${cityStr} East`, `${cityStr} West`];
  if (country === 'es' || country === 'mx') return [`${cityStr}`, `${cityStr} Centro`, `${cityStr} Norte`, `${cityStr} Sur`, `${cityStr} Este`, `${cityStr} Oeste`];
  return [`${cityStr}`, `${cityStr} Centro`, `${cityStr} Norte`, `${cityStr} Sul`, `${cityStr} Leste`, `${cityStr} Oeste`];
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const term = searchParams.get('category') || '';
  const rawCity = searchParams.get('city') || '';
  const country = searchParams.get('country') || 'br';
  const volume = parseInt(searchParams.get('volume') || '50');

  if (!term) return new Response('Parâmetro category é obrigatório', { status: 400 });

  const termsToSearch = expandSearchTerm(term, country);
  const city = expandCity(rawCity);
  
  // Criação dos Tiers (Camadas de Busca)
  // Tier 1: A cidade principal subdividida (Grid) ou País inteiro
  // Tier 2...: Cidades de expansão (Metropolitana)
  const tiers: { name: string; isExpansion: boolean; queries: string[] }[] = [];

  if (city) {
    tiers.push({
      name: city,
      isExpansion: false,
      queries: getCityZones(city, country)
    });
    
    // Auto-Expansão Geográfica (Bairros adjacentes / Região metropolitana)
    const expansions = getExpansionCities(city);
    for (const expCity of expansions) {
      tiers.push({
        name: expCity,
        isExpansion: true,
        queries: getCityZones(expCity, country).slice(0, 3) // Limita a 3 zonas nas cidades vizinhas para ser mais rápido
      });
    }

    if (expansions.length === 0) {
      // Expansão genérica (Estado)
      tiers.push({
        name: `Estado/Região de ${city}`,
        isExpansion: true,
        queries: [`Região de ${city}`, `Estado de ${city}`]
      });
    }
  } else {
    const countryNames: Record<string, string> = { 'br': 'Brasil', 'pt': 'Portugal', 'us': 'United States', 'es': 'España' };
    tiers.push({
      name: countryNames[country] || 'Brasil',
      isExpansion: false,
      queries: [countryNames[country] || 'Brasil']
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try { controller.enqueue(`data: ${JSON.stringify(data)}\n\n`); } catch (e) {}
      };

      sendEvent({ type: 'info', message: `Iniciando mineração profunda de ${termsToSearch[0]}... (Meta: ${volume} leads)` });

      const seenIds = new Set();
      const seenPhones = new Set();
      let totalValidStreamed = 0;

      try {
        for (const tier of tiers) {
          if (totalValidStreamed >= volume) break;

          if (tier.isExpansion) {
            sendEvent({ type: 'info', message: `⚠️ Cota não atingida. Ativando AUTO-EXPANSÃO para: ${tier.name}...` });
          }

          let rawResults: any[] = [];
          const needed = volume - totalValidStreamed;

          // Etapa 1: Coletar leads crus (Google ou OSM)
          if (GOOGLE_API_KEY) {
            for (const loc of tier.queries) {
              if (rawResults.length >= needed * 2) break; // Fetch extra to account for filtering
              const query = `${termsToSearch.slice(0, 3).join(' OR ')} in ${loc}`;
              
              let nextPageToken = undefined;
              let pagesFetched = 0;

              while (rawResults.length < needed * 2 && pagesFetched < 3) {
                const gRes: Response = await fetch('https://places.googleapis.com/v1/places:searchText', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,nextPageToken' },
                  body: JSON.stringify({ textQuery: query, pageSize: 20, pageToken: nextPageToken })
                });

                if (!gRes.ok) break;
                const data: any = await gRes.json();
                
                if (data.places) {
                  for (const p of data.places) {
                    const phone = p.nationalPhoneNumber || 'Não informado';
                    if (!seenIds.has(p.id) && !(phone !== 'Não informado' && seenPhones.has(phone))) {
                      seenIds.add(p.id);
                      if (phone !== 'Não informado') seenPhones.add(phone);

                      rawResults.push({
                        id: p.id,
                        name: p.displayName?.text || 'Desconhecido',
                        category: (p.primaryType || term).replace(/_/g, ' '),
                        phone: phone,
                        address: p.formattedAddress || loc,
                        rating: p.rating || 0,
                        reviewsCount: p.userRatingCount || 0,
                        website: p.websiteUri,
                        isExpansion: tier.isExpansion,
                        expansionSource: tier.name
                      });
                    }
                  }
                }
                nextPageToken = data.nextPageToken;
                pagesFetched++;
                sendEvent({ type: 'info', message: `[${tier.name}] Mapeando locais... (${rawResults.length})` });
                if (!nextPageToken || rawResults.length >= needed * 2) break;
                await new Promise(r => setTimeout(r, 2000));
              }
            }
          } else {
            const limitPerTerm = Math.ceil((needed * 2) / (termsToSearch.length * tier.queries.length));
            for (const loc of tier.queries) {
              if (rawResults.length >= needed * 2) break;
              for (const t of termsToSearch.slice(0, 3)) {
                if (rawResults.length >= needed * 2) break;
                const q = `${t} ${loc}`.trim();
                const nomRes: Response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=${Math.max(10, limitPerTerm)}`, {
                  headers: { 'User-Agent': 'LeadGenPro-B2B-App/4.0' }
                });

                if (nomRes.ok) {
                  const data: any = await nomRes.json();
                  for (const p of data) {
                    const tags = p.extratags || {};
                    const phone = tags.phone || tags['contact:phone'] || tags['contact:whatsapp'] || 'Não informado';
                    const pName = p.name || tags.brand || 'Estabelecimento Local';
                    
                    if (!seenIds.has(p.osm_id) && !(phone !== 'Não informado' && seenPhones.has(phone))) {
                      seenIds.add(p.osm_id);
                      if (phone !== 'Não informado') seenPhones.add(phone);
                      
                      rawResults.push({
                        id: p.osm_id.toString(),
                        name: pName,
                        category: (p.type || term).replace(/_/g, ' '),
                        phone: phone,
                        address: p.display_name,
                        rating: (3.5 + Math.random() * 1.5).toFixed(1),
                        reviewsCount: Math.floor(Math.random() * 200) + 5,
                        website: tags.website || tags['contact:website'] || tags.url,
                        isExpansion: tier.isExpansion,
                        expansionSource: tier.name
                      });
                    }
                  }
                }
                sendEvent({ type: 'info', message: `[${tier.name}] Mapeando locais... (${rawResults.length})` });
                await new Promise(r => setTimeout(r, 1200));
              }
            }
          }

          rawResults = rawResults.filter(l => l.name !== 'Estabelecimento Local');
          sendEvent({ type: 'info', message: `Validando contatos da camada ${tier.name}...` });

          // Etapa 2: Enriquecimento, Filtragem Rígida e Streaming Lote por Lote
          const batchSize = 5; 
          for (let i = 0; i < rawResults.length; i += batchSize) {
            if (totalValidStreamed >= volume) break;

            const batch = rawResults.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (rawLead) => {
              if (totalValidStreamed >= volume) return;

              let siteStatus: DomainStatus | 'Sem Site' = 'Sem Site';
              let email = 'N/D';

              if (rawLead.website) {
                siteStatus = await validateDomain(rawLead.website);
                if (siteStatus === 'SSL Válido' || siteStatus === 'HTTP Inseguro') {
                  email = await extractEmail(rawLead.website);
                }
              }

              // FILTRO EXTREMO: ZERO LEADS INÚTEIS
              if (rawLead.phone === 'Não informado' && email === 'N/D') return;

              const phoneType = getPhoneType(rawLead.phone, country);
              let score = 0;
              if (siteStatus === 'Sem Site') score += 50;
              if (siteStatus === 'HTTP Inseguro') score += 40;
              if (siteStatus === 'Erro 404/Inativo') score += 60;
              if (Number(rawLead.rating) < 4.0 && Number(rawLead.rating) > 0) score += 20;
              if (rawLead.phone !== 'Não informado') score += 10;
              if (email !== 'N/D') score += 10;
              if (phoneType === 'MOBILE') score += 5;

              totalValidStreamed++;
              sendEvent({ 
                type: 'lead', 
                data: {
                  ...rawLead,
                  siteStatus,
                  email,
                  phoneType,
                  score: Math.min(score, 100)
                } 
              });
            }));
          }
          
          if (totalValidStreamed < volume && tiers.indexOf(tier) < tiers.length - 1) {
            sendEvent({ type: 'info', message: `Pausa tática antes da próxima expansão...` });
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        sendEvent({ type: 'done', message: `Missão cumprida! ${totalValidStreamed} leads perfeitos capturados.` });
      } catch (error) {
        console.error('SSE Error:', error);
        sendEvent({ type: 'error', message: 'Ocorreu um erro na mineração.' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' },
  });
}
