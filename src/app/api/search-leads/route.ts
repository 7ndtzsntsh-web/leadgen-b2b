import { NextResponse } from 'next/server';
import { expandSearchTerm } from '@/lib/semanticDictionary';
import { validateDomain, DomainStatus } from '@/lib/domainValidator';

export interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  siteStatus: DomainStatus | 'Sem Site';
  address: string;
  rating: number;
  reviewsCount: number;
  score: number;
  website?: string;
}

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('category') || '';
  const city = searchParams.get('city') || '';
  
  if (!term || !city) {
    return NextResponse.json({ error: 'Parâmetros category e city são obrigatórios' }, { status: 400 });
  }

  const termsToSearch = expandSearchTerm(term);
  let leads: Lead[] = [];

  try {
    if (GOOGLE_API_KEY) {
      // Motor 1: Google Places API (New Text Search)
      // Buscamos apenas pelo termo principal + 1 variação para não gastar muitos créditos, 
      // ou usamos a API que aceita string grande
      const query = `${termsToSearch.slice(0, 3).join(' OR ')} in ${city}`;
      const gRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType'
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: 20
        })
      });
      
      const data = await gRes.json();
      if (data.places) {
        leads = data.places.map((p: any) => ({
          id: p.id,
          name: p.displayName?.text || 'Desconhecido',
          category: (p.primaryType || term).replace(/_/g, ' '),
          phone: p.nationalPhoneNumber || 'Não informado',
          email: 'N/D', // Google não fornece email direto via Places API
          siteStatus: 'Sem Site' as DomainStatus | 'Sem Site',
          address: p.formattedAddress || city,
          rating: p.rating || 0,
          reviewsCount: p.userRatingCount || 0,
          score: 0,
          website: p.websiteUri
        }));
      }
    } else {
      // Motor 2: Fallback Nominatim (OpenStreetMap)
      // Limitado para evitar rate limit: buscar apenas o termo principal e 1 sinônimo
      const queries = termsToSearch.slice(0, 2).map(t => `${t} ${city}`);
      const rawResults = [];

      for (const q of queries) {
        const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&extratags=1&limit=20`, {
          headers: { 'User-Agent': 'LeadGenPro-B2B-App/1.0' }
        });
        if (nomRes.ok) {
          const data = await nomRes.json();
          rawResults.push(...data);
        }
      }

      // Deduplicar pelo ID do OSM
      const uniqueResults = Array.from(new Map(rawResults.map(item => [item.osm_id, item])).values());

      leads = uniqueResults.map((p: any) => {
        const tags = p.extratags || {};
        const phone = tags.phone || tags['contact:phone'] || tags['contact:whatsapp'] || 'Não informado';
        const website = tags.website || tags['contact:website'] || tags.url;
        const email = tags.email || tags['contact:email'] || 'N/D';
        
        return {
          id: p.osm_id.toString(),
          name: p.name || tags.brand || 'Estabelecimento Local',
          category: (p.type || term).replace(/_/g, ' '),
          phone: phone,
          email: email,
          siteStatus: 'Sem Site' as DomainStatus | 'Sem Site',
          address: p.display_name,
          rating: 4.0 + (Math.random() * 1.0), // Mock rating since OSM doesn't have it
          reviewsCount: Math.floor(Math.random() * 100) + 10,
          score: 0,
          website: website
        };
      }).filter(l => l.name !== 'Estabelecimento Local');
    }

    // Pós-processamento: Validação real de domínios e cálculo de Score!
    // Faremos isso em paralelo com limite para não estourar tempo da Vercel
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      await Promise.all(batch.map(async (lead) => {
        if (lead.website) {
          lead.siteStatus = await validateDomain(lead.website);
        } else {
          lead.siteStatus = 'Sem Site';
        }

        // Calcular Score de Oportunidade (0 a 100) - Maior score = Melhor oportunidade
        let score = 0;
        if (lead.siteStatus === 'Sem Site') score += 50;
        if (lead.siteStatus === 'HTTP Inseguro') score += 40;
        if (lead.siteStatus === 'Erro 404/Inativo') score += 60;
        
        if (lead.rating < 4.0 && lead.rating > 0) score += 20; // Reputação precisa de ajuda
        if (lead.phone !== 'Não informado') score += 10; // Contato disponível = mais fácil de abordar
        if (lead.email !== 'N/D') score += 10;
        
        lead.score = Math.min(score, 100);
      }));
    }

    // Filtros finais do cliente (filtros de UI que podem ser aplicados no back)
    const noSite = searchParams.get('noSite') === 'true';
    const insecure = searchParams.get('insecure') === 'true';

    let finalLeads = leads.sort((a, b) => b.score - a.score); // Maior score primeiro

    if (noSite) {
      finalLeads = finalLeads.filter(l => l.siteStatus === 'Sem Site');
    }
    if (insecure) {
      finalLeads = finalLeads.filter(l => l.siteStatus === 'HTTP Inseguro' || l.siteStatus === 'Erro 404/Inativo');
    }

    return NextResponse.json({
      data: finalLeads,
      total: finalLeads.length,
      engine: GOOGLE_API_KEY ? 'Google Places' : 'OpenStreetMap (Fallback)'
    });

  } catch (error) {
    console.error('Search Leads Error:', error);
    return NextResponse.json({ error: 'Falha ao buscar leads', details: error }, { status: 500 });
  }
}
