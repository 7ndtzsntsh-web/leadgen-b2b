import { NextResponse } from 'next/server';

export interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  siteStatus: 'Sem Site' | 'HTTP Inseguro' | 'SSL Válido' | 'Erro 404/Inativo';
  address: string;
  rating: number;
  reviewsCount: number;
  score: number;
  website?: string;
}

const mockLeads: Lead[] = [
  {
    id: '1',
    name: 'OdontoPrime Clínica',
    category: 'Clínica Odontológica',
    phone: '5511945549000',
    email: 'contato@odontoprime.com.br',
    siteStatus: 'Sem Site',
    address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
    rating: 4.8,
    reviewsCount: 124,
    score: 95,
  },
  {
    id: '2',
    name: 'Restaurante Sabor de Casa',
    category: 'Restaurantes',
    phone: '5511987654321',
    email: 'N/D',
    siteStatus: 'HTTP Inseguro',
    address: 'Rua Augusta, 500 - Consolação, São Paulo - SP, 01304-001',
    rating: 4.2,
    reviewsCount: 56,
    score: 70,
    website: 'http://sabordecasa.com.br',
  },
  {
    id: '3',
    name: 'Barbearia Vintage',
    category: 'Barbearias',
    phone: '5521998877665',
    email: 'vintage@barbearia.com',
    siteStatus: 'Erro 404/Inativo',
    address: 'Rua das Laranjeiras, 150 - Laranjeiras, Rio de Janeiro - RJ',
    rating: 4.9,
    reviewsCount: 200,
    score: 85,
    website: 'https://barbeariavintage.com.br',
  },
  {
    id: '4',
    name: 'Silva & Associados Advocacia',
    category: 'Escritórios de Advocacia',
    phone: '5531912345678',
    email: 'contato@silvaassociados.com.br',
    siteStatus: 'SSL Válido',
    address: 'Av. Afonso Pena, 2000 - Centro, Belo Horizonte - MG',
    rating: 3.5,
    reviewsCount: 12,
    score: 40,
    website: 'https://silvaassociados.com.br',
  },
  {
    id: '5',
    name: 'Contabilidade Express',
    category: 'Contabilidade',
    phone: '5541999998888',
    email: 'contato@contabilidadeexpress.com.br',
    siteStatus: 'Sem Site',
    address: 'Rua XV de Novembro, 100 - Centro, Curitiba - PR',
    rating: 4.0,
    reviewsCount: 34,
    score: 90,
  }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category')?.toLowerCase();
  const noSite = searchParams.get('noSite') === 'true';
  const insecure = searchParams.get('insecure') === 'true';
  const badMobile = searchParams.get('badMobile') === 'true'; // Mock for now

  let filtered = [...mockLeads];

  if (category) {
    filtered = filtered.filter(lead => lead.category.toLowerCase().includes(category));
  }

  if (noSite) {
    filtered = filtered.filter(lead => lead.siteStatus === 'Sem Site');
  }

  if (insecure) {
    filtered = filtered.filter(lead => lead.siteStatus === 'HTTP Inseguro');
  }

  return NextResponse.json({
    data: filtered,
    total: filtered.length
  });
}
