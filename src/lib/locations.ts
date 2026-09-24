import { findCity, neighborCities, type City } from "./brCities";
import { UF_NAMES } from "./ufData";
import { findUsCity, parseUsPlace, topUsCities, usNeighborCities, US_STATE_NAMES } from "./usCities";
import { normalizeText } from "./text";

export interface SearchLocation {
  /** Nome exibido e usado no texto de abordagem. */
  city: string;
  uf?: string;
  isExpansion: boolean;
  /** Complementos de busca (bairros/zonas) que serão combinados com cada termo do nicho. */
  queries: string[];
  /** "region" = país/estado inteiro: não há uma cidade específica para conferir com o endereço do lead. */
  scope?: "city" | "region";
  /**
   * EUA: 1ª volta pelas cidades só com as empresas "certas" (todas as checagens passam), 2ª volta com o resto.
   * Sem isto, a cidade pedida esgotava as incertas antes de a busca chegar às certas das vizinhas.
   */
  usPass?: "sure" | "rest";
}

const cityAliases: Record<string, string> = {
  sp: "São Paulo", sampa: "São Paulo", rj: "Rio de Janeiro", floripa: "Florianópolis",
  bh: "Belo Horizonte", bsb: "Brasília", df: "Brasília", cwb: "Curitiba",
  poa: "Porto Alegre", ssa: "Salvador", nyc: "New York", ny: "New York",
  la: "Los Angeles", cdmx: "Ciudad de México", lisboa: "Lisbon", porto: "Oporto",
};

// Polos comerciais escolhidos à mão ao redor dos grandes centros (têm prioridade sobre o cálculo por região).
const expansionMap: Record<string, string[]> = {
  "São Paulo": ["Guarulhos", "Campinas", "Osasco", "Santo André", "São Bernardo do Campo", "São Caetano do Sul", "Diadema", "Barueri", "Sorocaba", "Jundiaí", "Ribeirão Preto", "São José dos Campos", "Santos", "Mauá", "Mogi das Cruzes"],
  "Rio de Janeiro": ["Niterói", "Duque de Caxias", "Nova Iguaçu", "São Gonçalo", "Petrópolis", "Cabo Frio", "Volta Redonda", "Macaé", "Campos dos Goytacazes", "Belford Roxo"],
  "Florianópolis": ["São José", "Palhoça", "Biguaçu", "Balneário Camboriú", "Itajaí", "Blumenau", "Joinville", "Criciúma", "Tubarão", "Lages", "Chapecó", "Brusque"],
  "Belo Horizonte": ["Contagem", "Betim", "Nova Lima", "Uberlândia", "Juiz de Fora", "Ipatinga", "Sete Lagoas", "Divinópolis", "Governador Valadares", "Montes Claros", "Uberaba"],
  "Curitiba": ["São José dos Pinhais", "Londrina", "Maringá", "Ponta Grossa", "Cascavel", "Colombo", "Foz do Iguaçu", "Guarapuava", "Paranaguá"],
  "Brasília": ["Taguatinga", "Águas Claras", "Goiânia", "Anápolis", "Aparecida de Goiânia", "Luziânia", "Rio Verde", "Valparaíso de Goiás"],
  "Porto Alegre": ["Caxias do Sul", "Canoas", "Novo Hamburgo", "Pelotas", "Santa Maria", "São Leopoldo", "Rio Grande", "Passo Fundo", "Gravataí", "Viamão"],
  "Salvador": ["Lauro de Freitas", "Camaçari", "Feira de Santana", "Vitória da Conquista", "Itabuna", "Ilhéus", "Juazeiro", "Jequié"],
  "Recife": ["Jaboatão dos Guararapes", "Olinda", "Caruaru", "Paulista", "Petrolina", "Cabo de Santo Agostinho", "Camaragibe", "Garanhuns"],
  "Fortaleza": ["Caucaia", "Maracanaú", "Sobral", "Juazeiro do Norte", "Crato", "Itapipoca", "Maranguape"],
  "New York": ["Brooklyn", "Queens", "Jersey City", "Newark", "Yonkers", "Hoboken", "White Plains", "Stamford", "Hempstead"],
  "Los Angeles": ["Long Beach", "Anaheim", "Santa Ana", "Irvine", "Glendale", "Pasadena", "Huntington Beach", "Riverside"],
  "Miami": ["Fort Lauderdale", "Boca Raton", "West Palm Beach", "Hollywood", "Pompano Beach", "Coral Springs", "Miami Beach"],
  "Lisbon": ["Sintra", "Cascais", "Amadora", "Oeiras", "Loures", "Almada", "Odivelas", "Seixal", "Vila Franca de Xira"],
  "Oporto": ["Vila Nova de Gaia", "Matosinhos", "Maia", "Gondomar", "Braga", "Guimarães", "Santa Maria da Feira"],
  "Ciudad de México": ["Naucalpan", "Tlalnepantla", "Ecatepec", "Nezahualcóyotl", "Toluca", "Chimalhuacán", "Cuautitlán Izcalli"],
};

