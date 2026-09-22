import { UF_DDDS } from "./ufData";

export type DomainStatus = "SSL Válido" | "HTTP Inseguro" | "Erro 404/Inativo" | "Só Rede Social";
export type SiteStatus = DomainStatus | "Sem Site";
export type PhoneType = "MOBILE" | "LANDLINE" | "UNKNOWN";

export const NO_PHONE = "Não informado";

/** Uma checagem real feita sobre o lead. `ok: false` = não confirmada (o motivo vai em `detail`). */
export interface LeadCheck {
  key: "telefone" | "whatsapp" | "email" | "site" | "atividade" | "cidade";
  ok: boolean;
  detail: string;
  /**
   * Só informação: não existe forma gratuita de checar (ex.: se um celular tem WhatsApp). Aparece para o usuário,
   * mas não derruba o selo VERIFICADO — senão nenhum lead de celular seria verificado nunca.
   */
  info?: boolean;
}

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
  /** Outros números válidos da empresa (ex.: o fixo, quando o principal é o celular). */
  otherPhones?: string[];
  /** WhatsApp CONFIRMADO: link no site da empresa ou campo de WhatsApp do cadastro. Celular sem confirmação não entra aqui. */
  whatsapp?: string;
  /** Ano da última atualização do cadastro, só quando ele é antigo (5 anos ou mais): a empresa pode ter fechado. */
  staleSince?: number;
  /** CNPJ (14 dígitos), quando o lead veio do cadastro da Receita Federal. */
  cnpj?: string;
  /** Data de abertura da empresa na Receita (AAAA-MM-DD). */
  openedOn?: string;
  /** Cidade real do endereço (usada no texto de abordagem; pode diferir da cidade pesquisada). */
  city?: string;
  /** Checagens reais feitas neste lead e se todas foram confirmadas. */
  checks?: LeadCheck[];
  verified?: boolean;
  isExpansion?: boolean;
  expansionSource?: string;
}

/** 12345678000190 -> 12.345.678/0001-90 */
export const formatCnpj = (cnpj: string) =>
  cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj;

