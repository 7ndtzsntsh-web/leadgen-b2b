export const semanticDictionary: Record<string, Record<string, string[]>> = {
  "padaria": { "br": ["padaria", "panificadora", "confeitaria", "cafeteria", "boulangerie"], "us": ["bakery", "pastry shop", "boulangerie", "bread shop", "cafe"], "es": ["panadería", "pastelería", "confitería", "cafetería"], "pt": ["padaria", "pastelaria", "confeitaria", "cafetaria"] },
  "restaurante": { "br": ["restaurante", "lanchonete", "bistrô", "pizzaria", "hamburgueria", "churrascaria"], "us": ["restaurant", "diner", "bistro", "pizzeria", "burger joint", "steakhouse"], "es": ["restaurante", "cafetería", "bistró", "pizzería", "hamburguesería", "asador"], "pt": ["restaurante", "snack-bar", "bistrô", "pizzaria", "churrasqueira"] },
  "açougue": { "br": ["açougue", "casa de carnes", "boutique de carnes", "frigorífico"], "us": ["butcher", "butcher shop", "meat market"], "es": ["carnicería", "charcutería", "mercado de carnes"], "pt": ["talho", "carnificina", "casa de carnes"] },
  "supermercado": { "br": ["supermercado", "mercado", "mercearia", "minimercado", "hortifruti"], "us": ["supermarket", "grocery store", "market", "convenience store", "produce market"], "es": ["supermercado", "mercado", "tienda de abarrotes", "frutería"], "pt": ["supermercado", "mercado", "mercearia", "minimercado"] },
  "clínica": { "br": ["clínica", "consultório", "policlínica", "centro médico", "hospital"], "us": ["clinic", "medical office", "medical center", "health center"], "es": ["clínica", "consultorio", "policlínica", "centro médico"], "pt": ["clínica", "consultório", "centro médico"] },
  "odontologia": { "br": ["odontologia", "dentista", "clínica odontológica", "ortodontia", "implantes"], "us": ["dentist", "dental clinic", "orthodontist", "dental care"], "es": ["odontología", "dentista", "clínica dental", "ortodoncia"], "pt": ["medicina dentária", "dentista", "clínica dentária", "ortodontia"] },
  "estética": { "br": ["estética", "centro de estética", "spa", "clínica de beleza", "harmonização facial"], "us": ["aesthetic clinic", "beauty salon", "spa", "beauty center"], "es": ["estética", "centro de estética", "spa", "clínica de belleza"], "pt": ["estética", "centro de estética", "spa", "clínica de beleza"] },
  "salão": { "br": ["salão de beleza", "cabeleireiro", "barbearia", "esmalteria", "studio de beleza"], "us": ["beauty salon", "hair salon", "barbershop", "nail salon"], "es": ["salón de belleza", "peluquería", "barbería", "salón de uñas"], "pt": ["salão de beleza", "cabeleireiro", "barbearia"] },
  "advocacia": { "br": ["advocacia", "escritório de advocacia", "advogado", "jurídico"], "us": ["law firm", "lawyer", "attorney", "legal services"], "es": ["abogado", "bufete de abogados", "despacho de abogados"], "pt": ["escritório de advogados", "advocacia", "advogado"] },
  "oficina": { "br": ["oficina mecânica", "auto center", "mecânica", "funilaria", "centro automotivo"], "us": ["auto repair", "mechanic", "auto shop", "body shop"], "es": ["taller mecánico", "mecánico", "taller de autos", "chapa y pintura"], "pt": ["oficina mecânica", "mecânico", "bate-chapas"] },
  "imobiliária": { "br": ["imobiliária", "corretor de imóveis", "venda de imóveis", "incorporadora"], "us": ["real estate", "realtor", "property management", "real estate agency"], "es": ["inmobiliaria", "bienes raíces", "agente inmobiliario"], "pt": ["imobiliária", "agência imobiliária", "mediador imobiliário"] }
};

const cityAliases: Record<string, string> = {
  "sp": "São Paulo", "sampa": "São Paulo", "rj": "Rio de Janeiro", "floripa": "Florianópolis",
  "bh": "Belo Horizonte", "bsb": "Brasília", "df": "Brasília", "cwb": "Curitiba",
  "poa": "Porto Alegre", "ssa": "Salvador", "nyc": "New York", "ny": "New York",
  "la": "Los Angeles", "cdmx": "Ciudad de México", "lisboa": "Lisbon", "porto": "Oporto"
};

