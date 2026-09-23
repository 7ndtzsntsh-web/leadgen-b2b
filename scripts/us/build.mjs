// Gera public/us (mesmo formato de public/cnpj, ver scripts/cnpj/output.mjs) a partir do Overture Maps: base aberta
// de empresas (Meta, Microsoft, Amazon e outras, licença CDLA-Permissive-2.0), com telefone, site, categoria e
// a confiança de que o lugar existe. Nos EUA não há cadastro público com telefone como o CNPJ da Receita.
//
// Uso:  npm run us:gerar                 versão mais recente do Overture (baixa ~1,5 GB na 1ª vez, ~15 min)
//       npm run us:gerar -- 2026-09-23.0 uma versão específica
//
// Só entra o que é chance real de venda de site:
// - aberto (operating_status) e com confiança de existir >= MIN_CONFIDENCE;
// - sem marca (rede/franquia não compra site do dono local);
// - com telefone válido da América do Norte (0800 e afins ficam de fora);
// - SEM site próprio: só nenhum site ou só rede social/diretório (Yelp, Facebook...). Nos EUA ~75% já têm site.
// - telefone usado por 3+ empresas com nomes diferentes é central de atendimento ou agência: sai.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let DuckDBInstance;
try {
  ({ DuckDBInstance } = await import("@duckdb/node-api"));
} catch {
  console.error('Falta o DuckDB (lê os arquivos do Overture). Rode:  npm install --no-save @duckdb/node-api');
  process.exit(1);
}

const OUT = process.env.US_OUT ?? join("public", "us");
const CACHE = join(".cache", "overture");
const MIN_CONFIDENCE = 0.6;
const SPLIT_ROWS = 6000;
const SHARED = 3;
// Cidades na lista do autocompletar/vizinhas (vai junto no código da busca, que tem limite de tamanho).
// Cidade menor continua pesquisável como "Cidade - UF".
const MIN_CITY_LEADS = 5;
const FIELDS = ["id", "nome", "categoria", "endereco", "cep", "telefones", "email", "rede", "confianca", "atualizado"];

const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

// Páginas que não são site próprio: rede social, diretório, delivery, agendamento. business.site era o site grátis
// do Google, desligado em 2024 (o link não abre mais o site da empresa).
const PLATFORMS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "tiktok.com", "twitter.com", "x.com", "youtube.com", "linkedin.com",
  "linktr.ee", "linktree.com", "beacons.ai", "yelp.com", "yellowpages.com", "bbb.org", "nextdoor.com", "mapquest.com",
  "foursquare.com", "tripadvisor.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "houzz.com",
  "doordash.com", "grubhub.com", "ubereats.com", "seamless.com", "postmates.com", "order.online", "toasttab.com",
  "opentable.com", "resy.com", "vagaro.com", "booksy.com", "styleseat.com", "schedulicity.com", "fresha.com",
  "business.site", "google.com", "g.page", "goo.gl", "wa.me", "whatsapp.com", "zocdoc.com", "healthgrades.com",
  "avvo.com", "justia.com", "findlaw.com", "lawyers.com", "realtor.com", "zillow.com", "carfax.com", "cars.com",
];

