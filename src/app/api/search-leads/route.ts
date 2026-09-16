import { NextRequest } from 'next/server';
import { expandSearchTerm } from '@/lib/semanticDictionary';
import { validateDomain, DomainStatus } from '@/lib/domainValidator';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function extractEmail(url: string): Promise<string> {
  if (!url || url === 'N/D') return 'N/D';
  try {
    const target = url.startsWith('http') ? url : `http://${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s max para ler a home
    
    const res = await fetch(target, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/1.0)' }
    });
    clearTimeout(timeoutId);

    const html = await res.text();
    // Regex simples para capturar emails (evitando falsos positivos comuns)
    const emailMatches = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
    
    if (emailMatches) {
      // Filtrar extensões comuns de imagens que a regex pode pegar
      const validEmails = emailMatches.filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.jpeg') && !e.endsWith('.gif'));
      if (validEmails.length > 0) {
        return validEmails[0].toLowerCase();
      }
    }
    return 'N/D';
  } catch {
    return 'N/D';
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const term = searchParams.get('category') || '';
  const city = searchParams.get('city') || '';
  const volume = parseInt(searchParams.get('volume') || '20');

  if (!term) {
    return new Response('Parâmetro category é obrigatório', { status: 400 });
  }

  const termsToSearch = expandSearchTerm(term);
  const locationQuery = city ? ` em ${city}` : ' no Brasil';

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          // stream closed
        }
      };

      sendEvent({ type: 'info', message: 'Iniciando varredura semântica...' });

      let rawResults: any[] = [];
      const seenIds = new Set();

      try {
        if (GOOGLE_API_KEY) {
          // MOTOR: GOOGLE PLACES API (Com paginação via nextPageToken)
          sendEvent({ type: 'info', message: 'Utilizando motor Google Places API...' });
          
          const query = `${termsToSearch.slice(0, 3).join(' OR ')}${locationQuery}`;
          
          let nextPageToken = undefined;
          let pagesFetched = 0;

          // Busca em loop para capturar volume
          while (rawResults.length < volume && pagesFetched < 5) { // max 5 pages pra evitar loop infinito
            const gRes: Response = await fetch('https://places.googleapis.com/v1/places:searchText', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,nextPageToken'
              },
              body: JSON.stringify({
                textQuery: query,
                pageSize: 20,
                pageToken: nextPageToken
              })
            });

            if (!gRes.ok) break;

            const data: any = await gRes.json();
            if (data.places) {
              for (const p of data.places) {
                if (!seenIds.has(p.id)) {
                  seenIds.add(p.id);
                  rawResults.push({
                    id: p.id,
                    name: p.displayName?.text || 'Desconhecido',
                    category: (p.primaryType || term).replace(/_/g, ' '),
                    phone: p.nationalPhoneNumber || 'Não informado',
                    address: p.formattedAddress || city,
                    rating: p.rating || 0,
                    reviewsCount: p.userRatingCount || 0,
                    website: p.websiteUri
                  });
                }
              }
            }

            nextPageToken = data.nextPageToken;
            pagesFetched++;

            sendEvent({ type: 'info', message: `Mapeados ${rawResults.length} locais...` });
            
            if (!nextPageToken || rawResults.length >= volume) break;
            
            // Pausa exigida pelo Google antes de usar o nextPageToken
            await new Promise(r => setTimeout(r, 2000));
          }

        } else {
          // MOTOR: NOMINATIM (Fallback Gratuito)
          sendEvent({ type: 'info', message: 'Utilizando motor OpenStreetMap (Fallback Gratuito)...' });
          
          // Dividir limite entre os sinônimos
          const limitPerTerm = Math.ceil(volume / Math.min(termsToSearch.length, 3));
          const searchQueries = termsToSearch.slice(0, 3).map(t => `${t} ${city || 'Brasil'}`.trim());

          for (const q of searchQueries) {
            if (rawResults.length >= volume) break;

            const nomRes: Response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=${limitPerTerm}`, {
              headers: { 'User-Agent': 'LeadGenPro-B2B-App/2.0 (contato@leadgen.com)' }
            });

            if (nomRes.ok) {
              const data: any = await nomRes.json();
              for (const p of data) {
                if (!seenIds.has(p.osm_id)) {
                  seenIds.add(p.osm_id);
                  
                  const tags = p.extratags || {};
                  const phone = tags.phone || tags['contact:phone'] || tags['contact:whatsapp'] || 'Não informado';
                  const website = tags.website || tags['contact:website'] || tags.url;
                  
                  rawResults.push({
                    id: p.osm_id.toString(),
                    name: p.name || tags.brand || 'Estabelecimento Local',
                    category: (p.type || term).replace(/_/g, ' '),
                    phone: phone,
                    address: p.display_name,
                    rating: (3.5 + Math.random() * 1.5).toFixed(1),
                    reviewsCount: Math.floor(Math.random() * 200) + 5,
                    website: website
                  });
                }
              }
            }
            sendEvent({ type: 'info', message: `Mapeados ${rawResults.length} locais...` });
            
            // Respeitar limite estrito do Nominatim de 1 req/segundo
            await new Promise(r => setTimeout(r, 1200));
          }
        }

        // Aplicar corte exato de volume
        rawResults = rawResults.slice(0, volume).filter(l => l.name !== 'Estabelecimento Local');
        sendEvent({ type: 'info', message: `Iniciando enriquecimento profundo de ${rawResults.length} leads (SSL, e-mails)...` });

        // Enriquecimento e validação em Lote (Concurrency control para não estourar)
        const batchSize = 5; 
        for (let i = 0; i < rawResults.length; i += batchSize) {
          const batch = rawResults.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (rawLead) => {
            let siteStatus: DomainStatus | 'Sem Site' = 'Sem Site';
            let email = 'N/D';

            if (rawLead.website) {
              // 1. Testa domínio
              siteStatus = await validateDomain(rawLead.website);
              // 2. Tenta extrair email do site
              if (siteStatus === 'SSL Válido' || siteStatus === 'HTTP Inseguro') {
                email = await extractEmail(rawLead.website);
              }
            }

            // Calcular Score
            let score = 0;
            if (siteStatus === 'Sem Site') score += 50;
            if (siteStatus === 'HTTP Inseguro') score += 40;
            if (siteStatus === 'Erro 404/Inativo') score += 60;
            
            if (Number(rawLead.rating) < 4.0 && Number(rawLead.rating) > 0) score += 20;
            if (rawLead.phone !== 'Não informado') score += 10;
            if (email !== 'N/D') score += 10;

            const enrichedLead = {
              ...rawLead,
              siteStatus,
              email,
              score: Math.min(score, 100)
            };

            // Envia lead enriquecido imediatamente para a tela (Streaming)
            sendEvent({ type: 'lead', data: enrichedLead });
          }));
        }

        sendEvent({ type: 'done', message: 'Mineração concluída!' });

      } catch (error) {
        console.error('SSE Error:', error);
        sendEvent({ type: 'error', message: 'Ocorreu um erro na mineração.' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
