// Grava o que a busca lê em public/cnpj (lido por src/lib/cnpjSource.ts):
//
//   index.json                  estados disponíveis: { ufs: { SC: { mes, empresas, cidades } } }
//   <uf>/index.json             { cidades: { "<cidade>": empresas } } ou, se dividida, { "<cidade>": { "<cnae>": empresas } }
//   <uf>/<cidade>.json          cidade pequena: todas as empresas num arquivo
//   <uf>/<cidade>/<cnae>.json   cidade grande: um arquivo por ramo, para a busca baixar só o ramo pedido
//                               (São Paulo inteira seria um arquivo de dezenas de MB a cada busca)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIELDS = ["cnpj", "nome", "cnae", "inicio", "endereco", "bairro", "cep", "telefones", "email", "site"];
export const SPLIT_ROWS = 6000;
export const SOURCE = "Receita Federal - Dados Abertos CNPJ";

/**
 * Regrava a pasta do estado. `cities`: Map<slug, { city, rows }>, com as linhas no formato de FIELDS.
 * As linhas saem em ordem de CNPJ, para a atualização do mês seguinte mudar só o que mudou de fato.
 */
export function writeUf(out, uf, month, cities) {
  const dir = join(out, uf.toLowerCase());
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const stats = { companies: 0, cities: 0, splitCities: 0, files: 0, bytes: 0, biggestFile: 0 };
  const write = (path, body) => {
    writeFileSync(path, body);
    stats.files++;
    stats.bytes += body.length;
    stats.biggestFile = Math.max(stats.biggestFile, body.length);
  };
  const index = {};
  for (const [slug, { city, rows }] of [...cities].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    stats.companies += rows.length;
    stats.cities++;
    const file = (linhas) => JSON.stringify({ mes: month, cidade: city, uf, campos: FIELDS, linhas });
    if (rows.length <= SPLIT_ROWS) {
      write(join(dir, `${slug}.json`), file(rows));
      index[slug] = rows.length;
      continue;
    }
    stats.splitCities++;
    const byCnae = new Map();
    for (const row of rows) {
      if (!byCnae.has(row[2])) byCnae.set(row[2], []);
      byCnae.get(row[2]).push(row);
    }
    mkdirSync(join(dir, slug));
    index[slug] = {};
    for (const [cnae, part] of [...byCnae].sort(([a], [b]) => a.localeCompare(b))) {
      write(join(dir, slug, `${cnae}.json`), file(part));
      index[slug][cnae] = part.length;
    }
  }
  write(join(dir, "index.json"), JSON.stringify({ mes: month, uf, cidades: index }));

  const globalPath = join(out, "index.json");
  const global = existsSync(globalPath) ? JSON.parse(readFileSync(globalPath, "utf8")) : { fonte: SOURCE, ufs: {} };
  global.ufs[uf] = { mes: month, empresas: stats.companies, cidades: stats.cities };
  global.ufs = Object.fromEntries(Object.entries(global.ufs).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(globalPath, JSON.stringify(global, null, 1) + "\n");
  return stats;
}
