// Lê a primeira entrada de um .zip da Receita como fluxo de texto, sem descompactar no disco.
// Os arquivos têm um único CSV cada (o de Estabelecimentos0 passa de 8 GB descompactado).
import { closeSync, createReadStream, openSync, readSync } from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";

export function openZipEntry(path) {
  const fd = openSync(path, "r");
  const header = Buffer.alloc(30);
  readSync(fd, header, 0, 30, 0);
  closeSync(fd);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path}: não é um zip`);
  const method = header.readUInt16LE(8);
  const start = 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const raw = createReadStream(path, { start, highWaterMark: 1 << 20 });
  if (method === 0) return raw;
  if (method !== 8) throw new Error(`${path}: compressão ${method} não suportada`);
  return raw.pipe(zlib.createInflateRaw());
}

/**
 * Linhas do CSV (latin1, separado por ";", campos entre aspas) já divididas em colunas.
 * `keep` (opcional) descarta a linha antes de dividir: bem mais rápido quando só interessa um estado.
 */
export async function* csvRows(path, keep) {
  const lines = readline.createInterface({ input: openZipEntry(path).setEncoding("latin1"), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line || (keep && !keep(line))) continue;
    yield line.slice(1, -1).split('";"');
  }
}