// Nicho do gerador (mesmas chaves de src/lib/data/nicheCnaes.json) -> categorias do Overture (taxonomy.primary).
// Nome exato, ou /padrão/. As que não existirem na versão baixada são avisadas e ignoradas.
const NICHES = {
  padaria: ["bakery", "donut_shop", "bagel_shop", "cupcake_shop", "patisserie_cake_shop", "dessert_shop"],
  restaurante: [/_restaurant$/, "restaurant", "diner", "steakhouse", "bistro", "food_truck_stand", "delicatessen"],
  pizzaria: ["pizza_restaurant"],
  hamburgueria: ["burger_restaurant"],
  lanchonete: ["sandwich_shop", "delicatessen", "hot_dog_restaurant", "food_truck_stand", "snack_bar"],
  cafeteria: ["coffee_shop", "cafe", "tea_room", "bubble_tea_shop"],
  bar: ["bar", "sports_bar", "cocktail_bar", "pub", "wine_bar", "lounge", "dive_bar", "hookah_bar", "beer_bar", "brewery"],
  acougue: ["butcher_shop", "meat_shop"],
  supermercado: ["grocery_store", "supermarket", "convenience_store", "specialty_foods_store", "international_grocery_store"],
  clinica: [
    "doctors_office", "family_practice", "internal_medicine", "urgent_care_clinic", "pediatric_clinic", "dermatology",
    "obstetrics_and_gynecology", "orthopedics", "urology", "gastroenterology", "ear_nose_and_throat", "cardiology",
    "allergy_and_immunology", "pain_management", "podiatry", "neurology", "sports_medicine",
  ],
  odontologia: [/dentistry$/, "dental_clinic", "dentist", "orthodontics", "oral_and_maxillofacial_surgery", "endodontics", "periodontics"],
  estetica: ["medical_spa", "skin_care_and_makeup", "spa", "day_spa", "waxing", "eyelash_service", "laser_hair_removal", "tanning_salon"],
  salao: ["hair_salon", "beauty_salon", "hair_stylist", "hair_extensions", "blow_dry_bar", "nail_salon"],
  cabeleireiro: ["hair_salon", "hair_stylist", "hair_extensions", "blow_dry_bar"],
  barbearia: ["barber"],
  esmalteria: ["nail_salon"],
  advocacia: [/_law$/, "attorney_or_law_firm", "legal_service"],
  oficina: [
    "automotive_repair", "auto_body_shop", "tire_dealer_and_repair", "tire_shop", "truck_repair", "auto_glass_service",
    "oil_change_station", "automotive_service", "transmission_repair", "brake_service", "windshield_installation_and_repair",
  ],
  imobiliaria: ["real_estate_agent", "real_estate_service", "property_management", "commercial_real_estate", "real_estate_agency"],
  "energia solar": ["solar_installation", "solar_energy_contractor", "solar_panel_installation"],
  serralheria: ["metal_fabricator", "welding", "fence_and_gate_sales_service", "iron_work"],
  usinagem: ["machine_shop", "metal_fabricator"],
  logistica: ["freight_and_cargo_service", "courier_and_delivery_service", "motor_freight_trucking", "freight_forwarding_agency", "mover", "distribution_service"],
  contabilidade: ["accountant", "tax_service", "bookkeeper", "payroll_service"],
  veterinaria: ["veterinarian", "animal_hospital", "emergency_pet_hospital"],
  "pet shop": ["pet_store", "pet_groomer", "pet_boarding", "animal_or_pet_service", "dog_trainer", "pet_sitting"],
  academia: ["gym", "fitness_trainer", "sport_or_fitness_facility", "boot_camp", "pilates_studio", "yoga_studio", "martial_arts_club", "boxing_class", "cycling_studio"],
  psicologia: ["psychology", "psychotherapy", "counseling", "behavioral_or_mental_health_clinic", "psychiatry"],
  fisioterapia: ["physical_therapy", "chiropractic", "occupational_therapy", "acupuncture"],
  nutricao: ["nutrition_service", "dietitian", "weight_loss_center", "health_coaching"],
  escola: ["tutoring_service", "preschool", "day_care_preschool", "child_care_and_day_care", "specialty_school", "music_school", "art_school", "educational_service"],
  "escola de idiomas": ["language_school"],
  autoescola: ["driving_school"],
  hotel: ["hotel", "motel", "lodging", "bed_and_breakfast", "inn", "guest_house", "resort"],
  construcao: ["contractor", "building_or_construction_service", "home_developer", "builder", "roofing", "masonry_concrete", "flooring_contractor", "painting", "general_contractor", "remodeling"],
  arquitetura: ["architect", "architectural_designer", "interior_design", "landscape_architect"],
  marcenaria: ["carpenter", "cabinetry", "furniture_repair", "woodworking"],
  moveis: ["furniture_store", "mattress_store", "home_decor_store"],
  lavanderia: ["laundromat", "dry_cleaning", "laundry_service"],
  "estetica automotiva": ["car_wash", "auto_detailing", "car_window_tinting", "auto_customization"],
  "lava jato": ["car_wash", "auto_detailing"],
  grafica: ["printing_service", "sign_making", "t_shirt_printing_service", "commercial_printer", "screen_printing"],
  fotografia: ["photography_service", "event_photography_service", "photographer", "video_film_production"],
  eventos: ["party_and_event_planning", "event_venue", "wedding_planning", "party_equipment_rental", "dj_service"],
  buffet: ["caterer", "buffet_restaurant"],
  farmacia: ["pharmacy", "drugstore"],
  otica: ["optometry", "eyewear_store", "vision_or_eye_care_clinic"],
  floricultura: ["florist", "flowers_and_gifts_store"],
  seguranca: ["security_service", "security_systems"],
  dedetizacao: ["pest_control_service"],
  "ar condicionado": ["hvac_service"],
  "manutencao residencial": ["handyman", "home_service", "appliance_repair_service", "garage_door_service", "pool_cleaning", "carpet_cleaning"],
  eletricista: ["electrician"],
  encanador: ["plumbing"],
  "assistencia tecnica": ["it_service_and_computer_repair", "mobile_phone_repair", "appliance_repair_service", "electronics_repair"],
  moda: ["clothing_store", "womens_clothing_store", "mens_clothing_store", "fashion_boutique", "childrens_clothing_store", "fashion_and_apparel_store", "bridal_shop"],
  calcados: ["shoe_store"],
  tatuagem: ["tattoo_and_piercing"],
  "agencia de viagem": ["travel_agent", "travel_service"],
};
// Sinônimos do gerador que usam a mesma lista.
const SAME = {
  "salao de beleza": "salao", dentista: "odontologia", advogado: "advocacia", mecanica: "oficina", psicologo: "psicologia",
  nutricionista: "nutricao", pousada: "hotel", fotografo: "fotografia", "loja de roupas": "moda",
  "estudio de tatuagem": "tatuagem", "agencia de viagens": "agencia de viagem",
};

