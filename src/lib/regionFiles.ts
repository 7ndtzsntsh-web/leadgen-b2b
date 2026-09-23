/**
 * Leitura dos arquivos de empresas por estado/cidade, comum ao cadastro da Receita (public/cnpj) e ao Overture
 * Maps dos EUA (public/us). Formato em scripts/cnpj/output.mjs:
 *   <raiz>/<estado>/index.json           { cidades: { "<cidade>": linhas } } ou, se dividida, { "<cidade>": { "<ramo>": linhas } }
 *   <raiz>/<estado>/<cidade>.json         cidade pequena: tudo num arquivo
 *   <raiz>/<estado>/<cidade>/<ramo>.json  cidade grande: um arquivo por ramo (a busca baixa só o do nicho)
 */

// Reserva: se o próprio site recusar a leitura (proteção anti-robô), lê do repositório público no GitHub.
const RAW_BASE = "https://raw.githubusercontent.com/7ndtzsntsh-web/leadgen-b2b/main/public";
const FETCH_TIMEOUT_MS = 10_000;
// Limite do que fica em memória entre buscas, em linhas (empresas) e não em arquivos: um ramo de São Paulo tem
// mais empresas que uma cidade pequena inteira. Vale para os dois países juntos.
const MAX_CACHED_ROWS = 60_000;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const fetchData = async (origin: string, path: string) => (await fetchJson(`${origin}${path}`)) ?? (await fetchJson(`${RAW_BASE}${path}`));

/** Por cidade: total de linhas (um arquivo) ou, na cidade dividida, linhas por ramo (um arquivo por ramo). */
export interface RegionIndex {
  cidades: Record<string, number | Record<string, number>>;
}

const indexes = new Map<string, Promise<RegionIndex | null>>();

/** Índice de um estado (ex.: /cnpj/sc/index.json), guardado em memória. */
export function loadIndex(origin: string, path: string): Promise<RegionIndex | null> {
  const cached = indexes.get(path);
  if (cached) return cached;
  const pending = fetchData(origin, path).then((data) => ((data as RegionIndex | null)?.cidades ? (data as RegionIndex) : null));
  indexes.set(path, pending);
  pending.then((index) => { if (!index) indexes.delete(path); }); // falha temporária: tenta de novo na próxima busca
  return pending;
}

const files = new Map<string, Promise<unknown[] | null>>();
const fileSizes = new Map<string, number>();
let cachedRows = 0;

/** Um arquivo de empresas já convertido por `toItem`; os usados há mais tempo saem quando passa do limite. */
export function loadRows<T>(origin: string, path: string, toItem: (row: never) => T): Promise<T[] | null> {
  const cached = files.get(path);
  if (cached) {
    files.delete(path);
    files.set(path, cached);
    return cached as Promise<T[] | null>;
  }
  const pending = fetchData(origin, path).then((data) => (data as { linhas?: never[] } | null)?.linhas?.map(toItem) ?? null);
  files.set(path, pending);
  pending.then((items) => {
    if (!items) {
      files.delete(path);
      return;
    }
    fileSizes.set(path, items.length);
    cachedRows += items.length;
    for (const [old] of files) {
      if (cachedRows <= MAX_CACHED_ROWS) break;
      const size = fileSizes.get(old);
      if (size === undefined) continue; // ainda baixando
      files.delete(old);
      fileSizes.delete(old);
      cachedRows -= size;
    }
  });
  return pending;
}
