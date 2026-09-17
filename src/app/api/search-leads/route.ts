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
      // Formata como (DD) XXXXXXXX sem separadores desnecessários
      const numFmt = brDigits.slice(2);
      return `(${extractedDDD}) ${numFmt}`; // Exemplo: (11) 945549000
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
  const parts = rawCity.split(' - ');
  const cleanedCity = parts[0].trim();
  const ufSigla = parts.length > 1 ? parts[1].trim() : '';
  const canonicalCity = expandCity(cleanedCity);
  
  // Fila Dinâmica de Cidades
  const locationQueue: { city: string; isExpansion: boolean; queries: string[] }[] = [];
  
  if (canonicalCity) {
    locationQueue.push({
      city: canonicalCity,
      isExpansion: false,
      queries: getCityZones(canonicalCity, country)
    });
    
    const expansions = getExpansionCities(canonicalCity, ufSigla);
    for (const exp of expansions) {
      locationQueue.push({
        city: exp,
        isExpansion: true,
        queries: getCityZones(exp, country) // Foca em todas as zonas comerciais das vizinhas
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch (e) {}
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

          // Pipeline Híbrido: Coleta e Validação em Streaming Contínuo
          if (GOOGLE_API_KEY) {
            sendEvent({ type: 'info', message: `Mapeando micro-zonas e sub-nichos em ${currentLoc.city}...` });

            const fetchTasks: (() => Promise<void>)[] = [];
            
            for (const qZone of currentLoc.queries) {
              for (const nicheTerm of termsToSearch) {
                fetchTasks.push(async () => {
                  if (totalValidStreamed >= volume) return;
                  const query = `${nicheTerm} in ${qZone}`;
                  let nextPageToken = undefined;
                  let pagesFetched = 0;

                  while (pagesFetched < 2) { // 2 páginas rápidas por micro-nicho para fluidez
                    if (totalValidStreamed >= volume) break;
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
                    await new Promise(r => setTimeout(r, 600)); // Delay menor para velocidade
                  }
                });
              }
            }
            
            // Pular processamento de chunks para streaming imediato
            const fetchBatchSize = 4;
            for (let i = 0; i < fetchTasks.length; i += fetchBatchSize) {
              if (totalValidStreamed >= volume) break;
              
              sendEvent({ type: 'info', message: `Minerando quadrantes [Lote ${Math.floor(i/fetchBatchSize)+1}/${Math.ceil(fetchTasks.length/fetchBatchSize)}] em ${currentLoc.city}...` });
              
              const batch = fetchTasks.slice(i, i + fetchBatchSize);
              await Promise.all(batch.map(fn => fn()));

              // VALIDAÇÃO EM TEMPO REAL: Esvazia rawResults e valida o que acabou de ser puxado!
              if (rawResults.length > 0) {
                const unvalidated = rawResults.splice(0, rawResults.length).filter(l => l.name !== 'Estabelecimento Local');
                unvalidated.sort((a, b) => b.reviewsCount - a.reviewsCount);

                const valBatchSize = 25;
                for (let j = 0; j < unvalidated.length; j += valBatchSize) {
                  if (totalValidStreamed >= volume) break;
                  
                  sendEvent({ type: 'info', message: `Validando contatos de ${currentLoc.city}... [${totalValidStreamed}/${volume} limpos]` });

                  const vBatch = unvalidated.slice(j, j + valBatchSize);
                  await Promise.all(vBatch.map(async (rawLead) => {
                    if (totalValidStreamed >= volume) return; 

                    let siteStatus: DomainStatus | 'Sem Site' = 'Sem Site';
                    let email = 'N/D';

                    if (rawLead.website) {
                      siteStatus = await validateDomain(rawLead.website);
                      if (siteStatus === 'SSL Válido' || siteStatus === 'HTTP Inseguro') {
                        email = await extractEmail(rawLead.website);
                      }
                    }

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
                    if (rawLead.reviewsCount > 100) score += 10;

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
              }
            }
          } else {
            sendEvent({ type: 'info', message: `Por favor, insira a chave da API do Google para mineração profunda.` });
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
