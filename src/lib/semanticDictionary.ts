export const semanticDictionary: Record<string, string[]> = {
  // Alimentação
  "padaria": ["padaria", "panificadora", "confeitaria", "cafeteria", "boulangerie", "fornada artesanal"],
  "restaurante": ["restaurante", "lanchonete", "bistrô", "pizzaria", "hamburgueria", "churrascaria", "bar", "boteco"],
  "açougue": ["açougue", "casa de carnes", "boutique de carnes", "frigorífico"],
  "supermercado": ["supermercado", "mercado", "mercearia", "minimercado", "hortifruti", "sacolão"],
  
  // Saúde e Estética
  "clínica": ["clínica", "consultório", "policlínica", "centro médico", "hospital"],
  "odontologia": ["odontologia", "dentista", "clínica odontológica", "ortodontia", "implantes"],
  "estética": ["estética", "centro de estética", "spa", "clínica de beleza", "harmonização"],
  "salão": ["salão de beleza", "cabeleireiro", "barbearia", "esmalteria", "manicure", "cabelereiro"],
  "academia": ["academia", "crossfit", "estúdio de pilates", "centro de treinamento", "gym"],

  // Serviços e Varejo
  "advocacia": ["advocacia", "escritório de advocacia", "advogado", "advogados associados"],
  "contabilidade": ["contabilidade", "escritório contábil", "contador", "assessoria contábil"],
  "oficina": ["oficina mecânica", "auto center", "mecânica", "funilaria", "autopeças"],
  "imobiliária": ["imobiliária", "corretor de imóveis", "venda de imóveis", "administradora"],
  "pet shop": ["pet shop", "clínica veterinária", "banho e tosa", "veterinário"],
  "loja": ["loja", "comércio", "boutique", "magazine", "varejo"]
};

export function expandSearchTerm(term: string): string[] {
  const normalizedTerm = term.toLowerCase().trim();
  
  // Busca por chaves no dicionário que correspondam parcialmente ao termo
  const matchedKeys = Object.keys(semanticDictionary).filter(key => 
    key.includes(normalizedTerm) || normalizedTerm.includes(key)
  );

  let expanded = new Set<string>();
  expanded.add(normalizedTerm);

  matchedKeys.forEach(key => {
    semanticDictionary[key].forEach(synonym => expanded.add(synonym));
  });

  return Array.from(expanded);
}
