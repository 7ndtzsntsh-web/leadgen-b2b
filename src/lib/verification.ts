import type { AddressCheck } from "./address";
import type { LeadCheck, SiteStatus } from "./leadRules";

/**
 * De onde veio o telefone mostrado:
 * - google: Google Maps (a própria empresa mantém);
 * - confirmado: o número do cadastro aparece também no site da empresa;
 * - site: tirado do site da empresa (o cadastro não tinha, ou tinha outro número);
 * - receita: cadastro oficial de CNPJ (número exclusivo da empresa: os de contador são descartados na importação);
 * - cadastro: só o cadastro do mapa, sem outra fonte para conferir.
 */
export type PhoneOrigin = "google" | "confirmado" | "site" | "receita" | "cadastro";

/** Até quantos anos de empresa o telefone da Receita é considerado atual (quem abriu há mais tempo pode ter trocado). */
const RECEITA_PHONE_FRESH_YEARS = 6;
export type WhatsAppOrigin = "site" | "cadastro";

export interface VerificationInput {
  /** Telefone do lead depois de validado (formato, DDD do estado). Ausente se não houver telefone utilizável. */
  phone?: string;
  phoneOrigin?: PhoneOrigin;
  /** O cadastro tinha outro número, trocado pelo do site da empresa. */
  phoneReplaced?: boolean;
  /** UF usada para validar o DDD (mostrada no detalhe). */
  uf?: string;
  /** WhatsApp confirmado (link no site/perfil da empresa ou campo de WhatsApp do cadastro). */
  whatsapp?: string;
  whatsappOrigin?: WhatsAppOrigin;
  /** O telefone é celular, mas não há confirmação de que tenha WhatsApp. */
  unconfirmedMobile?: boolean;
  /** Situação do domínio do e-mail; ausente se o lead não tem e-mail. `invalid` nunca chega aqui (o e-mail é descartado). */
  email?: "ok" | "unknown";
  siteStatus: SiteStatus;
  /** Site achado pela busca (não estava no cadastro). */
  siteFound?: string;
  /** Como foi achado: pelo domínio do e-mail da empresa ou pelo nome. */
  siteFoundVia?: "email" | "nome";
  /** Endereços testados sem sucesso na busca pelo nome; ausente quando a busca não foi feita. */
  siteSearched?: string[];
  /** A fonte informou que a empresa está em funcionamento (status do Google = OPERATIONAL). */
  activeConfirmed: boolean;
  /** CNPJ com situação ATIVA na Receita Federal. */
  cnpjActive?: boolean;
  /** Data de abertura da empresa na Receita (AAAA-MM-DD). */
  openedOn?: string;
  /** Última atualização do cadastro no mapa (data ISO). */
  lastEdit?: string;
  /** Última vez que um colaborador do mapa conferiu a empresa no local (check_date, data ISO). */
  checkedOn?: string;
  /** Resultado da conferência do endereço. `null` quando a busca é por região inteira (sem cidade específica). */
  address: AddressCheck | null;
  now?: Date;
}

const SITE_DETAIL: Record<SiteStatus, string> = {
  "Sem Site": "Nenhum site cadastrado para esta empresa",
  "Só Rede Social": "Só perfil em rede social ou diretório (checado agora)",
  "Erro 404/Inativo": "Site testado agora: fora do ar",
  "HTTP Inseguro": "Site testado agora: sem HTTPS válido",
  "SSL Válido": "Site testado agora: no ar com HTTPS",
};

/** Site próprio respondendo agora: sinal de que a empresa existe. */
export const isOwnSiteLive = (status: SiteStatus) => status === "SSL Válido" || status === "HTTP Inseguro";

/** Anos (com fração) desde uma data ISO ("2021-05-03", "2021-05" ou "2021"). */
export function yearsSince(iso: string, now = new Date()): number {
  const time = Date.parse(iso.length === 4 ? `${iso}-01-01` : iso.length === 7 ? `${iso}-01` : iso);
  return Number.isNaN(time) ? Infinity : (now.getTime() - time) / (365.25 * 24 * 3600 * 1000);
}

const monthYear = (iso: string) => (iso.length >= 7 ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso.slice(0, 4));

function phoneCheck(input: VerificationInput): LeadCheck {
  const ddd = input.uf ? ` para ${input.uf}` : "";
  switch (input.phoneOrigin) {
    case "confirmado":
      return { key: "telefone", ok: true, detail: "Telefone confirmado: o mesmo número está no site da própria empresa" };
    case "site":
      return {
        key: "telefone",
        ok: true,
        detail: input.phoneReplaced
          ? "Telefone atualizado pelo site da empresa (o cadastro do mapa tinha outro número)"
          : "Telefone tirado do site da própria empresa",
      };
    case "google":
      return { key: "telefone", ok: true, detail: `Telefone do Google Maps, com DDD válido${ddd}` };
    case "receita": {
      const year = input.openedOn?.slice(0, 4) ?? "";
      return input.openedOn && yearsSince(input.openedOn, input.now) <= RECEITA_PHONE_FRESH_YEARS
        ? { key: "telefone", ok: true, detail: `Telefone do cadastro oficial da empresa na Receita Federal (aberta em ${year}; número só dela, não é de contador)` }
        : { key: "telefone", ok: false, detail: `Telefone do cadastro na Receita Federal, mas a empresa é de ${year}: o número pode ter mudado` };
    }
    default:
      return { key: "telefone", ok: false, detail: `Formato e DDD válidos${ddd}, mas o número não foi confirmado em outra fonte` };
  }
}

