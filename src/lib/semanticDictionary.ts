export const semanticDictionary: Record<string, Record<string, string[]>> = {
  // Alimentação
  "padaria": {
    "br": ["padaria", "panificadora", "confeitaria", "cafeteria"],
    "us": ["bakery", "pastry shop", "boulangerie", "bread shop", "cafe"],
    "es": ["panadería", "pastelería", "confitería", "cafetería"],
    "pt": ["padaria", "pastelaria", "confeitaria", "cafetaria"]
  },
  "restaurante": {
    "br": ["restaurante", "lanchonete", "bistrô", "pizzaria", "hamburgueria", "churrascaria"],
    "us": ["restaurant", "diner", "bistro", "pizzeria", "burger joint", "steakhouse"],
    "es": ["restaurante", "cafetería", "bistró", "pizzería", "hamburguesería", "asador"],
    "pt": ["restaurante", "snack-bar", "bistrô", "pizzaria", "churrasqueira"]
  },
  "açougue": {
    "br": ["açougue", "casa de carnes", "boutique de carnes", "frigorífico"],
    "us": ["butcher", "butcher shop", "meat market"],
    "es": ["carnicería", "charcutería", "mercado de carnes"],
    "pt": ["talho", "carnificina", "casa de carnes"]
  },
  "supermercado": {
    "br": ["supermercado", "mercado", "mercearia", "minimercado", "hortifruti"],
    "us": ["supermarket", "grocery store", "market", "convenience store", "produce market"],
    "es": ["supermercado", "mercado", "tienda de abarrotes", "frutería"],
    "pt": ["supermercado", "mercado", "mercearia", "minimercado"]
  },
  
  // Saúde e Estética
  "clínica": {
    "br": ["clínica", "consultório", "policlínica", "centro médico"],
    "us": ["clinic", "medical office", "medical center", "health center"],
    "es": ["clínica", "consultorio", "policlínica", "centro médico"],
    "pt": ["clínica", "consultório", "centro médico"]
  },
  "odontologia": {
    "br": ["odontologia", "dentista", "clínica odontológica", "ortodontia"],
    "us": ["dentist", "dental clinic", "orthodontist", "dental care"],
    "es": ["odontología", "dentista", "clínica dental", "ortodoncia"],
    "pt": ["medicina dentária", "dentista", "clínica dentária", "ortodontia"]
  },
  "estética": {
    "br": ["estética", "centro de estética", "spa", "clínica de beleza"],
    "us": ["aesthetic clinic", "beauty salon", "spa", "beauty center"],
    "es": ["estética", "centro de estética", "spa", "clínica de belleza"],
    "pt": ["estética", "centro de estética", "spa", "clínica de beleza"]
  },
  "salão": {
    "br": ["salão de beleza", "cabeleireiro", "barbearia", "esmalteria"],
    "us": ["beauty salon", "hair salon", "barbershop", "nail salon"],
    "es": ["salón de belleza", "peluquería", "barbería", "salón de uñas"],
    "pt": ["salão de beleza", "cabeleireiro", "barbearia"]
  },

  // Serviços e Varejo
  "advocacia": {
    "br": ["advocacia", "escritório de advocacia", "advogado"],
    "us": ["law firm", "lawyer", "attorney", "legal services"],
    "es": ["abogado", "bufete de abogados", "despacho de abogados"],
    "pt": ["escritório de advogados", "advocacia", "advogado"]
  },
  "oficina": {
    "br": ["oficina mecânica", "auto center", "mecânica", "funilaria"],
    "us": ["auto repair", "mechanic", "auto shop", "body shop"],
    "es": ["taller mecánico", "mecánico", "taller de autos", "chapa y pintura"],
    "pt": ["oficina mecânica", "mecânico", "bate-chapas"]
  },
  "imobiliária": {
    "br": ["imobiliária", "corretor de imóveis", "venda de imóveis"],
    "us": ["real estate", "realtor", "property management", "real estate agency"],
    "es": ["inmobiliaria", "bienes raíces", "agente inmobiliario"],
    "pt": ["imobiliária", "agência imobiliária", "mediador imobiliário"]
  }
};

