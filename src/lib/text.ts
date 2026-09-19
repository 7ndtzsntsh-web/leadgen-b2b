/** Minúsculas, sem acentos e com espaços normalizados. Usado para comparar o que o usuário digita. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