const expansionKeys = new Map(Object.keys(expansionMap).map((k) => [normalizeText(k), k]));

const bigCityZones: Record<string, string[]> = {
  "sao paulo": ["São Paulo", "Centro de São Paulo", "Avenida Paulista, SP", "Pinheiros, SP", "Itaim Bibi, SP", "Moema, SP", "Vila Olímpia, SP", "Santo Amaro, SP", "Lapa, SP", "Santana, SP", "Tatuapé, SP", "Mooca, SP", "Ipiranga, SP", "Jabaquara, SP", "Vila Mariana, SP", "Saúde, SP"],
  "rio de janeiro": ["Rio de Janeiro", "Centro, Rio de Janeiro", "Copacabana, RJ", "Botafogo, RJ", "Tijuca, RJ", "Barra da Tijuca, RJ", "Recreio dos Bandeirantes, RJ", "Méier, RJ", "Madureira, RJ", "Campo Grande, RJ", "Bangu, RJ"],
  "belo horizonte": ["Belo Horizonte", "Centro, BH", "Savassi, BH", "Lourdes, BH", "Funcionários, BH", "Pampulha, BH", "Venda Nova, BH", "Barreiro, BH", "Buritis, BH", "Sion, BH"],
  "curitiba": ["Curitiba", "Centro, Curitiba", "Batel, Curitiba", "Água Verde, Curitiba", "Bigorrilho, Curitiba", "Portão, Curitiba", "Santa Felicidade, Curitiba", "Cidade Industrial, Curitiba", "Boqueirão, Curitiba", "Pinheirinho, Curitiba"],
};

/**
 * Zonas de busca proporcionais ao porte da cidade. Cidade pequena não tem "Zona Leste": pesquisar
 * seis "zonas" só devolvia os mesmos resultados repetidos e gastava chamadas à API.
 */
function getCityZones(name: string, country: string, uf?: string, pop = 0): string[] {
  const big = bigCityZones[normalizeText(name)];
  if (big) return big;

  const label = uf ? `${name}, ${uf}` : name;

  if (country === "us") return [label, `${label} Downtown`, `${label} North`, `${label} South`];
  if (country === "es" || country === "mx") return [label, `${label} Centro`, `${label} Norte`, `${label} Sur`];

  const centro = `Centro, ${label}`;
  if (pop >= 300_000) return [label, centro, `Zona Norte, ${label}`, `Zona Sul, ${label}`, `Zona Leste, ${label}`, `Zona Oeste, ${label}`];
  if (pop >= 100_000) return [label, centro, `Zona Norte, ${label}`, `Zona Sul, ${label}`];
  return [label, centro];
}

function locationFor(name: string, country: string, isExpansion: boolean, city?: City, uf?: string): SearchLocation {
  const resolvedUf = city?.uf ?? uf;
  return { city: name, uf: resolvedUf, isExpansion, queries: getCityZones(name, country, resolvedUf, city?.pop) };
}

/**
 * Monta a fila de localidades: a cidade pedida primeiro e, se a meta não for atingida, as vizinhas
 * (polos curados para as grandes capitais; para as demais, municípios da mesma região do IBGE por população).
 */