export function expandSearchTerm(term: string, country: string = 'br'): string[] {
  const normalizedTerm = term.toLowerCase().trim();
  
  const matchedKey = Object.keys(semanticDictionary).find(key => 
    key.includes(normalizedTerm) || normalizedTerm.includes(key)
  );

  let expanded = new Set<string>();
  expanded.add(normalizedTerm);

  // Mapear fallback de país para idiomas principais
  const langMap: Record<string, string> = {
    'us': 'us', 'ca': 'us', 'uk': 'us',
    'es': 'es', 'mx': 'es', 'ar': 'es', 'co': 'es',
    'pt': 'pt', 'br': 'br'
  };
  
  const mappedLang = langMap[country] || 'us';

  if (matchedKey && semanticDictionary[matchedKey][mappedLang]) {
    semanticDictionary[matchedKey][mappedLang].forEach(synonym => expanded.add(synonym));
  } else if (matchedKey && semanticDictionary[matchedKey]['us']) {
    // Fallback pra ingles
    semanticDictionary[matchedKey]['us'].forEach(synonym => expanded.add(synonym));
  }

  return Array.from(expanded);
}

export const uiTranslations: Record<string, Record<string, string>> = {
  "br": {
    title: "Motor de prospecção inteligente e contínua em larga escala.",
    niche: "Nicho / Segmento *",
    nichePlaceholder: "Ex: Padaria, Clínica, Advocacia",
    city: "Região / Cidade (Opcional)",
    cityPlaceholder: "Ex: SP, Nordeste ou Brasil",
    onlyNoSite: "Apenas S/ Site",
    onlyInsecure: "Apenas Inseguros",
    volume: "Volume de Captura",
    buttonSearch: "Disparar Mineração",
    buttonStop: "Interromper Busca",
    results: "Resultados em Tempo Real",
    exportCsv: "Exportar CSV",
    copyAll: "Disparar Fila (Copiar Tudo)"
  },
  "pt": {
    title: "Motor de prospeção inteligente e contínua em larga escala.",
    niche: "Nicho / Segmento *",
    nichePlaceholder: "Ex: Pastelaria, Clínica, Advocacia",
    city: "Região / Cidade (Opcional)",
    cityPlaceholder: "Ex: Lisboa, Porto ou Portugal",
    onlyNoSite: "Apenas S/ Site",
    onlyInsecure: "Apenas Inseguros",
    volume: "Volume de Captura",
    buttonSearch: "Iniciar Mineração",
    buttonStop: "Parar Busca",
    results: "Resultados em Tempo Real",
    exportCsv: "Exportar CSV",
    copyAll: "Copiar Tudo (Fila)"
  },
  "us": {
    title: "Intelligent, continuous large-scale prospecting engine.",
    niche: "Niche / Industry *",
    nichePlaceholder: "Ex: Bakery, Clinic, Law Firm",
    city: "Region / City (Optional)",
    cityPlaceholder: "Ex: NY, Texas or USA",
    onlyNoSite: "No Website Only",
    onlyInsecure: "Insecure (HTTP) Only",
    volume: "Capture Volume",
    buttonSearch: "Start Mining",
    buttonStop: "Stop Mining",
    results: "Real-Time Results",
    exportCsv: "Export CSV",
    copyAll: "Copy All Messages"
  },
  "es": {
    title: "Motor de prospección inteligente y continua a gran escala.",
    niche: "Nicho / Sector *",
    nichePlaceholder: "Ej: Panadería, Clínica, Abogados",
    city: "Región / Ciudad (Opcional)",
    cityPlaceholder: "Ej: Madrid, CDMX",
    onlyNoSite: "Solo Sin Web",
    onlyInsecure: "Solo Inseguros",
    volume: "Volumen de Captura",
    buttonSearch: "Iniciar Prospección",
    buttonStop: "Detener Búsqueda",
    results: "Resultados en Tiempo Real",
    exportCsv: "Exportar CSV",
    copyAll: "Copiar Todo"
  }
};
