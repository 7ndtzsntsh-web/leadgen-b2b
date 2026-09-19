// Gera src/lib/data/brCities.json a partir da API pública do IBGE.
// Uso: node scripts/build-br-cities.mjs
// Formato de cada linha: [nome, UF, regiãoImediataId, regiãoIntermediáriaId, população]
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://servicodados.ibge.gov.br/api";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE ${res.status}: ${url}`);
  return res.json();
}

const [cities, popData] = await Promise.all([
  getJson(`${BASE}/v1/localidades/municipios?view=nivelado`),
  getJson(`${BASE}/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6%5Ball%5D`),
]);

const population = new Map();
for (const s of popData[0].resultados[0].series) {
  const values = Object.values(s.serie);
  population.set(String(s.localidade.id), Number(values[values.length - 1]) || 0);
}

const rows = cities.map((m) => [
  m["municipio-nome"],
  m["UF-sigla"],
  Number(m["regiao-imediata-id"]),
  Number(m["regiao-intermediaria-id"]),
  population.get(String(m["municipio-id"])) ?? 0,
]);

await mkdir("src/lib/data", { recursive: true });
await writeFile("src/lib/data/brCities.json", JSON.stringify(rows));
console.log(`${rows.length} municípios gravados em src/lib/data/brCities.json`);
