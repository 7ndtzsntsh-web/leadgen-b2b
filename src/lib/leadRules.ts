import { UF_DDDS } from "./ufData";

export type DomainStatus = "SSL Válido" | "HTTP Inseguro" | "Erro 404/Inativo" | "Só Rede Social";
export type SiteStatus = DomainStatus | "Sem Site";
export type PhoneType = "MOBILE" | "LANDLINE" | "UNKNOWN";

export const NO_PHONE = "Não informado";

export interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  siteStatus: SiteStatus;
  address: string;
  rating: number;
  reviewsCount: number;
  score: number;
  website?: string;
  phoneType?: PhoneType;
  /** WhatsApp achado no site/perfil da empresa (tem prioridade sobre o telefone do Google). */
  whatsapp?: string;
  isExpansion?: boolean;
  expansionSource?: string;
}

/** Empresas que, na prática, não têm um site funcionando: são as melhores oportunidades para vender um site. */
export function lacksWorkingSite(status: SiteStatus): boolean {
  return status === "Sem Site" || status === "Só Rede Social" || status === "Erro 404/Inativo";
}

/** Mesma regra no servidor e no navegador (antes eram duas versões diferentes). */
export function matchesSiteFilters(status: SiteStatus, onlyNoSite: boolean, onlyInsecure: boolean): boolean {
  if (!onlyNoSite && !onlyInsecure) return true;
  return (onlyNoSite && lacksWorkingSite(status)) || (onlyInsecure && status === "HTTP Inseguro");
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

const DIAL_CODES: Record<string, string> = { br: "55", pt: "351", us: "1", es: "34" };

/**
 * Normaliza e valida o telefone. `uf` (opcional) restringe o DDD à região pesquisada.
 * Retorna NO_PHONE quando o número não é utilizável.
 */
export function cleanPhone(phone: string, country: string, uf?: string): string {
  if (!phone || phone === NO_PHONE) return NO_PHONE;
  const digits = phone.replace(/\D/g, "");

  // Sequências repetidas (000000000, 999999999) são números falsos.
  if (/^(\d)\1+$/.test(digits)) return NO_PHONE;

  if (country === "br") {
    const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length < 10 || local.length > 11) return NO_PHONE;
    // 0800/0300/4004... não atendem por WhatsApp e não levam ao dono.
    if (/^(0800|0300|0303|4004|4003)/.test(local) || local.startsWith("0")) return NO_PHONE;
    const ddd = local.slice(0, 2);
    const allowed = uf ? UF_DDDS[uf] : undefined;
    if (allowed && !allowed.includes(ddd)) return NO_PHONE;
    return `(${ddd}) ${local.slice(2)}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? phone : NO_PHONE;
}

export function getPhoneType(phone: string, country: string): PhoneType {
  if (!phone || phone === NO_PHONE) return "UNKNOWN";
  const digits = phone.replace(/\D/g, "");
  if (country === "br") {
    const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === "9") return "MOBILE";
    if (local.length === 10 && "2345".includes(local[2])) return "LANDLINE";
  } else if (country === "pt") {
    const local = digits.startsWith("351") && digits.length >= 12 ? digits.slice(3) : digits;
    if (local.length === 9) return local[0] === "9" ? "MOBILE" : local[0] === "2" ? "LANDLINE" : "UNKNOWN";
  } else if (country === "es") {
    const local = digits.startsWith("34") && digits.length >= 11 ? digits.slice(2) : digits;
    if (local.length === 9) return "67".includes(local[0]) ? "MOBILE" : "89".includes(local[0]) ? "LANDLINE" : "UNKNOWN";
  }
  return "UNKNOWN";
}

/** Escolhe o melhor WhatsApp entre os números achados: válido para a região e, de preferência, celular. */
export function pickWhatsApp(candidates: string[], country: string, uf?: string): string | undefined {
  const valid = candidates.map((c) => cleanPhone(c, country, uf)).filter((p) => p !== NO_PHONE);
  return valid.find((p) => getPhoneType(p, country) === "MOBILE") ?? valid[0];
}

const sameNumber = (a: string, b: string) => a.replace(/\D/g, "").slice(-9) === b.replace(/\D/g, "").slice(-9);

/**
 * Número que abre no WhatsApp. O WhatsApp achado no site vem primeiro; se não houver,
 * o próprio telefone quando não é fixo. Fixo sem WhatsApp conhecido devolve undefined.
 */
export function whatsappOf(lead: Pick<Lead, "phone" | "phoneType" | "whatsapp">): string | undefined {
  if (lead.whatsapp) return lead.whatsapp;
  return lead.phone !== NO_PHONE && lead.phoneType !== "LANDLINE" ? lead.phone : undefined;
}

/** Telefone para ligar: o fixo, ou o telefone do Google quando o WhatsApp é outro número. */
export function callOf(lead: Pick<Lead, "phone" | "phoneType" | "whatsapp">): string | undefined {
  if (lead.phone === NO_PHONE) return undefined;
  if (lead.phoneType === "LANDLINE") return lead.phone;
  return lead.whatsapp && !sameNumber(lead.whatsapp, lead.phone) ? lead.phone : undefined;
}

/** Só dígitos, com código do país, pronto para wa.me / tel:. */
export function internationalNumber(phone: string, country: string): string {
  const digits = phone.replace(/\D/g, "");
  const code = DIAL_CODES[country] ?? "";
  if (!code) return digits;
  if (country === "br") {
    const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    return code + local;
  }
  if (digits.startsWith(code) && digits.length >= code.length + 9) return digits;
  return code + digits.replace(/^0+/, "");
}

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------

export interface ScoreInput {
  siteStatus: SiteStatus;
  rating: number;
  reviewsCount: number;
  /** false quando a fonte não fornece avaliações (ex.: fallback OpenStreetMap). */
  reviewsKnown: boolean;
  phoneType: PhoneType;
  hasPhone: boolean;
  hasEmail: boolean;
}

/**
 * Nota de 0 a 100 da chance de virar venda de site.
 * - Falta de site funcionando é o gatilho principal.
 * - Negócio bem avaliado e com muitos clientes tem motivo e verba para investir (e o pitch cita a reputação).
 * - Celular = WhatsApp direto com o dono, o canal em que essa abordagem funciona.
 * - Sem nenhuma avaliação costuma ser negócio parado ou recém-aberto.
 */
export function scoreLead(input: ScoreInput): number {
  let score = 0;

  switch (input.siteStatus) {
    case "Erro 404/Inativo": score += 50; break;
    case "Sem Site":
    case "Só Rede Social": score += 45; break;
    case "HTTP Inseguro": score += 35; break;
    default: break;
  }

  if (input.reviewsKnown) {
    if (input.rating >= 4.0 && input.reviewsCount >= 20) score += 20;
    else if (input.rating >= 4.0 && input.reviewsCount >= 5) score += 10;
    if (input.reviewsCount >= 100) score += 10;
    if (input.reviewsCount === 0) score -= 10;
  }

  if (input.phoneType === "MOBILE") score += 15;
  else if (input.hasPhone) score += 8;
  if (input.hasEmail) score += 10;

  return Math.max(0, Math.min(score, 100));
}
