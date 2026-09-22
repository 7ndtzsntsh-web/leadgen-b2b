import { normalizeText } from "./text";

type Lang = "br" | "us" | "es" | "pt";

export const semanticDictionary: Record<string, Partial<Record<Lang, string[]>>> = {
  "padaria": { br: ["padaria", "panificadora", "confeitaria", "cafeteria", "boulangerie"], us: ["bakery", "pastry shop", "boulangerie", "bread shop", "cafe"], es: ["panadería", "pastelería", "confitería", "cafetería"], pt: ["padaria", "pastelaria", "confeitaria", "cafetaria"] },
  "restaurante": { br: ["restaurante", "lanchonete", "bistrô", "pizzaria", "hamburgueria", "churrascaria"], us: ["restaurant", "diner", "bistro", "pizzeria", "burger joint", "steakhouse"], es: ["restaurante", "cafetería", "bistró", "pizzería", "hamburguesería", "asador"], pt: ["restaurante", "snack-bar", "bistrô", "pizzaria", "churrasqueira"] },
  "açougue": { br: ["açougue", "casa de carnes", "boutique de carnes"], us: ["butcher", "butcher shop", "meat market"], es: ["carnicería", "charcutería", "mercado de carnes"], pt: ["talho", "carnificina", "casa de carnes"] },
  "supermercado": { br: ["supermercado", "mercado", "mercearia", "minimercado", "hortifruti"], us: ["supermarket", "grocery store", "market", "convenience store", "produce market"], es: ["supermercado", "mercado", "tienda de abarrotes", "frutería"], pt: ["supermercado", "mercado", "mercearia", "minimercado"] },
  "clínica": { br: ["clínica", "consultório", "policlínica", "centro médico"], us: ["clinic", "medical office", "medical center", "health center"], es: ["clínica", "consultorio", "policlínica", "centro médico"], pt: ["clínica", "consultório", "centro médico"] },
  "odontologia": { br: ["odontologia", "dentista", "clínica odontológica", "ortodontia", "implantes"], us: ["dentist", "dental clinic", "orthodontist", "dental care"], es: ["odontología", "dentista", "clínica dental", "ortodoncia"], pt: ["medicina dentária", "dentista", "clínica dentária", "ortodontia"] },
  "estética": { br: ["estética", "centro de estética", "spa", "clínica de beleza", "harmonização facial", "biomedicina estética", "depilação a laser"], us: ["aesthetic clinic", "beauty salon", "spa", "laser hair removal"], es: ["estética", "centro de estética", "spa", "clínica de belleza"], pt: ["estética", "centro de estética", "spa", "clínica de beleza"] },
  "salão": { br: ["salão de beleza", "cabeleireiro", "barbearia", "esmalteria", "studio de beleza"], us: ["beauty salon", "hair salon", "barbershop", "nail salon"], es: ["salón de belleza", "peluquería", "barbería", "salón de uñas"], pt: ["salão de beleza", "cabeleireiro", "barbearia"] },
  "advocacia": { br: ["advocacia", "escritório de advocacia", "advogado", "jurídico"], us: ["law firm", "lawyer", "attorney", "legal services"], es: ["abogado", "bufete de abogados", "despacho de abogados"], pt: ["escritório de advogados", "advocacia", "advogado"] },
  "oficina": { br: ["oficina mecânica", "auto center", "mecânica", "funilaria", "centro automotivo", "borracharia", "autopeças"], us: ["auto repair", "mechanic", "auto shop", "body shop"], es: ["taller mecánico", "mecánico", "taller de autos", "chapa y pintura"], pt: ["oficina mecânica", "mecânico", "bate-chapas"] },
  "imobiliária": { br: ["imobiliária", "corretor de imóveis", "venda de imóveis", "incorporadora"], us: ["real estate", "realtor", "property management", "real estate agency"], es: ["inmobiliaria", "bienes raíces", "agente inmobiliario"], pt: ["imobiliária", "agência imobiliária", "mediador imobiliário"] },
  "energia solar": { br: ["energia solar", "painel solar", "energia fotovoltaica", "instalador solar", "engenharia elétrica"], us: ["solar energy", "solar panel", "photovoltaic", "solar installer"], es: ["energía solar", "panel solar", "fotovoltaica", "instalador solar"], pt: ["energia solar", "painel solar", "energia fotovoltaica"] },
  "serralheria": { br: ["serralheria", "estruturas metálicas", "portões de alumínio", "vidraçaria", "soldador", "esquadrias"], us: ["locksmith", "metal structures", "metalworking", "welder"], es: ["cerrajería", "estructuras metálicas", "vidriería", "soldador"], pt: ["serralharia", "estruturas metálicas", "soldador"] },
  "usinagem": { br: ["usinagem", "tornearia", "corte a laser", "metalúrgica", "ferramentaria", "caldeiraria", "cnc"], us: ["machining", "metalworking", "laser cutting", "cnc machining"], es: ["mecanizado", "metalurgia", "corte láser"], pt: ["usinagem", "metalúrgica", "corte a laser"] },
  "logística": { br: ["logística", "transportadora", "frete", "distribuidora", "armazém", "galpão logístico"], us: ["logistics", "freight", "transportation", "warehouse"], es: ["logística", "transporte", "distribuidora"], pt: ["logística", "transportadora", "armazém"] },
  "contabilidade": { br: ["contabilidade", "escritório contábil", "contador", "assessoria contábil"], us: ["accounting", "cpa", "bookkeeping", "accountant"], es: ["contabilidad", "contador", "asesoría contable"], pt: ["contabilidade", "gabinete de contabilidade", "contabilista"] },

  // Nichos adicionados (antes só o termo digitado era pesquisado, sem sinônimos)
  "veterinária": { br: ["clínica veterinária", "veterinário", "hospital veterinário", "banho e tosa"], us: ["veterinarian", "vet clinic", "animal hospital", "pet grooming"], es: ["veterinaria", "clínica veterinaria", "peluquería canina"] },
  "pet shop": { br: ["pet shop", "banho e tosa", "agropecuária", "casa de ração"], us: ["pet store", "pet grooming", "pet supplies"], es: ["tienda de mascotas", "peluquería canina"] },
  "academia": { br: ["academia", "crossfit", "estúdio de pilates", "personal trainer", "studio de treinamento"], us: ["gym", "fitness center", "crossfit", "pilates studio"], es: ["gimnasio", "crossfit", "estudio de pilates"] },
  "psicologia": { br: ["psicólogo", "clínica de psicologia", "psicoterapia", "terapeuta"], us: ["psychologist", "therapist", "counseling"], es: ["psicólogo", "terapeuta", "clínica de psicología"] },
  "fisioterapia": { br: ["fisioterapia", "clínica de fisioterapia", "fisioterapeuta", "quiropraxia"], us: ["physical therapy", "physiotherapist", "chiropractor"], es: ["fisioterapia", "fisioterapeuta", "quiropráctico"] },
  "nutrição": { br: ["nutricionista", "clínica de nutrição", "nutrição esportiva"], us: ["nutritionist", "dietitian"], es: ["nutricionista", "dietista"] },
  "escola": { br: ["escola", "escola de idiomas", "curso de inglês", "escola infantil", "reforço escolar", "cursos profissionalizantes"], us: ["school", "language school", "tutoring", "preschool"], es: ["escuela", "academia de idiomas", "guardería"] },
  "autoescola": { br: ["autoescola", "centro de formação de condutores"], us: ["driving school"], es: ["autoescuela"] },
  "hotel": { br: ["hotel", "pousada", "hostel", "chalé"], us: ["hotel", "inn", "hostel", "bed and breakfast"], es: ["hotel", "posada", "hostal"] },
  "construção": { br: ["construtora", "empreiteira", "materiais de construção", "engenharia civil", "reformas"], us: ["construction company", "general contractor", "building supplies", "remodeling"], es: ["constructora", "materiales de construcción", "reformas"] },
  "arquitetura": { br: ["escritório de arquitetura", "arquiteto", "design de interiores", "paisagismo"], us: ["architect", "interior designer", "landscaping"], es: ["estudio de arquitectura", "arquitecto", "diseño de interiores"] },
  "marcenaria": { br: ["marcenaria", "móveis planejados", "carpintaria", "móveis sob medida"], us: ["carpentry", "custom furniture", "cabinet maker"], es: ["carpintería", "muebles a medida"] },
  "móveis": { br: ["loja de móveis", "móveis planejados", "decoração", "colchões"], us: ["furniture store", "home decor", "mattress store"], es: ["tienda de muebles", "decoración", "colchones"] },
  "lavanderia": { br: ["lavanderia", "tinturaria", "lavagem a seco"], us: ["laundromat", "dry cleaner", "laundry service"], es: ["lavandería", "tintorería"] },
  "estética automotiva": { br: ["estética automotiva", "lava jato", "lava rápido", "polimento", "martelinho de ouro", "película automotiva"], us: ["car wash", "auto detailing", "window tinting"], es: ["lavado de autos", "detailing", "polarizado"] },
  "gráfica": { br: ["gráfica", "comunicação visual", "impressão", "serigrafia"], us: ["print shop", "signs", "screen printing"], es: ["imprenta", "rotulación", "serigrafía"] },
  "fotografia": { br: ["fotógrafo", "estúdio fotográfico", "filmagem"], us: ["photographer", "photo studio", "videographer"], es: ["fotógrafo", "estudio fotográfico", "videógrafo"] },
  "eventos": { br: ["buffet", "assessoria de eventos", "salão de festas", "decoração de festas"], us: ["event planner", "catering", "party venue"], es: ["organizador de eventos", "catering", "salón de fiestas"] },
  "farmácia": { br: ["farmácia", "drogaria", "farmácia de manipulação"], us: ["pharmacy", "drugstore", "compounding pharmacy"], es: ["farmacia", "droguería"] },
  "ótica": { br: ["ótica", "óculos", "lentes de contato"], us: ["optical shop", "optometrist", "eyeglasses"], es: ["óptica", "gafas", "optometrista"] },
  "floricultura": { br: ["floricultura", "loja de flores", "garden center"], us: ["florist", "flower shop", "garden center"], es: ["floristería", "vivero"] },
  "segurança": { br: ["segurança eletrônica", "empresa de segurança", "câmeras de segurança", "alarmes", "portaria"], us: ["security company", "alarm systems", "cctv installation"], es: ["seguridad electrónica", "alarmas", "cámaras de seguridad"] },
  "dedetização": { br: ["dedetizadora", "controle de pragas", "desentupidora", "limpeza de caixa d'água"], us: ["pest control", "exterminator", "drain cleaning"], es: ["control de plagas", "fumigación"] },
  "ar condicionado": { br: ["ar condicionado", "refrigeração", "manutenção de ar condicionado", "climatização"], us: ["hvac", "air conditioning repair", "refrigeration"], es: ["aire acondicionado", "refrigeración", "climatización"] },
  "manutenção residencial": { br: ["eletricista", "encanador", "pintor", "reformas", "marido de aluguel"], us: ["electrician", "plumber", "painter", "handyman"], es: ["electricista", "plomero", "pintor", "reformas"] },
  "assistência técnica": { br: ["assistência técnica", "conserto de celular", "manutenção de computadores", "informática"], us: ["phone repair", "computer repair", "electronics repair"], es: ["servicio técnico", "reparación de celulares", "informática"] },
  "moda": { br: ["loja de roupas", "boutique", "moda feminina", "moda masculina", "confecção", "calçados"], us: ["clothing store", "boutique", "shoe store", "fashion"], es: ["tienda de ropa", "boutique", "zapatería", "moda"] },
  "telhado": { br: ["telhadista", "coberturas e telhados", "calhas e rufos", "impermeabilização", "reforma de telhado"], us: ["roofing contractor", "roofer", "gutter installation", "waterproofing"], es: ["techador", "cubiertas", "impermeabilización"] },
};

