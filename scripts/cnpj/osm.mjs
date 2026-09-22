// Baixa do OpenStreetMap os lugares do estado que têm site ou rede social, para o build.mjs juntar às empresas
// da Receita (a Receita não tem site). Sem isso, a empresa que tinha site no mapa aparecia "sem site":
// em Florianópolis eram 90 casos (ex.: Lavanderia Lib Clean -> libclean.com.br).
//
// Uso:  node scripts/cnpj/osm.mjs SC          (~25 s; grava .cache/osm/sc-sites.json)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UFS = process.argv.slice(2).map((u) => u.toUpperCase());
if (!UFS.length) {
  console.error("Uso: node scripts/cnpj/osm.mjs UF [UF ...]");
  process.exit(1);
}
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
  const q = `[out:json][timeout:300];area["ISO3166-2"="BR-${uf}"]->.uf;nwr(area.uf)["name"][~"^(${[...SITE_KEYS, ...SOCIAL_KEYS].join("|")})$"~"."];out tags;`;
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
        if (res.ok && Array.isArray(data.elements) && data.elements.length > 0) return data.elements;
        console.log(`${new URL(url).host}: resposta vazia`);
      } catch (error) {
        console.log(`${new URL(url).host}: ${error.message.slice(0, 80)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 15_000 * round));
  }
  throw new Error(`Nenhum servidor do OpenStreetMap respondeu para ${uf}. Tente de novo mais tarde.`);
}

mkdirSync(join(".cache", "osm"), { recursive: true });
for (const uf of UFS) {
  const elements = await query(uf);
  const places = elements.map(({ tags }) => [
    tags.name,
    PHONE_KEYS.flatMap((k) => (tags[k] ?? "").split(/[;,/]/)).map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8),
    SITE_KEYS.map((k) => tags[k]).find(Boolean) ?? "",
    socialUrl(tags),
  ]);
  writeFileSync(join(".cache", "osm", `${uf.toLowerCase()}-sites.json`), JSON.stringify({ geradoEm: new Date().toISOString(), lugares: places }));
  console.log(`${uf}: ${places.length} lugares com site ou rede social (${places.filter((p) => p[1].length).length} com telefone)`);
}
