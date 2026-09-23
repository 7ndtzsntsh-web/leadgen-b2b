// Gera public/cnpj/<uf>/<cidade>.json a partir dos dados abertos de CNPJ da Receita Federal.
//
// Uso:  node scripts/cnpj/download.mjs 2026-09      (baixa ~5,4 GB para .cache/cnpj/2026-09)
//       node scripts/cnpj/build.mjs 2026-09 SC       (gera os arquivos por cidade)
//
// Por que existe: o OpenStreetMap só tem telefone de ~15% das empresas e não diz se elas estão abertas.
// O cadastro da Receita tem todas as empresas ativas, com ramo (CNAE), endereço oficial, telefone e e-mail.
//
// O que fica de fora, de propósito:
// - empresa que não está ATIVA;
// - empresa sem nome fantasia (quase sempre MEI com o nome da pessoa: não dá para abordar como empresa);
// - telefone ou e-mail usado por 3 ou mais empresas diferentes: é do contador ou de um escritório, não do dono;
// - dados de sócios (não baixamos esse arquivo).
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { csvRows } from "./zip.mjs";

const [month, ...ufArgs] = process.argv.slice(2);
if (!/^\d{4}-\d{2}$/.test(month ?? "")) {
  console.error("Uso: node scripts/cnpj/build.mjs AAAA-MM [UF ...]");
  process.exit(1);
}
const UFS = ufArgs.length ? ufArgs.map((u) => u.toUpperCase()) : ["SC"];
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

const niches = JSON.parse(readFileSync("src/lib/data/nicheCnaes.json", "utf8"));
const TARGET = new Set(Object.entries(niches).filter(([k]) => !k.startsWith("_")).flatMap(([, v]) => v.cnaes));
const ACCOUNTING = new Set(niches.contabilidade.cnaes);

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
    name = name.replace(/[\s,.-]+(LTDA|ME|EPP|EIRELI|MEI|S\/A|SA|S\.A\.?)\.?$/i, "").trim();
  }
  return name;
}

// Município com nome diferente na Receita e no IBGE (o gerador usa o do IBGE).
const CITY_ALIASES = { "balneario-de-picarras": "balneario-picarras" };