async function latestRelease() {
  const res = await fetch("https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/");
  const releases = [...(await res.text()).matchAll(/<Prefix>release\/([\d.-]+)\/<\/Prefix>/g)].map((m) => m[1]).sort();
  if (!releases.length) throw new Error("Não consegui ler a lista de versões do Overture.");
  return releases.at(-1);
}

const release = process.argv[2] ?? (await latestRelease());
if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) {
  console.error("Uso: node scripts/us/build.mjs [AAAA-MM-DD.N]");
  process.exit(1);
}
mkdirSync(join(CACHE, "tmp"), { recursive: true });
const parquet = join(CACHE, `${release}-us.parquet`).replace(/\\/g, "/");

const db = await DuckDBInstance.create(":memory:", { threads: "8", memory_limit: "4GB", temp_directory: join(CACHE, "tmp").replace(/\\/g, "/") });
const con = await db.connect();
const rowsOf = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJS();
await con.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET http_retries=8; SET http_timeout=120000;");

const t0 = Date.now();
if (!existsSync(parquet)) {
  // Uma leitura só, com as colunas que interessam: as próximas rodadas no mesmo mês usam o arquivo local.
  console.log(`Baixando do Overture ${release} as empresas dos EUA com telefone (demora uns 15 min)...`);
  const src = `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*`;
  await con.run(`COPY (
    SELECT id, names.primary AS name, taxonomy.primary AS cat, confidence, operating_status AS status,
           websites, socials, emails, phones, brand.names.primary AS brand,
           addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS zip,
           addresses[1].region AS state,
           (bbox.xmin + bbox.xmax) / 2 AS x, (bbox.ymin + bbox.ymax) / 2 AS y,
           list_max(list_transform(sources, s -> s.update_time)) AS updated
    FROM read_parquet('${src}')
    WHERE bbox.xmin BETWEEN -180 AND -64 AND bbox.ymin BETWEEN 17 AND 72
      AND addresses[1].country = 'US' AND len(phones) > 0
  ) TO '${parquet}' (FORMAT parquet, COMPRESSION zstd)`);
  console.log(`  pronto em ${((Date.now() - t0) / 60000).toFixed(1)} min`);
} else {
  console.log(`Reaproveitando ${parquet}`);
}

// Categorias do nicho -> nomes que existem nesta versão.
const existing = new Map((await rowsOf(`SELECT cat, count(*) n FROM read_parquet('${parquet}') WHERE cat IS NOT NULL GROUP BY 1`)).map((r) => [r.cat, Number(r.n)]));
const nicheCats = {};
const missing = new Set();
for (const [niche, patterns] of Object.entries(NICHES)) {
  const cats = new Set();
  for (const p of patterns) {
    if (p instanceof RegExp) for (const c of existing.keys()) { if (p.test(c)) cats.add(c); }
    else if (existing.has(p)) cats.add(p);
    else missing.add(p);
  }
  nicheCats[niche] = [...cats].sort();
}
for (const [alias, target] of Object.entries(SAME)) nicheCats[alias] = nicheCats[target];
if (missing.size) console.log(`Categorias que não existem nesta versão (ignoradas): ${[...missing].sort().join(", ")}`);
const allCats = [...new Set(Object.values(nicheCats).flat())];