function activityCheck(input: VerificationInput, now: Date): LeadCheck {
  if (input.activeConfirmed) return { key: "atividade", ok: true, detail: "Empresa em funcionamento segundo o Google" };
  if (input.cnpjActive) {
    const opened = input.openedOn ? ` (aberta em ${monthYear(input.openedOn)})` : "";
    return { key: "atividade", ok: true, detail: `CNPJ ativo na Receita Federal${opened}` };
  }
  if (isOwnSiteLive(input.siteStatus)) {
    return { key: "atividade", ok: true, detail: "Site da empresa no ar agora (sinal de que está funcionando)" };
  }
  if (input.checkedOn && yearsSince(input.checkedOn, now) <= 2) {
    return { key: "atividade", ok: true, detail: `Conferida no local por um colaborador do mapa em ${monthYear(input.checkedOn)}` };
  }
  if (input.lastEdit) {
    return yearsSince(input.lastEdit, now) >= 5
      ? { key: "atividade", ok: false, detail: `Cadastro sem atualização desde ${input.lastEdit.slice(0, 4)}: pode ter fechado ou mudado de número` }
      : { key: "atividade", ok: false, detail: `Cadastro atualizado em ${monthYear(input.lastEdit)}, mas o funcionamento não foi confirmado` };
  }
  return { key: "atividade", ok: false, detail: "Funcionamento não confirmado (a fonte não informa o status da empresa)" };
}

function siteDetail(input: VerificationInput): string {
  if (input.siteFound) {
    const host = input.siteFound.replace(/^https?:\/\//, "");
    if (input.siteFoundVia === "email") {
      return input.siteStatus === "Erro 404/Inativo"
        ? `A empresa tem o domínio ${host} (é o do e-mail dela), mas o site não abre ou está só estacionado`
        : `Site do domínio do e-mail da empresa: ${host}. ${SITE_DETAIL[input.siteStatus]}`;
    }
    return `Site achado pelo nome: ${host} (mostra o nome e o telefone ou a cidade da empresa). ${SITE_DETAIL[input.siteStatus]}`;
  }
  if (input.siteStatus === "Sem Site" && input.siteSearched) {
    const n = input.siteSearched.length;
    if (n === 0) return "Nenhum site no cadastro (nome genérico demais para procurar pelo endereço)";
    const tried = n > 2 ? `${input.siteSearched.slice(0, 2).join(", ")} e mais ${n - 2} endereços` : input.siteSearched.join(" e ");
    return `Nenhum site no cadastro, e ${tried} ${n > 1 ? "não existem ou são" : "não existe ou é"} de outra empresa`;
  }
  return SITE_DETAIL[input.siteStatus];
}

/**
 * Lista as checagens que se aplicam a este lead. O selo "VERIFICADO" só vale quando TODAS estão confirmadas;
 * qualquer coisa não confirmada vira "PARCIAL" com o motivo. Nada aqui é texto fixo.
 */
export function buildChecks(input: VerificationInput): LeadCheck[] {
  const now = input.now ?? new Date();
  const checks: LeadCheck[] = [];

  if (input.phone) checks.push(phoneCheck(input));

  if (input.whatsapp) {
    checks.push({
      key: "whatsapp",
      ok: true,
      detail: input.whatsappOrigin === "cadastro"
        ? "WhatsApp informado no cadastro da empresa no mapa"
        : "WhatsApp confirmado: link no site ou perfil da própria empresa",
    });
  } else if (input.unconfirmedMobile) {
    checks.push({
      key: "whatsapp",
      ok: false,
      info: true,
      detail: "Celular: não existe forma gratuita de confirmar WhatsApp (use \"Testar WPP\")",
    });
  }

  if (input.email === "ok") {
    checks.push({ key: "email", ok: true, detail: "Domínio do e-mail existe e recebe mensagens (MX)" });
  } else if (input.email === "unknown") {
    checks.push({ key: "email", ok: false, detail: "Não foi possível checar o domínio do e-mail agora" });
  }

  checks.push({ key: "site", ok: true, detail: siteDetail(input) });
  checks.push(activityCheck(input, now));

  if (input.address) {
    const a = input.address;
    if (a.status === "match") {
      checks.push({ key: "cidade", ok: true, detail: a.city ? `Endereço confere: ${a.city}${a.uf ? ` - ${a.uf}` : ""}` : "Endereço confere com a cidade pesquisada" });
    } else if (a.status === "other-city") {
      checks.push({ key: "cidade", ok: false, detail: `Endereço em ${a.city}, fora das cidades pesquisadas` });
    } else {
      checks.push({ key: "cidade", ok: false, detail: "Não foi possível confirmar a cidade pelo endereço" });
    }
  }

  return checks;
}

/** VERIFICADO = tudo que dá para checar foi confirmado. As checagens só informativas não contam. */
export const isVerified = (checks: LeadCheck[]): boolean => {
  const counted = checks.filter((c) => !c.info);
  return counted.length > 0 && counted.every((c) => c.ok);
};