export function resolveLocations(rawCity: string, country: string): SearchLocation[] {
  if (country === "us") return resolveUsLocations(rawCity);
  const parts = rawCity.split(" - ");
  const typed = parts[0].trim();
  const typedUf = parts[1]?.trim().toUpperCase();
  const name = typed ? (cityAliases[normalizeText(typed)] ?? typed) : "";

  if (!name) {
    const countryNames: Record<string, string> = { br: "Brasil", pt: "Portugal", us: "United States", es: "España" };
    const label = countryNames[country] || "Brasil";
    return [{ city: label, isExpansion: false, queries: [label], scope: "region" }];
  }

  const record = country === "br" ? findCity(name, typedUf) : undefined;
  // EUA: a cidade e o estado vêm da lista do Overture ("Miami" sem estado = a Miami com mais empresas, na Flórida).
  const usRecord = country === "us" ? findUsCity(name, typedUf) : undefined;
  const uf = record?.uf ?? usRecord?.state ?? typedUf;
  const primary = locationFor(record?.name ?? usRecord?.name ?? name, country, false, record, uf);
  const queue: SearchLocation[] = [primary];

  const curatedKey = expansionKeys.get(normalizeText(name));
  if (curatedKey) {
    for (const neighbor of expansionMap[curatedKey]) {
      const neighborRecord = country === "br" ? (findCity(neighbor, uf) ?? findCity(neighbor)) : undefined;
      const usNeighbor = country === "us" ? (findUsCity(neighbor, uf) ?? findUsCity(neighbor)) : undefined;
      queue.push(locationFor(neighbor, country, true, neighborRecord, usNeighbor?.state));
    }
  } else if (record) {
    for (const neighbor of neighborCities(record)) queue.push(locationFor(neighbor.name, country, true, neighbor));
  } else if (usRecord) {
    for (const neighbor of usNeighborCities(usRecord)) queue.push(locationFor(neighbor.name, country, true, undefined, neighbor.state));
  } else if (country === "br" && uf && UF_NAMES[uf]) {
    // Cidade fora da base do IBGE: última alternativa é o estado inteiro.
    queue.push({ city: UF_NAMES[uf], uf, isExpansion: true, queries: [`${UF_NAMES[uf]}, Brasil`], scope: "region" });
  }

  return queue;
}

/** Busca por estado ou país nos EUA: as cidades com mais empresas, em ordem (cada uma tem o arquivo do Overture). */
const US_REGION_CITIES = 20;

/**
 * EUA: aceita a cidade de vários jeitos ("Orlando, FL", "orlando fl", "Miami Florida", "Orlnado"), o estado inteiro
 * ("Texas", "TX") ou o país ("USA"). Antes, o que não fosse "Cidade - UF" caía na busca de reserva do mapa, que
 * nos EUA quase não tem telefone e não confirma nada.
 */
function resolveUsLocations(rawCity: string): SearchLocation[] {
  const place = parseUsPlace(rawCity);
  const us = (name: string, state: string | undefined, isExpansion: boolean) => locationFor(name, "us", isExpansion, undefined, state);

  if (place.kind === "country" || place.kind === "state") {
    const state = place.kind === "state" ? place.state : undefined;
    const cities = topUsCities(state, US_REGION_CITIES);
    if (cities.length === 0) {
      const label = state ? US_STATE_NAMES[state] : "United States";
      return [{ city: label, uf: state, isExpansion: false, queries: [label], scope: "region" }];
    }
    return twoPasses(cities.map((c, i) => us(c.name, c.state, i > 0)));
  }
  if (place.kind === "unknown") return [us(place.name, undefined, false)];
  if (place.kind === "typed") return twoPasses(withState([us(place.name, place.state, false)], place.state));

  const { city } = place;
  const queue = [us(city.name, city.state, false)];
  const curatedKey = expansionKeys.get(normalizeText(city.name));
  if (curatedKey) {
    for (const neighbor of expansionMap[curatedKey]) {
      const record = findUsCity(neighbor, city.state) ?? findUsCity(neighbor);
      queue.push(us(record?.name ?? neighbor, record?.state, true));
    }
  } else {
    for (const neighbor of usNeighborCities(city)) queue.push(us(neighbor.name, neighbor.state, true));
  }
  return twoPasses(withState(queue, city.state));
}

/** Depois das vizinhas, as maiores cidades do mesmo estado (cidade pequena dava poucos leads: Boise, 23 de 50). */
function withState(queue: SearchLocation[], state: string): SearchLocation[] {
  const seen = new Set(queue.map((l) => `${normalizeText(l.city)}|${l.uf}`));
  for (const c of topUsCities(state, US_REGION_CITIES)) {
    if (!seen.has(`${normalizeText(c.name)}|${c.state}`)) queue.push(locationFor(c.name, "us", true, undefined, c.state));
  }
  return queue;
}

const twoPasses = (queue: SearchLocation[]): SearchLocation[] => [
  ...queue.map((l) => ({ ...l, usPass: "sure" as const })),
  ...queue.map((l) => ({ ...l, usPass: "rest" as const })),
];