const hostOf = (url) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const isPlatform = (url) => {
  const host = hostOf(url);
  return !host || PLATFORMS.some((p) => host === p || host.endsWith(`.${p}`));
};

// Mesmas regras de cleanPhone (src/lib/leadRules.ts) para "us". Devolve 10 dígitos ou null.
const NON_GEO = new Set(["800", "822", "833", "844", "855", "866", "877", "888", "880", "881", "882", "883", "884", "885", "886", "887", "889", "900", "500", "521", "522", "523", "524", "525", "526", "527", "528", "529", "533", "544", "566", "577", "588", "600", "700", "710"]);
function usPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^(\d)\1+$/.test(d)) return null;
  const area = d.slice(0, 3);
  const exchange = d.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || /^[2-9]11$/.test(area) || NON_GEO.has(area)) return null;
  if (!/^[2-9]\d\d$/.test(exchange) || /^[2-9]11$/.test(exchange)) return null;
  if (exchange === "555" && d.slice(6, 8) === "01") return null;
  return d;
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const nameKey = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const cityName = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());

const quoted = allCats.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
// Site próprio = algum endereço que não é de plataforma. Filtrado já na consulta: nos EUA ~75% têm site, e trazer
// todos para a memória não caberia.
const platformRe = `^(https?://)?([a-z0-9-]+\\.)*(${PLATFORMS.map((p) => p.replace(/\./g, "\\.")).join("|")})(:\\d+)?([/?#]|$)`;
const counts = (await rowsOf(`
  SELECT count(*) AS niche,
         count(*) FILTER (WHERE len(list_filter(coalesce(websites, []), w -> NOT regexp_matches(lower(trim(w)), '${platformRe}'))) > 0) AS with_site
  FROM read_parquet('${parquet}')
  WHERE cat IN (${quoted}) AND coalesce(status, 'open') = 'open' AND confidence >= ${MIN_CONFIDENCE} AND brand IS NULL`))[0];
const candidates = await rowsOf(`
  SELECT id, name, cat, confidence, websites, socials, emails, phones, street, city, zip, upper(state) AS state, x, y, updated
  FROM read_parquet('${parquet}')
  WHERE cat IN (${quoted})
    AND coalesce(status, 'open') = 'open'
    AND confidence >= ${MIN_CONFIDENCE}
    AND brand IS NULL
    AND name IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL
    AND len(list_filter(coalesce(websites, []), w -> NOT regexp_matches(lower(trim(w)), '${platformRe}'))) = 0`);
console.log(`${Number(counts.niche)} empresas dos nichos, abertas e sem marca; ${Number(counts.with_site)} já têm site próprio; ${candidates.length} sem site`);

// 1ª passada: telefone limpo, sem site próprio; conta em quantos nomes diferentes cada telefone aparece.
const phoneNames = new Map();
const kept = [];
let withSite = 0;
let noPhone = 0;
let badState = 0;
for (const r of candidates) {
  if (!STATES[r.state]) { badState++; continue; }
  const websites = r.websites ?? [];
  if (websites.some((w) => !isPlatform(w))) { withSite++; continue; } // o filtro da consulta já tirou quase todos
  const phones = [...new Set((r.phones ?? []).map(usPhone).filter(Boolean))].slice(0, 2);
  if (!phones.length) { noPhone++; continue; }
  const key = nameKey(r.name);
  for (const p of phones) {
    if (!phoneNames.has(p)) phoneNames.set(p, new Set());
    const names = phoneNames.get(p);
    if (names.size < SHARED) names.add(key);
  }
  kept.push({ ...r, phones });
}

