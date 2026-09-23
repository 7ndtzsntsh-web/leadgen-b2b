// Gera public/cnpj (formato em scripts/cnpj/output.mjs) a partir dos dados abertos de CNPJ da Receita Federal.
//
// Uso:  npm run cnpj:baixar                   baixa o mês mais recente (~5,4 GB) para .cache/cnpj/<AAAA-MM>
//       npm run cnpj:mapa                     sites e redes do OpenStreetMap, todos os estados (.cache/osm)
//       npm run cnpj:gerar -- AAAA-MM         todos os estados
//       npm run cnpj:gerar -- AAAA-MM SC PR   só esses (os outros ficam como estão)
//
// Por que existe: o OpenStreetMap só tem telefone de ~15% das empresas e não diz se elas estão abertas.
// O cadastro da Receita tem todas as empresas ativas, com ramo (CNAE), endereço oficial, telefone e e-mail.
//
// O que fica de fora, de propósito:
// - empresa que não está ATIVA;
// - empresa sem nome fantasia (quase sempre MEI com o nome da pessoa: não dá para abordar como empresa);
// - telefone ou e-mail usado por 3 ou mais empresas diferentes: é do contador ou de um escritório, não do dono;
// - dados de sócios (não baixamos esse arquivo).
//
// O Brasil tem dezenas de milhões de linhas, então o trabalho é dividido para caber na memória:
// 1. Uma leitura dos 10 arquivos separa as empresas ATIVAS de cada estado em .cache/cnpj/<mês>/por-uf-*/<UF>.tsv.gz,
//    só com as colunas usadas. Rodando de novo no mesmo mês, é reaproveitado (a pasta muda se os nichos mudarem).
// 2. Cada estado é processado sozinho, lendo o seu arquivo duas vezes: a 1ª conta quantas empresas usam cada
//    telefone/e-mail e a 2ª monta as linhas.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import readline from "node:readline";
import { finished } from "node:stream/promises";
import zlib from "node:zlib";
import { writeUf } from "./output.mjs";
import { csvRows } from "./zip.mjs";

const [month, ...ufArgs] = process.argv.slice(2);
if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
  console.error("Uso: node scripts/cnpj/build.mjs AAAA-MM [UF ...]   (sem UF: todos os estados)");
  process.exit(1);
}

// Municípios do IBGE [nome, UF, ...]: o nome que a busca usa para achar o arquivo da cidade.
const IBGE = JSON.parse(readFileSync("src/lib/data/brCities.json", "utf8"));
const ALL_UFS = [...new Set(IBGE.map((c) => c[1]))].sort();
const UFS = ufArgs.length ? [...new Set(ufArgs.map((u) => u.toUpperCase()))] : ALL_UFS;
const unknownUfs = UFS.filter((u) => !ALL_UFS.includes(u));
if (unknownUfs.length) {
  console.error(`UF desconhecida: ${unknownUfs.join(", ")}`);
  process.exit(1);
}

const SRC = join(".cache", "cnpj", month);
// CNPJ_OUT / CNPJ_FILES: só para teste (outra pasta de saída / só alguns arquivos).
const OUT = process.env.CNPJ_OUT ?? join("public", "cnpj");
const FILE_NUMBERS = (process.env.CNPJ_FILES ?? "0,1,2,3,4,5,6,7,8,9").split(",").map(Number);
const SHARED = 3;

// Colunas do arquivo Estabelecimentos (layout oficial da Receita).
const C = {
  basico: 0, ordem: 1, dv: 2, fantasia: 4, situacao: 5, inicio: 10, cnae: 11,
  tipoLogradouro: 13, logradouro: 14, numero: 15, complemento: 16, bairro: 17, cep: 18, uf: 19, municipio: 20,
  ddd1: 21, tel1: 22, ddd2: 23, tel2: 24, email: 27,
};
// Colunas do arquivo separado por estado. Empresa que não é dos nichos (ou sem nome fantasia) só guarda o que
// entra na contagem de telefone/e-mail de contador, com o nome fantasia vazio.
const T = {
  basico: 0, ordem: 1, dv: 2, fantasia: 3, inicio: 4, cnae: 5, tipoLogradouro: 6, logradouro: 7, numero: 8,
  complemento: 9, bairro: 10, cep: 11, municipio: 12, ddd1: 13, tel1: 14, ddd2: 15, tel2: 16, email: 17,
};

