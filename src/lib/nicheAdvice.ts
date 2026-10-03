import { normalizeText } from "./text";

/**
 * Ramos que mais compram site (pedido do dono em 03/10/2026: "preciso achar os clientes que queiram").
 * Medido nos dados do Overture dos EUA (set/2026, empresas independentes e abertas; no Brasil não há como medir):
 * nesses ramos ~9 em cada 10 já têm site próprio. Quem ainda não tem perde cliente para o concorrente, e o dono
 * sabe o valor de um site. Em SC, cada um tem centenas ou milhares de empresas com celular na Receita.
 */
export const BEST_NICHES = [
  "dentista", "clínica", "advogado", "arquitetura", "energia solar", "ar condicionado", "veterinária", "fisioterapia",
  "psicólogo", "autoescola", "dedetização", "pousada",
];

/**
 * Ramos em que poucas empresas têm site (% com site próprio, mesma medição): vendem pelo Instagram, por aplicativo
 * ou pelo boca a boca. Barbearia, salão, oficina e padaria eram os ramos que o dono testava.
 */
const WEAK_NICHES: Record<string, number> = {
  barbearia: 52, tatuagem: 60, "estudio de tatuagem": 60, salao: 65, "salao de beleza": 65, acougue: 66,
  "lava jato": 69, lavanderia: 69, cabeleireiro: 70, oficina: 70, mecanica: 70, esmalteria: 71,
  "estetica automotiva": 71, supermercado: 72,
};

/** % de empresas com site no ramo digitado, quando é um ramo que compra pouco site (senão undefined). */
export function weakNicheShare(term: string): number | undefined {
  const t = normalizeText(term);
  const singular = t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
  return WEAK_NICHES[t] ?? WEAK_NICHES[singular];
}