// 2ª passada: tira telefone de central/agência, repetidos na cidade, e monta as linhas.
const states = new Map();
const centroids = new Map();
let shared = 0;
let duplicated = 0;
for (const r of kept) {
  const phones = r.phones.filter((p) => phoneNames.get(p).size < SHARED);
  if (!phones.length) { shared++; continue; }
  const city = cityName(r.city);
  const citySlug = slug(city);
  if (!citySlug) continue;
  if (!states.has(r.state)) states.set(r.state, new Map());
  const cities = states.get(r.state);
  if (!cities.has(citySlug)) cities.set(citySlug, { city, rows: [], seen: new Map() });
  const entry = cities.get(citySlug);
  const dupKey = phones[0];
  const previous = entry.seen.get(dupKey);
  const conf = Math.round(Number(r.confidence) * 100);
  if (previous) {
    duplicated++;
    if (previous[8] >= conf) continue;
    entry.rows.splice(entry.rows.indexOf(previous), 1);
  }
  const social = [...(r.socials ?? []), ...(r.websites ?? [])].find((u) => hostOf(u)) ?? "";
  const email = (r.emails ?? []).find((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e))?.toLowerCase() ?? "";
  const row = [
    String(r.id).replace(/-/g, "").slice(0, 16),
    String(r.name).trim(),
    r.cat,
    String(r.street ?? "").trim(),
    String(r.zip ?? "").slice(0, 5),
    phones,
    email,
    social,
    conf,
    r.updated ? String(r.updated).slice(0, 7) : "",
  ];
  entry.rows.push(row);
  entry.seen.set(dupKey, row);
  const c = centroids.get(`${r.state}/${citySlug}`) ?? { x: 0, y: 0, n: 0 };
  if (Number.isFinite(r.x) && Number.isFinite(r.y)) { c.x += r.x; c.y += r.y; c.n++; }
  centroids.set(`${r.state}/${citySlug}`, c);
}

// Gravação: mesmo formato de public/cnpj.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const total = { companies: 0, cities: 0, files: 0, bytes: 0, biggest: 0 };
const summary = {};
const cityList = [];
for (const [state, cities] of [...states].sort(([a], [b]) => a.localeCompare(b))) {
  const dir = join(OUT, state.toLowerCase());
  mkdirSync(dir, { recursive: true });
  const index = {};
  let companies = 0;
  const write = (path, body) => {
    writeFileSync(path, body);
    total.files++;
    total.bytes += body.length;
    total.biggest = Math.max(total.biggest, body.length);
  };
  for (const [citySlug, { city, rows }] of [...cities].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    companies += rows.length;
    const file = (linhas) => JSON.stringify({ versao: release, cidade: city, estado: state, campos: FIELDS, linhas });
    if (rows.length <= SPLIT_ROWS) {
      write(join(dir, `${citySlug}.json`), file(rows));
      index[citySlug] = rows.length;
    } else {
      const byCat = new Map();
      for (const row of rows) {
        if (!byCat.has(row[2])) byCat.set(row[2], []);
        byCat.get(row[2]).push(row);
      }
      mkdirSync(join(dir, citySlug));
      index[citySlug] = {};
      for (const [cat, part] of [...byCat].sort(([a], [b]) => a.localeCompare(b))) {
        write(join(dir, citySlug, `${cat}.json`), file(part));
        index[citySlug][cat] = part.length;
      }
    }
    const c = centroids.get(`${state}/${citySlug}`);
    cityList.push([city, state, rows.length, c?.n ? Math.round((c.y / c.n) * 100) / 100 : null, c?.n ? Math.round((c.x / c.n) * 100) / 100 : null]);
  }
  write(join(dir, "index.json"), JSON.stringify({ versao: release, estado: state, cidades: index }));
  summary[state] = { empresas: companies, cidades: cities.size };
  total.companies += companies;
  total.cities += cities.size;
}
writeFileSync(join(OUT, "index.json"), JSON.stringify({ fonte: "Overture Maps Foundation (CDLA-Permissive-2.0)", versao: release, estados: summary }, null, 1) + "\n");

// Nicho -> categorias, e cidades (autocompletar e vizinhas), para a busca.
writeFileSync(join("src", "lib", "data", "nicheOverture.json"), JSON.stringify(nicheCats, null, 1) + "\n");
const listed = cityList.filter((c) => c[2] >= MIN_CITY_LEADS).sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
writeFileSync(join("src", "lib", "data", "usCities.json"), JSON.stringify(listed) + "\n");

console.log(
  `\nGravadas: ${total.companies} empresas em ${total.cities} cidades de ${states.size} estados, ` +
    `${(total.bytes / 1e6).toFixed(1)} MB em ${total.files} arquivos (maior: ${(total.biggest / 1e6).toFixed(1)} MB)\n` +
    `Fora: ${withSite} com site próprio, ${noPhone} sem telefone válido, ${shared} com telefone de central/agência, ` +
    `${duplicated} repetidas, ${badState} fora dos estados | ${((Date.now() - t0) / 60000).toFixed(1)} min`,
);