const niches = JSON.parse(readFileSync("src/lib/data/nicheCnaes.json", "utf8"));
const TARGET = new Set(Object.entries(niches).filter(([k]) => !k.startsWith("_")).flatMap(([, v]) => v.cnaes));
const ACCOUNTING = new Set(niches.contabilidade.cnaes);
const SPLIT_DIR = join(SRC, `por-uf-${createHash("sha1").update([...TARGET].sort().join()).digest("hex").slice(0, 8)}`);

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const nameKey = (s) => norm(s).replace(/[^a-z0-9]/g, "");

// Nomes vêm em MAIÚSCULAS: "PADARIA DO JOAO" -> "Padaria do Joao".
const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os", "com", "para", "por"]);
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : /^(me|epp|ltda|eireli|s\/a|sa)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Nome de exibição: sem "LTDA", "ME", "EPP"... no fim ("Padaria Princesa LTDA ME" -> "Padaria Princesa"). */
function displayName(s) {
  let name = titleCase(s);
  for (let prev = ""; prev !== name; ) {
    prev = name;
    name = name.replace(/[\s,.-]+(LTDA|LIMITADA|ME|EPP|EIRELI|MEI|S\/A|SA|S\.A\.?)\.?$/i, "").trim();
  }
  return name;
}

// Município com nome diferente na Receita e no IBGE que a comparação aproximada (matchCities) não resolve.
const CITY_ALIASES = {
  "SC/balneario-de-picarras": "balneario-picarras",
  "SP/embu": "embu-das-artes",
  "TO/couto-de-magalhaes": "couto-magalhaes",
  "TO/sao-valerio-da-natividade": "sao-valerio",
  "PB/sao-domingos-de-pombal": "sao-domingos",
  "MG/itabirinha-de-mantena": "itabirinha",
};