// Cidades altamente densas e econômicas ao redor dos grandes centros
const expansionMap: Record<string, string[]> = {
  "São Paulo": ["Guarulhos", "Campinas", "Osasco", "Santo André", "São Bernardo do Campo", "São Caetano do Sul", "Diadema", "Barueri", "Sorocaba", "Jundiaí"],
  "Rio de Janeiro": ["Niterói", "Duque de Caxias", "Nova Iguaçu", "São Gonçalo", "Petrópolis", "Cabo Frio"],
  "Florianópolis": ["São José", "Palhoça", "Biguaçu", "Balneário Camboriú", "Itajaí", "Blumenau", "Joinville", "Criciúma"],
  "Belo Horizonte": ["Contagem", "Betim", "Nova Lima", "Uberlândia", "Juiz de Fora", "Ipatinga"],
  "Curitiba": ["São José dos Pinhais", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "Colombo"],
  "Brasília": ["Taguatinga", "Águas Claras", "Goiânia", "Anápolis", "Aparecida de Goiânia"],
  "Porto Alegre": ["Caxias do Sul", "Canoas", "Novo Hamburgo", "Pelotas", "Santa Maria", "São Leopoldo"],
  "Salvador": ["Lauro de Freitas", "Camaçari", "Feira de Santana", "Vitória da Conquista"],
  "Recife": ["Jaboatão dos Guararapes", "Olinda", "Caruaru", "Paulista"],
  "Fortaleza": ["Caucaia", "Maracanaú", "Sobral", "Juazeiro do Norte"],
  "New York": ["Brooklyn", "Queens", "Jersey City", "Newark", "Yonkers", "Hoboken"],
  "Los Angeles": ["Long Beach", "Anaheim", "Santa Ana", "Irvine", "Glendale"],
  "Miami": ["Fort Lauderdale", "Boca Raton", "West Palm Beach", "Hollywood"],
  "Lisbon": ["Sintra", "Cascais", "Amadora", "Oeiras", "Loures", "Almada"],
  "Oporto": ["Vila Nova de Gaia", "Matosinhos", "Maia", "Gondomar", "Braga"],
  "Ciudad de México": ["Naucalpan", "Tlalnepantla", "Ecatepec", "Nezahualcóyotl", "Toluca"]
};

export function expandCity(cityInput: string): string {
  const normalized = cityInput.toLowerCase().trim();
  return cityAliases[normalized] || cityInput;
}

// Mapeamento de DDDs válidos por estado/cidade para blindar dados geográficos no Brasil
const dddMap: Record<string, string[]> = {
  "são paulo": ["11", "12", "13", "14", "15", "16", "17", "18", "19"],
  "guarulhos": ["11"], "campinas": ["19"], "osasco": ["11"], "santo andré": ["11"], "são bernardo do campo": ["11"], "sorocaba": ["15"],
  "rio de janeiro": ["21", "22", "24"], "niterói": ["21"],
  "florianópolis": ["48"], "são josé": ["48"], "palhoça": ["48"], "balneário camboriú": ["47"], "blumenau": ["47"], "joinville": ["47"], "criciúma": ["48"], "santa catarina": ["47", "48", "49"],
  "belo horizonte": ["31"], "minas gerais": ["31", "32", "33", "34", "35", "37", "38"],
  "curitiba": ["41"], "paraná": ["41", "42", "43", "44", "45", "46"],
  "brasília": ["61"], "goiânia": ["62"], "goiás": ["61", "62", "64"],
  "porto alegre": ["51"], "rio grande do sul": ["51", "53", "54", "55"],
  "salvador": ["71"], "bahia": ["71", "73", "74", "75", "77"],
  "recife": ["81"], "pernambuco": ["81", "87"],
  "fortaleza": ["85"], "ceará": ["85", "88"]
};

export function getValidDDDs(cityInput: string): string[] | null {
  const normalized = cityInput.toLowerCase().trim();
  
  // Tenta achar direto pelo nome da cidade ou estado
  if (dddMap[normalized]) return dddMap[normalized];
  
  // Tenta achar se o nome mapeado contém a palavra (ex: buscar "São Paulo" dentro da chave)
  for (const [key, ddds] of Object.entries(dddMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return ddds;
    }
  }
  
  // Se não tem regra mapeada para a cidade, retorna null para ignorar a trava e ser flexível
  return null;
}