const LANG_FALLBACK: Record<Lang, Lang[]> = {
  br: ["br"],
  pt: ["pt", "br", "us"],
  es: ["es", "us"],
  us: ["us"],
};

const COUNTRY_LANG: Record<string, Lang> = {
  us: "us", ca: "us", uk: "us", es: "es", mx: "es", ar: "es", co: "es", pt: "pt", br: "br",
};

// Índice normalizado (sem acento/maiúscula) → chave do dicionário. Só entram a chave e o nome principal
// (1º termo) de cada idioma, ex.: "salão de beleza", "oficina mecânica", "bakery". Os demais sinônimos
// ("barbearia", "dentista") são nichos mais específicos e devem ser pesquisados literalmente.
const TERM_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const key of Object.keys(semanticDictionary)) index.set(normalizeText(key), key);
  for (const [key, langs] of Object.entries(semanticDictionary)) {
    for (const list of Object.values(langs)) {
      const canonical = list?.[0];
      if (canonical && !index.has(normalizeText(canonical))) index.set(normalizeText(canonical), key);
    }
  }
  return index;
})();

/** Remove plural simples ("dentistas", "padarias") para achar a chave. */
function singular(word: string): string {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

export function findDictionaryKey(term: string): string | undefined {
  const norm = normalizeText(term);
  return TERM_INDEX.get(norm) ?? TERM_INDEX.get(singular(norm));
}

/**
 * Expande o nicho digitado em termos de busca.
 * O casamento é exato (ignorando acento e plural). Antes era "contém a palavra", e por isso
 * "clínica veterinária" virava "clínica médica / hospital" e "restaurante japonês" virava pizzaria e churrascaria.
 * Termos específicos não listados são pesquisados exatamente como digitados.
 */
export function expandSearchTerm(term: string, country: string = "br"): string[] {
  const typed = term.trim().replace(/\s+/g, " ");
  const expanded = new Set<string>([typed.toLowerCase()]);

  const key = findDictionaryKey(typed);
  if (key) {
    const lang = COUNTRY_LANG[country] ?? "us";
    for (const candidate of LANG_FALLBACK[lang]) {
      const synonyms = semanticDictionary[key][candidate];
      if (synonyms) {
        synonyms.forEach((s) => expanded.add(s));
        break;
      }
    }
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
    onlyNoSite: "Sem site (ou só Instagram / fora do ar)",
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
    onlyNoSite: "Sem site (ou só redes sociais / fora do ar)",
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
    onlyNoSite: "No website (or social-only / down)",
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
    onlyNoSite: "Sin web (o solo redes / caída)",
    onlyInsecure: "Solo Inseguros",
    volume: "Meta de Leads",
    buttonSearch: "Iniciar Prospección",
    buttonStop: "Detener Búsqueda",
    results: "Resultados de Meta",
    exportCsv: "Exportar CSV",
    copyAll: "Copiar Todo"
  }
};

/**
 * Nomes em inglês do tipo de negócio ("bakery", "restaurant"). O OpenStreetMap entende esses nomes como TIPO
 * de lugar: "bakery" traz todas as padarias da cidade, inclusive as que não têm "padaria" no nome.
 */
export function placeTypeTerms(term: string): string[] {
  const key = findDictionaryKey(term);
  return key ? (semanticDictionary[key].us ?? []).slice(0, 3) : [];
}
