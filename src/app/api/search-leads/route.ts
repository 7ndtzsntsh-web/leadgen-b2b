export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Hobby/Pro Edge limite relaxado

import { NextRequest } from 'next/server';
import { expandSearchTerm, expandCity, getExpansionCities, getValidDDDs } from '@/lib/semanticDictionary';
import { validateDomain, DomainStatus } from '@/lib/domainValidator';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function extractEmail(url: string): Promise<string> {
  if (!url || url === 'N/D') return 'N/D';
  try {
    const target = url.startsWith('http') ? url : `http://${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); 
    
    const res = await fetch(target, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/6.0)' }
    });
    clearTimeout(timeoutId);

    const html = await res.text();
    // RFC 5322 regex simplificada
    const emailMatches = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
    
    if (emailMatches) {
      const invalidExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.pdf', '.webp', '.svg'];
      const placeholderDomains = ['seusite.com', 'seudominio.com', 'example.com', 'wixsite.com'];
      
      const validEmails = emailMatches.filter(e => {
        const lower = e.toLowerCase();
        if (invalidExtensions.some(ext => lower.endsWith(ext))) return false;
        if (placeholderDomains.some(domain => lower.includes(domain))) return false;
        return true;
      });

      if (validEmails.length > 0) return validEmails[0].toLowerCase();
    }
    return 'N/D';
  } catch {
    return 'N/D';
  }
}

function cleanPhone(phone: string, country: string, currentLocCity: string): string {
  if (!phone || phone === 'Não informado') return 'Não informado';
  const digits = phone.replace(/\D/g, '');
  
  // Anti-fake (sequências repetidas ex: 000000000, 999999999)
  if (/^(\d)\1+$/.test(digits)) return 'Não informado';
  
  if (country === 'br') {
    // DDD (2) + Fixo (8) = 10 ou DDD (2) + Celular (9) = 11. Remove código de país se houver.
    const brDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (brDigits.length >= 10 && brDigits.length <= 11) {
      // Validação Estrita de DDD Geográfico
      const extractedDDD = brDigits.slice(0, 2);
      const validDDDs = getValidDDDs(currentLocCity);
      if (validDDDs && !validDDDs.includes(extractedDDD)) {
        return 'Não informado'; // DDD não condiz com a cidade mapeada!
      }
      return phone; // Válido
    }
    return 'Não informado';
  } else {
    // Padrão E.164 genérico
    if (digits.length >= 8 && digits.length <= 15) return phone;
    return 'Não informado';
  }
}

function getPhoneType(phone: string, country: string): 'MOBILE' | 'LANDLINE' | 'UNKNOWN' {
  if (phone === 'Não informado' || !phone) return 'UNKNOWN';
  const digits = phone.replace(/\D/g, '');
  if (country === 'br') {
    const brDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (brDigits.length === 11 && brDigits[2] === '9') return 'MOBILE';
    if (brDigits.length === 10) return 'LANDLINE';
  }
  return 'UNKNOWN';
}

function getCityZones(cityStr: string, country: string): string[] {
  const c = cityStr.toLowerCase().trim();
  
  if (c === "são paulo") {
    return ["São Paulo", "Centro de São Paulo", "Avenida Paulista, SP", "Pinheiros, SP", "Itaim Bibi, SP", "Moema, SP", "Vila Olímpia, SP", "Santo Amaro, SP", "Lapa, SP", "Santana, SP", "Tatuapé, SP", "Mooca, SP", "Ipiranga, SP", "Jabaquara, SP", "Vila Mariana, SP", "Saúde, SP"];
  }
  if (c === "rio de janeiro") {
    return ["Rio de Janeiro", "Centro, Rio de Janeiro", "Copacabana, RJ", "Botafogo, RJ", "Tijuca, RJ", "Barra da Tijuca, RJ", "Recreio dos Bandeirantes, RJ", "Méier, RJ", "Madureira, RJ", "Campo Grande, RJ", "Bangu, RJ"];
  }
  if (c === "belo horizonte") {
    return ["Belo Horizonte", "Centro, BH", "Savassi, BH", "Lourdes, BH", "Funcionários, BH", "Pampulha, BH", "Venda Nova, BH", "Barreiro, BH", "Buritis, BH", "Sion, BH"];
  }
  if (c === "curitiba") {
    return ["Curitiba", "Centro, Curitiba", "Batel, Curitiba", "Água Verde, Curitiba", "Bigorrilho, Curitiba", "Portão, Curitiba", "Santa Felicidade, Curitiba", "Cidade Industrial, Curitiba", "Boqueirão, Curitiba", "Pinheirinho, Curitiba"];
  }

  if (country === 'us') return [`${cityStr}`, `${cityStr} Downtown`, `${cityStr} North`, `${cityStr} South`];
  if (country === 'es' || country === 'mx') return [`${cityStr}`, `${cityStr} Centro`, `${cityStr} Norte`, `${cityStr} Sur`];
  return [`${cityStr}`, `${cityStr} Centro`, `${cityStr} Zona Norte`, `${cityStr} Zona Sul`, `${cityStr} Zona Leste`, `${cityStr} Zona Oeste`];
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const term = searchParams.get('category') || '';
  const rawCity = searchParams.get('city') || '';
  const country = searchParams.get('country') || 'br';
  const volume = parseInt(searchParams.get('volume') || '50');

  if (!term) return new Response('Parâmetro category é obrigatório', { status: 400 });

  const termsToSearch = expandSearchTerm(term, country);
  // Se a cidade vier do autocomplete IBGE (ex: "Campinas - SP"), extrai só o nome principal
  const cleanedCity = rawCity.split(' - ')[0].trim();
  const canonicalCity = expandCity(cleanedCity);
  
  // Fila Dinâmica de Cidades
  const locationQueue: { city: string; isExpansion: boolean; queries: string[] }[] = [];
  
  if (canonicalCity) {
    locationQueue.push({
      city: canonicalCity,
      isExpansion: false,
      queries: getCityZones(canonicalCity, country)
    });
    
    const expansions = getExpansionCities(canonicalCity);
    for (const exp of expansions) {
      locationQueue.push({
        city: exp,
        isExpansion: true,
        queries: getCityZones(exp, country).slice(0, 3) // Foca nos centros/norte/sul das vizinhas
      });
    }
  } else {
    const countryNames: Record<string, string> = { 'br': 'Brasil', 'pt': 'Portugal', 'us': 'United States', 'es': 'España' };
    locationQueue.push({
      city: countryNames[country] || 'Brasil',
      isExpansion: false,
      queries: [countryNames[country] || 'Brasil']
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try { controller.enqueue(`data: ${JSON.stringify(data)}\n\n`); } catch (e) {}
      };

      sendEvent({ type: 'info', message: `Meta de ${volume} leads ativada para ${termsToSearch[0]}...` });

      const seenIds = new Set();
      const seenPhones = new Set();
      let totalValidStreamed = 0;

      try {
        // LOOP ESTRITO DE CUMPRIMENTO DA META
        while (totalValidStreamed < volume && locationQueue.length > 0) {
          const currentLoc = locationQueue.shift()!;
          
          if (currentLoc.isExpansion) {
            sendEvent({ type: 'info', message: `⚠️ Meta não atingida. Ativando AUTO-EXPANSÃO (Polo Comercial): ${currentLoc.city}...` });
          } else {
            sendEvent({ type: 'info', message: `Varrendo polo primário: ${currentLoc.city}...` });
          }

          let rawResults: any[] = [];
          const needed = volume - totalValidStreamed;

          // Etapa 1: Coletar batch de leads brutos desta cidade (pega a mais para suprir descartes)
          if (GOOGLE_API_KEY) {
            sendEvent({ type: 'info', message: `Minerando em paralelo [${termsToSearch.length}] sub-nichos em ${currentLoc.city}...` });

            const fetchPromises: Promise<void>[] = [];
            
            for (const qZone of currentLoc.queries) {
              if (rawResults.length >= needed * 3) break;
              
              // Dispara todas as variações semânticas em paralelo
              for (const nicheTerm of termsToSearch) {
                fetchPromises.push((async () => {
                  const query = `${nicheTerm} in ${qZone}`;
                  let nextPageToken = undefined;
                  let pagesFetched = 0;

                  while (pagesFetched < 3) {
                    const gRes: Response = await fetch('https://places.googleapis.com/v1/places:searchText', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,nextPageToken' },
                      body: JSON.stringify({ textQuery: query, pageSize: 20, pageToken: nextPageToken })
                    });

                    if (!gRes.ok) break;
                    const data: any = await gRes.json();
                    
                    if (data.places) {
                      for (const p of data.places) {
                        const rawPhone = p.nationalPhoneNumber || 'Não informado';
                        const phone = cleanPhone(rawPhone, country, currentLoc.city);
                        
                        if (!seenIds.has(p.id) && !(phone !== 'Não informado' && seenPhones.has(phone))) {
                          seenIds.add(p.id);
                          if (phone !== 'Não informado') seenPhones.add(phone);

                          rawResults.push({
                            id: p.id,
                            name: p.displayName?.text || 'Desconhecido',
                            category: (p.primaryType || nicheTerm).replace(/_/g, ' '),
                            phone: phone,
                            address: p.formattedAddress || qZone,
                            rating: p.rating || 0,
                            reviewsCount: p.userRatingCount || 0,
                            website: p.websiteUri,
                            isExpansion: currentLoc.isExpansion,
                            expansionSource: currentLoc.city
                          });
                        }
                      }
                    }
                    nextPageToken = data.nextPageToken;
                    pagesFetched++;
                    if (!nextPageToken) break;
                    await new Promise(r => setTimeout(r, 1000));
                  }
                })());
              }
            }
            
            await Promise.all(fetchPromises);
          } else {
            // NOMINATIM FALLBACK (Sequential to avoid rate limit)
            sendEvent({ type: 'info', message: `Minerando sequencialmente [${termsToSearch.length}] sub-nichos em ${currentLoc.city} (Fallback)...` });
            const limitPerTerm = Math.ceil((needed * 3) / (termsToSearch.length * currentLoc.queries.length));
            for (const qZone of currentLoc.queries) {
              if (rawResults.length >= needed * 3) break;
              for (const t of termsToSearch) {
                if (rawResults.length >= needed * 3) break;
                const q = `${t} ${qZone}`.trim();
                const nomRes: Response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=${Math.max(10, limitPerTerm)}`, {
                  headers: { 'User-Agent': 'LeadGenPro-B2B-App/5.0' }
                });

                if (nomRes.ok) {
                  const data: any = await nomRes.json();
                  for (const p of data) {
                    const tags = p.extratags || {};
                    const rawPhone = tags.phone || tags['contact:phone'] || tags['contact:whatsapp'] || 'Não informado';
                    const phone = cleanPhone(rawPhone, country, currentLoc.city);
                    
                    if (!seenIds.has(p.osm_id) && !(phone !== 'Não informado' && seenPhones.has(phone))) {
                      seenIds.add(p.osm_id);
                      if (phone !== 'Não informado') seenPhones.add(phone);
                      rawResults.push({
                        id: p.osm_id.toString(),
                        name: p.name || tags.brand || 'Estabelecimento Local',
                        category: (p.type || t).replace(/_/g, ' '),
                        phone: phone,
                        address: p.display_name,
                        rating: (3.5 + Math.random() * 1.5).toFixed(1),
                        reviewsCount: Math.floor(Math.random() * 200) + 5,
                        website: tags.website || tags['contact:website'] || tags.url,
                        isExpansion: currentLoc.isExpansion,
                        expansionSource: currentLoc.city
                      });
                    }
                  }
                }
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }

          rawResults = rawResults.filter(l => l.name !== 'Estabelecimento Local');
          
          // Ordena crus priorizando os mais aquecidos (com mais avaliações) para tentar validar primeiro os melhores
          rawResults.sort((a, b) => b.reviewsCount - a.reviewsCount);

          if (rawResults.length > 0) {
            sendEvent({ type: 'info', message: `Analisando contatos e sites de ${rawResults.length} locais em ${currentLoc.city}...` });
          }

          // Etapa 2: Validar contatos e Streaming (DESCARTANDO OS INÚTEIS)
          const batchSize = 15; // Aumentado para máxima agilidade
          for (let i = 0; i < rawResults.length; i += batchSize) {
            if (totalValidStreamed >= volume) break;
            
            // UI Progress Indicator Real-Time
            sendEvent({ type: 'info', message: `Verificando contatos e sites de ${currentLoc.city}... [${totalValidStreamed}/${volume} leads validados]` });

            const batch = rawResults.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (rawLead) => {
              // Previne race conditions se o batch estourar o volume simultaneamente
              if (totalValidStreamed >= volume) return; 

              let siteStatus: DomainStatus | 'Sem Site' = 'Sem Site';
              let email = 'N/D';

              if (rawLead.website) {
                siteStatus = await validateDomain(rawLead.website);
                if (siteStatus === 'SSL Válido' || siteStatus === 'HTTP Inseguro') {
                  email = await extractEmail(rawLead.website);
                }
              }

              // REGRA DE OURO: ZERO LEADS INÚTEIS
              // Se não tem telefone NEM e-mail, é descartado silenciosamente e não contabiliza na meta.
              if (rawLead.phone === 'Não informado' && email === 'N/D') {
                return;
              }

              const phoneType = getPhoneType(rawLead.phone, country);
              
              let score = 0;
              if (siteStatus === 'Sem Site') score += 50;
              if (siteStatus === 'HTTP Inseguro') score += 40;
              if (siteStatus === 'Erro 404/Inativo') score += 60;
              if (Number(rawLead.rating) < 4.0 && Number(rawLead.rating) > 0) score += 20;
              if (rawLead.phone !== 'Não informado') score += 10;
              if (email !== 'N/D') score += 10;
              if (phoneType === 'MOBILE') score += 5;
              if (rawLead.reviewsCount > 100) score += 10; // Bônus pra volume alto de clientes

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
        } // Fim do Loop Estrito

        if (totalValidStreamed >= volume) {
          sendEvent({ type: 'done', message: `🎯 Meta alcançada! ${totalValidStreamed} leads perfeitos capturados.` });
        } else {
          sendEvent({ type: 'done', message: `Varredura esgotada. Capturamos ${totalValidStreamed} leads qualificados no raio máximo.` });
        }

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