/** Aberta há até 2 anos: ainda montando a presença online, a melhor hora para vender site. */
export function isNewCompany(openedOn: string | undefined, now = new Date()): boolean {
  if (!openedOn) return false;
  const opened = Date.parse(openedOn);
  return !Number.isNaN(opened) && now.getTime() - opened <= 2 * 365.25 * 24 * 3600 * 1000;
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
const BR_DDDS = new Set(Object.values(UF_DDDS).flat());

/** Mesmo número escrito de jeitos diferentes (com/sem DDI, com/sem máscara). */
export const sameNumber = (a: string, b: string) => a.replace(/\D/g, "").slice(-9) === b.replace(/\D/g, "").slice(-9);

/**
 * Separa um campo com vários números ("+55 48 3024-3459;+55 48 3334-3459", "3222-1234 / 99999-8888").
 * Antes, os dígitos eram juntados num número só, grande demais, e o lead ficava sem telefone.
 */
export function splitPhones(raw: string | undefined): string[] {
  if (!raw || raw === NO_PHONE) return [];
  return raw.split(/[;,/|]|\s+ou\s+|\s+e\s+/i).map((p) => p.trim()).filter((p) => /\d/.test(p));
}

/**
 * Normaliza e valida o telefone. `uf` (opcional) restringe o DDD à região pesquisada.
 * Retorna NO_PHONE quando o número não é utilizável: melhor não mostrar do que mostrar um número errado.
 */
export function cleanPhone(phone: string, country: string, uf?: string): string {
  if (!phone || phone === NO_PHONE) return NO_PHONE;
  let digits = phone.replace(/\D/g, "");

  // Sequências repetidas (000000000, 999999999) são números falsos.
  if (/^(\d)\1+$/.test(digits)) return NO_PHONE;

  if (country === "br") {
    if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
    // 0800/0300/4004... não atendem por WhatsApp e não levam ao dono.
    if (/^(0800|0300|0303|4004|4003|4020)/.test(digits)) return NO_PHONE;
    // Prefixo de discagem: "0 48 ..." (zero + DDD) ou "0 21 48 ..." (zero + operadora + DDD).
    if (digits.startsWith("0")) {
      if (digits.length === 11 || digits.length === 12) digits = digits.slice(1);
      else if (digits.length === 13 || digits.length === 14) digits = digits.slice(3);
    }

    const ddd = digits.slice(0, 2);
    if (!BR_DDDS.has(ddd)) return NO_PHONE;
    const allowed = uf ? UF_DDDS[uf] : undefined;
    if (allowed && !allowed.includes(ddd)) return NO_PHONE;

    let local = digits.slice(2);
    // Celular cadastrado antes de 2016, sem o 9 na frente ("48 9999-8888"): hoje não existe e não abre no WhatsApp.
    if (local.length === 8 && "6789".includes(local[0])) local = `9${local}`;

    if (local.length === 9 && local[0] === "9" && "6789".includes(local[1])) return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
    if (local.length === 8 && "2345".includes(local[0])) return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
    // Tamanho errado (ramal colado, dígito faltando) ou começo impossível: número não confiável.
    return NO_PHONE;
  }

  return digits.length >= 8 && digits.length <= 15 ? phone.trim() : NO_PHONE;
}

/** Limpa uma lista de números (vários campos, vários números por campo), sem repetir. */
export function cleanPhones(raws: (string | undefined)[], country: string, uf?: string): string[] {
  const out: string[] = [];
  for (const raw of raws) {
    for (const part of splitPhones(raw)) {
      const phone = cleanPhone(part, country, uf);
      if (phone !== NO_PHONE && !out.some((p) => sameNumber(p, phone))) out.push(phone);
    }
  }
  return out;
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

/**
 * Número que abre no WhatsApp: o WhatsApp confirmado ou, se não houver, o celular (que PODE ter WhatsApp;
 * a tela avisa que não é confirmado). Fixo e número de tipo desconhecido não viram WhatsApp: era assim que
 * apareciam números "que nem estão no zap".
 */
export function whatsappOf(lead: Pick<Lead, "phone" | "phoneType" | "whatsapp">): string | undefined {
  if (lead.whatsapp) return lead.whatsapp;
  return lead.phone !== NO_PHONE && lead.phoneType === "MOBILE" ? lead.phone : undefined;
}

/** O WhatsApp deste lead foi confirmado (site da empresa ou cadastro), e não só deduzido de um celular. */
export const hasConfirmedWhatsApp = (lead: Pick<Lead, "whatsapp">) => !!lead.whatsapp;

/**
 * Telefone para ligar: o fixo (ou de tipo desconhecido); o celular quando o WhatsApp é outro número; ou, quando o
 * principal é o celular, o outro número da empresa (normalmente o fixo).
 */
export function callOf(lead: Pick<Lead, "phone" | "phoneType" | "whatsapp" | "otherPhones">): string | undefined {
  if (lead.phone === NO_PHONE) return undefined;
  if (lead.phoneType !== "MOBILE") return lead.phone;
  if (lead.whatsapp && !sameNumber(lead.whatsapp, lead.phone)) return lead.phone;
  return lead.otherPhones?.find((p) => !lead.whatsapp || !sameNumber(p, lead.whatsapp));
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
  /** WhatsApp confirmado (link no site da empresa ou campo de WhatsApp do cadastro). */
  whatsappConfirmed: boolean;
  phoneType: PhoneType;
  hasPhone: boolean;
  hasEmail: boolean;
  /** Anos desde a última atualização/conferência do cadastro, quando a fonte informa. */
  ageYears?: number;
  /** Empresa aberta há até 2 anos (Receita): ainda montando a presença online, a melhor hora para vender site. */
  newCompany?: boolean;
}

/**
 * Nota de 0 a 100 da chance de virar venda de site.
 * - Falta de site funcionando é o gatilho principal.
 * - Negócio bem avaliado e com muitos clientes tem motivo e verba para investir (e o pitch cita a reputação).
 * - WhatsApp confirmado = conversa direta com o dono, o canal em que essa abordagem funciona. Celular sem
 *   confirmação vale menos: pode não ter WhatsApp.
 * - Sem nenhuma avaliação costuma ser negócio parado ou recém-aberto.
 * - Cadastro sem atualização há anos: a empresa pode ter fechado ou trocado de número.
 * - Empresa aberta há até 2 anos (Receita): ainda montando a presença online.
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

  if (input.whatsappConfirmed) score += 15;
  else if (input.phoneType === "MOBILE") score += 10;
  else if (input.hasPhone) score += 6;
  if (input.hasEmail) score += 10;

  if (input.ageYears !== undefined) {
    if (input.ageYears >= 5) score -= 20;
    else if (input.ageYears >= 3) score -= 10;
  }
  if (input.newCompany) score += 10;

  return Math.max(0, Math.min(score, 100));
}

/**
 * Ordem da lista: da maior nota (mais fácil de vender) para a menor.
 * Empates: verificado primeiro, depois quem tem WhatsApp, depois mais avaliações e, por fim, o nome
 * (assim a ordem é sempre a mesma para os mesmos leads).
 */
export function compareLeads(a: Lead, b: Lead): number {
  return (
    b.score - a.score ||
    Number(!!b.verified) - Number(!!a.verified) ||
    Number(!!b.whatsapp) - Number(!!a.whatsapp) ||
    b.reviewsCount - a.reviewsCount ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}
