// Baixa do OpenStreetMap os lugares do estado que têm site ou rede social, para o build.mjs juntar às empresas
// da Receita (a Receita não tem site). Sem isso, a empresa que tinha site no mapa aparecia "sem site":
// em Florianópolis eram 90 casos (ex.: Lavanderia Lib Clean -> libclean.com.br).
//
// Uso:  npm run cnpj:mapa             todos os estados (grava .cache/osm/<uf>-sites.json)
//       npm run cnpj:mapa -- SC PR    só esses (SC: ~25 s)
//
// Estado baixado há menos de FRESH_DAYS dias é pulado: se algum falhar, é só rodar de novo.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALL_UFS = [...new Set(JSON.parse(readFileSync("src/lib/data/brCities.json", "utf8")).map((c) => c[1]))].sort();
const UFS = process.argv.length > 2 ? process.argv.slice(2).map((u) => u.toUpperCase()) : ALL_UFS;
const unknownUfs = UFS.filter((u) => !ALL_UFS.includes(u));
if (unknownUfs.length) {
  console.error(`UF desconhecida: ${unknownUfs.join(", ")}`);
  process.exit(1);
}
const FRESH_DAYS = 20;
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const SITE_KEYS = ["website", "contact:website", "url"];
const SOCIAL_KEYS = ["contact:instagram", "instagram", "contact:facebook", "facebook"];
const PHONE_KEYS = ["phone", "contact:phone", "mobile", "contact:mobile", "contact:whatsapp"];

function socialUrl(tags) {
  const insta = tags["contact:instagram"] || tags.instagram;
  if (insta) return /^https?:\/\//i.test(insta) ? insta : `https://instagram.com/${insta.replace(/^@/, "").trim()}`;
  const fb = tags["contact:facebook"] || tags.facebook;
  return fb ? (/^https?:\/\//i.test(fb) ? fb : `https://facebook.com/${fb.replace(/^@/, "").trim()}`) : "";
}

async function query(uf) {
  // Uma consulta por chave (juntas): usa o índice de chaves do servidor. A versão com expressão regular na chave
  // varria todas as etiquetas do estado, o que num estado grande (SP) estoura o tempo do servidor.
  const byKey = [...SITE_KEYS, ...SOCIAL_KEYS].map((k) => `nwr(area.uf)["name"]["${k}"];`).join("");
  const q = `[out:json][timeout:300];area["ISO3166-2"="BR-${uf}"]->.uf;(${byKey});out tags;`;
  for (let round = 1; round <= 3; round++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LeadGenPro-B2B-App/5.0 (atualizacao mensal)" },
          body: `data=${encodeURIComponent(q)}`,
          signal: AbortSignal.timeout(330_000),
        });
        const text = await res.text();
        const data = JSON.parse(text);
        // "remark" com erro = o servidor parou no meio (tempo/memória) e a lista veio incompleta.
        const incomplete = typeof data.remark === "string" && /error/i.test(data.remark);
        if (res.ok && !incomplete && Array.isArray(data.elements) && data.elements.length > 0) return data.elements;
        console.log(`${new URL(url).host}: ${incomplete ? `resposta incompleta (${data.remark.slice(0, 80)})` : "resposta vazia"}`);
      } catch (error) {
        console.log(`${new URL(url).host}: ${error.message.slice(0, 80)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 15_000 * round));
  }
  throw new Error(`Nenhum servidor do OpenStreetMap respondeu para ${uf}. Tente de novo mais tarde.`);
}

mkdirSync(join(".cache", "osm"), { recursive: true });
const failed = [];
for (const uf of UFS) {
  const file = join(".cache", "osm", `${uf.toLowerCase()}-sites.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < FRESH_DAYS * 86_400_000) {
    console.log(`${uf}: já baixado há menos de ${FRESH_DAYS} dias`);
    continue;
  }
  try {
    const elements = await query(uf);
    const places = elements.map(({ tags }) => [
      tags.name,
      PHONE_KEYS.flatMap((k) => (tags[k] ?? "").split(/[;,/]/)).map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8),
      SITE_KEYS.map((k) => tags[k]).find(Boolean) ?? "",
      socialUrl(tags),
    ]);
    writeFileSync(file, JSON.stringify({ geradoEm: new Date().toISOString(), lugares: places }));
    console.log(`${uf}: ${places.length} lugares com site ou rede social (${places.filter((p) => p[1].length).length} com telefone)`);
  } catch (error) {
    console.log(`${uf}: ${error.message}`);
    failed.push(uf);
  }
  await new Promise((r) => setTimeout(r, 5_000)); // uso justo dos servidores gratuitos
}
if (failed.length) {
  console.log(`\nFalharam: ${failed.join(" ")}. Rode de novo mais tarde (os que deram certo são pulados).`);
  process.exit(1);
}
