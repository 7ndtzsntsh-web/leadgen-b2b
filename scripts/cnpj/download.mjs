// Baixa os arquivos de CNPJ da Receita Federal para .cache/cnpj/<AAAA-MM> (~5,4 GB, uns 25 min).
//
// Uso:  node scripts/cnpj/download.mjs            (mês mais recente publicado)
//       node scripts/cnpj/download.mjs 2026-09
//
// A Receita publica numa pasta pública do Nextcloud dela:
// https://arquivos.receitafederal.gov.br/index.php/s/gn672Ad4CF8N6TK  (o código no fim é o id do link público,
// não é senha: é o que o próprio link usa para listar e baixar).
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const SHARE = "gn672Ad4CF8N6TK";
const BASE = "https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ";
const AUTH = { Authorization: `Basic ${Buffer.from(`${SHARE}:`).toString("base64")}` };
const FILES = ["Municipios.zip", "Cnaes.zip", ...Array.from({ length: 10 }, (_, i) => `Estabelecimentos${i}.zip`)];

async function listing(path) {
  const res = await fetch(`${BASE}/${path}`, { method: "PROPFIND", headers: { ...AUTH, Depth: "1" } });
  if (!res.ok) throw new Error(`Receita respondeu ${res.status} ao listar ${path || "a pasta"}`);
  const xml = await res.text();
  return [...xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)].map(([, r]) => ({
    name: decodeURIComponent((r.match(/<d:href>([^<]+)/) ?? [])[1] ?? "").replace(/\/$/, "").split("/").pop(),
    size: Number((r.match(/<d:getcontentlength>(\d+)/) ?? [])[1] ?? 0),
  }));
}

let month = process.argv[2];
if (!month) {
  const months = (await listing("")).map((e) => e.name).filter((n) => /^\d{4}-\d{2}$/.test(n)).sort();
  month = months.at(-1);
  if (!month) throw new Error("Nenhum mês publicado na pasta da Receita");
}
const dir = join(".cache", "cnpj", month);
mkdirSync(dir, { recursive: true });
const sizes = new Map((await listing(`${month}/`)).map((e) => [e.name, e.size]));
console.log(`Mês ${month} -> ${dir}`);

for (const name of FILES) {
  const expected = sizes.get(name);
  if (!expected) throw new Error(`${name} não está publicado em ${month}`);
  const target = join(dir, name);
  if (existsSync(target) && statSync(target).size === expected) {
    console.log(`já baixado: ${name}`);
    continue;
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${BASE}/${month}/${name}`, { headers: AUTH });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(`${target}.parcial`));
      const got = statSync(`${target}.parcial`).size;
      if (got !== expected) throw new Error(`tamanho ${got}, esperado ${expected}`);
      renameSync(`${target}.parcial`, target);
      console.log(`ok ${name} (${(expected / 1e6).toFixed(0)} MB em ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      break;
    } catch (error) {
      if (attempt >= 3) throw new Error(`${name}: ${error.message}`);
      console.log(`${name}: ${error.message}; tentando de novo (${attempt}/3)`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}
console.log(`Pronto. Agora: npm run cnpj:mapa && npm run cnpj:gerar -- ${month}`);