/** DDD + número, só dígitos. A chave de contagem usa os 8 últimos dígitos (celular antigo e novo contam juntos). */
function phoneOf(ddd, tel) {
  const d = (ddd ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const t = (tel ?? "").replace(/\D/g, "");
  if (d.length !== 2 || t.length < 8 || t.length > 9) return null;
  return d + t;
}
const phoneKey = (p) => p.slice(0, 2) + p.slice(-8);

/** Conta em quantas empresas (CNPJ básico) diferentes um valor aparece. As filiais de uma empresa vêm juntas no arquivo. */
function countOwner(map, key, owner) {
  const e = map.get(key);
  if (!e) map.set(key, { owner, n: 1 });
  else if (e.owner !== owner) {
    e.owner = owner;
    e.n++;
  }
}

const municipios = new Map();
for await (const [code, name] of csvRows(join(SRC, "Municipios.zip"))) municipios.set(code, name);

const ufMarks = UFS.map((uf) => `";"${uf}";"`);
const keep = (line) => ufMarks.some((m) => line.includes(m));

const phoneOwners = new Map();
const emailOwners = new Map();
const candidates = [];
let ativasNaUf = 0;
const t0 = Date.now();

for (const i of FILE_NUMBERS) {
  const file = join(SRC, `Estabelecimentos${i}.zip`);
  if (!existsSync(file)) throw new Error(`Falta ${file}: rode antes scripts/cnpj/download.mjs ${month}`);
  let rows = 0;
  for await (const c of csvRows(file, keep)) {
    if (c.length < 28 || !UFS.includes(c[C.uf]) || c[C.situacao] !== "02") continue;
    rows++;
    const owner = c[C.basico];
    const phones = [phoneOf(c[C.ddd1], c[C.tel1]), phoneOf(c[C.ddd2], c[C.tel2])].filter(Boolean);
    for (const p of phones) countOwner(phoneOwners, phoneKey(p), owner);
    const email = c[C.email].trim().toLowerCase();
    if (email) countOwner(emailOwners, email, owner);
    if (!TARGET.has(c[C.cnae]) || !c[C.fantasia].trim()) continue;
    candidates.push({ c, phones, email });
  }
  ativasNaUf += rows;
  console.log(`Estabelecimentos${i}: ${rows} ativas em ${UFS.join(",")} | ${candidates.length} dos nichos até agora | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// Sites e redes sociais do OpenStreetMap (scripts/cnpj/osm.mjs): a Receita não tem site. Liga pelo telefone ou,
// quando o nome é único nas duas fontes, pelo nome.
const nameKey = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const osmPhoneKey = (raw) => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
};
const osmByPhone = new Map();
const osmByName = new Map();
for (const uf of UFS) {
  const file = join(".cache", "osm", `${uf.toLowerCase()}-sites.json`);
  if (!existsSync(file)) {
    console.log(`AVISO: sem ${file} (rode scripts/cnpj/osm.mjs ${uf}): as empresas ficam sem o site que o mapa tem.`);
    continue;
  }
  for (const [name, phones, website, social] of JSON.parse(readFileSync(file, "utf8")).lugares) {
    const site = website || social;
    if (!site) continue;
    for (const p of phones) {
      const k = osmPhoneKey(p);
      if (k) osmByPhone.set(k, site);
    }
    const k = nameKey(name);
    osmByName.set(k, osmByName.has(k) ? null : site); // nome repetido no mapa: não dá para saber qual é
  }
}
const cnpjNameCount = new Map();
for (const { c } of candidates) {
  const k = nameKey(c[C.fantasia]);
  cnpjNameCount.set(k, (cnpjNameCount.get(k) ?? 0) + 1);
}
let sitePeloTelefone = 0;
let sitePeloNome = 0;

const byCity = new Map();
let semContato = 0;
let telefonesDeContador = 0;
for (const { c, phones, email } of candidates) {
  const okPhones = phones.filter((p) => phoneOwners.get(phoneKey(p)).n < SHARED);
  telefonesDeContador += phones.length - okPhones.length;
  const sharedEmail = email && emailOwners.get(email).n >= SHARED;
  const accountantEmail = email && !ACCOUNTING.has(c[C.cnae]) && /contab/.test(email);
  const okEmail = email && !sharedEmail && !accountantEmail ? email : "";
  if (okPhones.length === 0 && !okEmail) {
    semContato++;
    continue;
  }
  const city = municipios.get(c[C.municipio]) ?? c[C.municipio];
  const citySlug = CITY_ALIASES[slug(city)] ?? slug(city);
  const key = `${c[C.uf]}/${citySlug}`;
  const name = displayName(c[C.fantasia]);
  if (!name) {
    semContato++;
    continue;
  }
  let site = "";
  for (const p of okPhones) {
    site = osmByPhone.get(phoneKey(p)) ?? "";
    if (site) break;
  }
  if (site) sitePeloTelefone++;
  else if (cnpjNameCount.get(nameKey(c[C.fantasia])) === 1 && osmByName.get(nameKey(c[C.fantasia]))) {
    site = osmByName.get(nameKey(c[C.fantasia]));
    sitePeloNome++;
  }
  const street = [c[C.tipoLogradouro], c[C.logradouro]].map((s) => s.trim()).filter(Boolean).join(" ");
  const address = [titleCase(street), c[C.numero].trim(), titleCase(c[C.complemento])].filter(Boolean).join(", ");
  const row = [
    c[C.basico] + c[C.ordem] + c[C.dv],
    name,
    c[C.cnae],
    c[C.inicio],
    address,
    titleCase(c[C.bairro]),
    c[C.cep],
    okPhones,
    okEmail,
    site,
  ];
  if (!byCity.has(key)) byCity.set(key, { uf: c[C.uf], city: titleCase(city), rows: [] });
  byCity.get(key).rows.push(row);
}

for (const uf of UFS) rmSync(join(OUT, uf.toLowerCase()), { recursive: true, force: true });
const index = { mes: month, ufs: UFS, fonte: "Receita Federal - Dados Abertos CNPJ", cidades: {} };
let total = 0;
let bytes = 0;
for (const [key, { uf, city, rows }] of byCity) {
  const dir = join(OUT, uf.toLowerCase());
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({
    mes: month,
    cidade: city,
    uf,
    campos: ["cnpj", "nome", "cnae", "inicio", "endereco", "bairro", "cep", "telefones", "email", "site"],
    linhas: rows,
  });
  writeFileSync(join(dir, `${key.split("/")[1]}.json`), body);
  index.cidades[key] = rows.length;
  total += rows.length;
  bytes += body.length;
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));

console.log(`\nAtivas em ${UFS.join(",")}: ${ativasNaUf}`);
console.log(`Dos nichos, com nome fantasia: ${candidates.length} | sem contato próprio (descartadas): ${semContato}`);
console.log(`Telefones descartados por serem de contador/escritório (3+ empresas): ${telefonesDeContador}`);
console.log(`Site/rede social vindo do mapa: ${sitePeloTelefone} pelo telefone, ${sitePeloNome} pelo nome`);
console.log(`Gravadas: ${total} empresas em ${byCity.size} cidades, ${(bytes / 1e6).toFixed(1)} MB`);