/** DDD + número, só dígitos. */
function phoneOf(ddd, tel) {
  const d = (ddd ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const t = (tel ?? "").replace(/\D/g, "");
  if (d.length !== 2 || t.length < 8 || t.length > 9) return null;
  return d + t;
}
/** Chave de contagem: DDD + 8 últimos dígitos (celular antigo e novo contam juntos), como número. */
const phoneKey = (p) => Number(p.slice(0, 2) + p.slice(-8));

/** E-mail como número de 53 bits: milhões de e-mails guardados como texto não cabem na memória. */
function emailKey(s) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Em quantas empresas (CNPJ básico) diferentes um telefone/e-mail aparece, contando até SHARED. As filiais de uma
 * empresa vêm juntas no arquivo. Guarda "dono * 4 + contagem" em vários Map, porque um Map só aceita ~16 milhões
 * de chaves e São Paulo chega perto disso.
 */
class OwnerCount {
  maps = Array.from({ length: 8 }, () => new Map());
  add(key, owner) {
    const map = this.maps[key % 8];
    const value = map.get(key);
    if (value === undefined) map.set(key, owner * 4 + 1);
    else if (Math.floor(value / 4) !== owner) map.set(key, owner * 4 + Math.min((value % 4) + 1, SHARED));
  }
  count(key) {
    return (this.maps[key % 8].get(key) ?? 0) % 4;
  }
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const municipios = new Map();
for await (const [code, name] of csvRows(join(SRC, "Municipios.zip"))) municipios.set(code, name);

const unmatchedCities = [];

/**
 * Código de município da Receita -> cidade do IBGE. A Receita às vezes usa outra grafia ("MOJI MIRIM", "PARATI")
 * ou o nome antigo. Tenta, nesta ordem: nome igual, CITY_ALIASES, até 2 letras de diferença (só se houver um
 * único parecido) e, sobrando exatamente um de cada lado, os dois. O que não casar fica com o nome da Receita e é
 * listado no fim: a busca não acha essa cidade até alguém pôr o nome certo em CITY_ALIASES.
 */
function matchCities(uf, codes) {
  const ibge = new Map(IBGE.filter((c) => c[1] === uf).map((c) => [slug(c[0]), c[0]]));
  const matched = new Map();
  const claimed = new Set();
  const claim = (code, target) => {
    matched.set(code, { slug: target, name: ibge.get(target) });
    claimed.add(target);
  };

  let pending = [];
  for (const code of [...codes].sort()) {
    const receita = slug(municipios.get(code) ?? code);
    const target = ibge.has(receita) ? receita : CITY_ALIASES[`${uf}/${receita}`];
    if (target && ibge.has(target) && !claimed.has(target)) claim(code, target);
    else pending.push({ code, receita });
  }

  pending = pending.filter(({ code, receita }) => {
    let best = null;
    let bestDistance = 3;
    let tie = false;
    for (const candidate of ibge.keys()) {
      if (claimed.has(candidate)) continue;
      const d = levenshtein(receita, candidate);
      if (d < bestDistance) [best, bestDistance, tie] = [candidate, d, false];
      else if (d === bestDistance) tie = true;
    }
    if (!best || tie) return true;
    console.log(`  ${uf}: "${municipios.get(code)}" = ${ibge.get(best)} (grafia parecida)`);
    claim(code, best);
    return false;
  });

  const leftover = [...ibge.keys()].filter((s) => !claimed.has(s));
  if (pending.length === 1 && leftover.length === 1) {
    console.log(`  ${uf}: "${municipios.get(pending[0].code)}" = ${ibge.get(leftover[0])} (única cidade que sobrou)`);
    claim(pending[0].code, leftover[0]);
    pending = [];
  }

  for (const { code, receita } of pending) {
    const name = municipios.get(code) ?? code;
    matched.set(code, { slug: receita, name: titleCase(name) });
    unmatchedCities.push(`${uf}/${receita} ("${name}")`);
  }
  return matched;
}

/** Sites e redes sociais do OpenStreetMap (scripts/cnpj/osm.mjs), pelo telefone ou pelo nome. */
function loadOsm(uf) {
  const byPhone = new Map();
  const byName = new Map();
  const file = join(".cache", "osm", `${uf.toLowerCase()}-sites.json`);
  if (!existsSync(file)) {
    console.log(`  AVISO: sem ${file} (rode npm run cnpj:mapa -- ${uf}): as empresas de ${uf} ficam sem o site que o mapa tem.`);
    return { byPhone, byName };
  }
  for (const [name, phones, website, social] of JSON.parse(readFileSync(file, "utf8")).lugares) {
    const site = website || social;
    if (!site) continue;
    for (const raw of phones) {
      let d = raw.replace(/\D/g, "");
      if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
      if (d.startsWith("0")) d = d.slice(1);
      if (d.length >= 10) byPhone.set(phoneKey(d), site);
    }
    const k = nameKey(name);
    byName.set(k, byName.has(k) ? null : site); // nome repetido no mapa: não dá para saber qual é
  }
  return { byPhone, byName };
}

const clean = (s) => s.replace(/[\t\r\n]/g, " ").trim();

/** 1ª etapa: uma leitura dos arquivos da Receita separa as empresas ativas de cada estado pedido. */
async function splitByUf(ufs) {
  mkdirSync(SPLIT_DIR, { recursive: true });
  const outs = new Map(
    ufs.map((uf) => {
      const gz = zlib.createGzip({ level: 1 });
      const file = createWriteStream(join(SPLIT_DIR, `${uf}.tsv.gz.parcial`));
      gz.pipe(file);
      return [uf, { gz, file, lines: [], size: 0 }];
    }),
  );
  // Grava em blocos: uma escrita por linha deixava a separação várias vezes mais lenta.
  const flush = async (out) => {
    const ok = out.gz.write(out.lines.join(""));
    out.lines = [];
    out.size = 0;
    if (!ok) await once(out.gz, "drain");
  };
  const t0 = Date.now();
  for (const i of FILE_NUMBERS) {
    const path = join(SRC, `Estabelecimentos${i}.zip`);
    if (!existsSync(path)) throw new Error(`Falta ${path}: rode antes npm run cnpj:baixar -- ${month}`);
    let rows = 0;
    for await (const c of csvRows(path, (line) => line.includes('";"02";"'))) {
      if (c.length < 28 || c[C.situacao] !== "02") continue;
      const out = outs.get(c[C.uf]);
      if (!out) continue;
      rows++;
      const email = clean(c[C.email]).toLowerCase();
      const contact = [clean(c[C.municipio]), clean(c[C.ddd1]), clean(c[C.tel1]), clean(c[C.ddd2]), clean(c[C.tel2]), email];
      const fields =
        TARGET.has(c[C.cnae]) && c[C.fantasia].trim()
          ? [
              c[C.basico], c[C.ordem], c[C.dv], c[C.fantasia], c[C.inicio], c[C.cnae], c[C.tipoLogradouro],
              c[C.logradouro], c[C.numero], c[C.complemento], c[C.bairro], c[C.cep],
            ].map(clean)
          : [clean(c[C.basico]), "", "", "", "", "", "", "", "", "", "", ""];
      const line = `${fields.concat(contact).join("\t")}\n`;
      out.lines.push(line);
      out.size += line.length;
      if (out.size >= 1 << 20) await flush(out);
    }
    console.log(`Estabelecimentos${i}: ${rows} ativas nos estados pedidos | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await Promise.all(
    [...outs.values()].map(async (out) => {
      if (out.size) await flush(out);
      out.gz.end();
      await finished(out.file);
    }),
  );
  for (const uf of ufs) renameSync(join(SPLIT_DIR, `${uf}.tsv.gz.parcial`), join(SPLIT_DIR, `${uf}.tsv.gz`));
}

async function* ufRows(uf) {
  const input = createReadStream(join(SPLIT_DIR, `${uf}.tsv.gz`)).pipe(zlib.createGunzip());
  for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
    if (line) yield line.split("\t");
  }
}

const phonesOf = (f) => [phoneOf(f[T.ddd1], f[T.tel1]), phoneOf(f[T.ddd2], f[T.tel2])].filter(Boolean);

/** 2ª etapa, um estado por vez. */
async function processUf(uf) {
  const t0 = Date.now();

  // 1ª leitura: quantas empresas usam cada telefone/e-mail, nomes fantasia repetidos e municípios que aparecem.
  const phoneOwners = new OwnerCount();
  const emailOwners = new OwnerCount();
  const nameCount = new Map();
  const codes = new Set();
  let active = 0;
  let candidates = 0;
  for await (const f of ufRows(uf)) {
    active++;
    const owner = Number(f[T.basico]);
    for (const p of phonesOf(f)) phoneOwners.add(phoneKey(p), owner);
    if (f[T.email]) emailOwners.add(emailKey(f[T.email]), owner);
    codes.add(f[T.municipio]);
    if (f[T.fantasia]) {
      candidates++;
      const k = nameKey(f[T.fantasia]);
      nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
    }
  }
  const cityOf = matchCities(uf, codes);
  const osm = loadOsm(uf);

  // 2ª leitura: as linhas das empresas dos nichos.
  const cities = new Map();
  let noContact = 0;
  let accountantPhones = 0;
  let siteByPhone = 0;
  let siteByName = 0;
  for await (const f of ufRows(uf)) {
    if (!f[T.fantasia]) continue;
    const phones = phonesOf(f);
    const okPhones = phones.filter((p) => phoneOwners.count(phoneKey(p)) < SHARED);
    accountantPhones += phones.length - okPhones.length;
    const email = f[T.email];
    const sharedEmail = email && emailOwners.count(emailKey(email)) >= SHARED;
    const accountantEmail = email && !ACCOUNTING.has(f[T.cnae]) && /contab/.test(email);
    const okEmail = email && !sharedEmail && !accountantEmail ? email : "";
    const name = displayName(f[T.fantasia]);
    if ((okPhones.length === 0 && !okEmail) || !name) {
      noContact++;
      continue;
    }

    let site = "";
    for (const p of okPhones) {
      site = osm.byPhone.get(phoneKey(p)) ?? "";
      if (site) break;
    }
    if (site) siteByPhone++;
    else if (nameCount.get(nameKey(f[T.fantasia])) === 1 && osm.byName.get(nameKey(f[T.fantasia]))) {
      site = osm.byName.get(nameKey(f[T.fantasia]));
      siteByName++;
    }

    const { slug: citySlug, name: cityName } = cityOf.get(f[T.municipio]);
    const street = [f[T.tipoLogradouro], f[T.logradouro]].filter(Boolean).join(" ");
    const address = [titleCase(street), f[T.numero], titleCase(f[T.complemento])].filter(Boolean).join(", ");
    if (!cities.has(citySlug)) cities.set(citySlug, { city: cityName, rows: [] });
    cities.get(citySlug).rows.push([
      f[T.basico] + f[T.ordem] + f[T.dv],
      name,
      f[T.cnae],
      f[T.inicio],
      address,
      titleCase(f[T.bairro]),
      f[T.cep],
      okPhones,
      okEmail,
      site,
    ]);
  }

  const s = writeUf(OUT, uf, month, cities);
  console.log(
    `${uf}: ${s.companies} empresas em ${s.cities} cidades (${s.splitCities} divididas por ramo), ` +
      `${(s.bytes / 1e6).toFixed(1)} MB em ${s.files} arquivos, maior ${(s.biggestFile / 1e6).toFixed(1)} MB | ` +
      `ativas ${active}, dos nichos ${candidates}, sem contato próprio ${noContact}, telefones de contador ${accountantPhones}, ` +
      `site do mapa ${siteByPhone} pelo telefone e ${siteByName} pelo nome | ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
  return s;
}

const t0 = Date.now();
const toSplit = UFS.filter((uf) => !existsSync(join(SPLIT_DIR, `${uf}.tsv.gz`)));
if (toSplit.length) {
  console.log(`Separando por estado: ${toSplit.join(" ")}`);
  await splitByUf(toSplit);
} else {
  console.log(`Reaproveitando ${SPLIT_DIR}`);
}

const total = { companies: 0, cities: 0, files: 0, bytes: 0, biggestFile: 0 };
for (const uf of UFS) {
  const s = await processUf(uf);
  for (const k of ["companies", "cities", "files", "bytes"]) total[k] += s[k];
  total.biggestFile = Math.max(total.biggestFile, s.biggestFile);
}

console.log(
  `\nGravadas: ${total.companies} empresas em ${total.cities} cidades de ${UFS.length} estado(s), ` +
    `${(total.bytes / 1e6).toFixed(1)} MB em ${total.files} arquivos (maior: ${(total.biggestFile / 1e6).toFixed(1)} MB) | ` +
    `${((Date.now() - t0) / 60000).toFixed(1)} min`,
);
if (unmatchedCities.length) {
  console.log(`\nATENÇÃO: ${unmatchedCities.length} município(s) da Receita sem cidade do IBGE (a busca não acha):`);
  for (const c of unmatchedCities) console.log(`  ${c}`);
  console.log('Ponha o nome certo em CITY_ALIASES (scripts/cnpj/build.mjs) e rode de novo.');
}