export function getExpansionCities(canonicalCity: string): string[] {
  // Retorna os polos vizinhos em ordem de relevância comercial
  return expansionMap[canonicalCity] || [
    `Região Metropolitana de ${canonicalCity}`,
    `Estado de ${canonicalCity}`
  ];
}

export function expandSearchTerm(term: string, country: string = 'br'): string[] {
  const normalizedTerm = term.toLowerCase().trim();
  const matchedKey = Object.keys(semanticDictionary).find(key => 
    key === normalizedTerm || key.includes(normalizedTerm) || normalizedTerm.includes(key)
  );

  let expanded = new Set<string>();
  expanded.add(normalizedTerm);

  const langMap: Record<string, string> = {
    'us': 'us', 'ca': 'us', 'uk': 'us', 'es': 'es', 'mx': 'es', 'ar': 'es', 'co': 'es', 'pt': 'pt', 'br': 'br'
  };
  const mappedLang = langMap[country] || 'us';

  if (matchedKey && semanticDictionary[matchedKey][mappedLang]) {
    semanticDictionary[matchedKey][mappedLang].forEach(synonym => expanded.add(synonym));
  } else if (matchedKey && semanticDictionary[matchedKey]['us']) {
    semanticDictionary[matchedKey]['us'].forEach(synonym => expanded.add(synonym));
  }

  return Array.from(expanded);
}

export const uiTranslations: Record<string, Record<string, string>> = {
  "br": {
    title: "Motor de prospecção inteligente e contínua em larga escala.",
    niche: "Nicho / Segmento *",
    nichePlaceholder: "Qualquer nicho (Ex: Padaria, Usinagem, TI)",
    city: "Região / Cidade (Opcional)",
    cityPlaceholder: "Ex: SP, Floripa, RJ ou Brasil",
    onlyNoSite: "Apenas S/ Site",
    onlyInsecure: "Apenas Inseguros",
    volume: "Meta de Leads",
    buttonSearch: "Disparar Mineração",
    buttonStop: "Interromper Busca",
    results: "Resultados da Meta",
    exportCsv: "Exportar CSV",
    copyAll: "Disparar Fila (Copiar Tudo)"
  },
  "pt": {
    title: "Motor de prospeção inteligente e contínua em larga escala.",
    niche: "Nicho / Segmento *",
    nichePlaceholder: "Ex: Pastelaria, TI, Usinagem",
    city: "Região / Cidade (Opcional)",
    cityPlaceholder: "Ex: Lisboa, Porto ou Portugal",
    onlyNoSite: "Apenas S/ Site",
    onlyInsecure: "Apenas Inseguros",
    volume: "Meta de Leads",
    buttonSearch: "Iniciar Mineração",
    buttonStop: "Parar Busca",
    results: "Resultados da Meta",
    exportCsv: "Exportar CSV",
    copyAll: "Copiar Tudo (Fila)"
  },
  "us": {
    title: "Intelligent, continuous large-scale prospecting engine.",
    niche: "Niche / Industry *",
    nichePlaceholder: "Any niche (e.g., Bakery, IT, Machining)",
    city: "Region / City (Optional)",
    cityPlaceholder: "e.g., NYC, LA, Texas or USA",
    onlyNoSite: "No Website Only",
    onlyInsecure: "Insecure (HTTP) Only",
    volume: "Lead Quota",
    buttonSearch: "Start Mining",
    buttonStop: "Stop Mining",
    results: "Quota Results",
    exportCsv: "Export CSV",
    copyAll: "Copy All Messages"
  },
  "es": {
    title: "Motor de prospección inteligente y continua a gran escala.",
    niche: "Nicho / Sector *",
    nichePlaceholder: "Cualquier nicho (Ej: Panadería, TI, Mecanizado)",
    city: "Región / Ciudad (Opcional)",
    cityPlaceholder: "Ej: CDMX, Madrid",
    onlyNoSite: "Solo Sin Web",
    onlyInsecure: "Solo Inseguros",
    volume: "Meta de Leads",
    buttonSearch: "Iniciar Prospección",
    buttonStop: "Detener Búsqueda",
    results: "Resultados de Meta",
    exportCsv: "Exportar CSV",
    copyAll: "Copiar Todo"
  }
};
