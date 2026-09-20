import type { AddressCheck } from "./address";
import type { LeadCheck, SiteStatus } from "./leadRules";

export interface VerificationInput {
  /** Telefone do lead depois de validado (formato, DDD do estado). Ausente se não houver telefone utilizável. */
  phone?: string;
  /** UF usada para validar o DDD (mostrada no detalhe). */
  uf?: string;
  /** WhatsApp achado no site/perfil da própria empresa. */
  whatsapp?: string;
  /** Situação do domínio do e-mail; ausente se o lead não tem e-mail. `invalid` nunca chega aqui (o e-mail é descartado). */
  email?: "ok" | "unknown";
  siteStatus: SiteStatus;
  /** A fonte informou que a empresa está em funcionamento (status do Google = OPERATIONAL). */
  activeConfirmed: boolean;
  /** Resultado da conferência do endereço. `null` quando a busca é por região inteira (sem cidade específica). */
  address: AddressCheck | null;
}

const SITE_DETAIL: Record<SiteStatus, string> = {
  "Sem Site": "Nenhum site cadastrado para esta empresa",
  "Só Rede Social": "Só perfil em rede social ou diretório (checado agora)",
  "Erro 404/Inativo": "Site testado agora: fora do ar",
  "HTTP Inseguro": "Site testado agora: sem HTTPS válido",
  "SSL Válido": "Site testado agora: no ar com HTTPS",
};

/**
 * Lista as checagens que se aplicam a este lead. O selo "VERIFICADO" só vale quando TODAS estão confirmadas;
 * qualquer coisa não confirmada vira "PARCIAL" com o motivo. Nada aqui é texto fixo.
 */
export function buildChecks(input: VerificationInput): LeadCheck[] {
  const checks: LeadCheck[] = [];

  if (input.phone) {
    checks.push({
      key: "telefone",
      ok: true,
      detail: input.uf ? `Telefone com formato e DDD válidos para ${input.uf}` : "Telefone com formato válido",
    });
  }
  if (input.whatsapp) {
    checks.push({ key: "whatsapp", ok: true, detail: "WhatsApp encontrado no site ou perfil da própria empresa" });
  }
  if (input.email === "ok") {
    checks.push({ key: "email", ok: true, detail: "Domínio do e-mail existe e recebe mensagens (MX)" });
  } else if (input.email === "unknown") {
    checks.push({ key: "email", ok: false, detail: "Não foi possível checar o domínio do e-mail agora" });
  }

  checks.push({ key: "site", ok: true, detail: SITE_DETAIL[input.siteStatus] });

  checks.push(
    input.activeConfirmed
      ? { key: "atividade", ok: true, detail: "Empresa em funcionamento segundo o Google" }
      : { key: "atividade", ok: false, detail: "Funcionamento não confirmado (a fonte não informa o status da empresa)" }
  );

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

export const isVerified = (checks: LeadCheck[]): boolean => checks.length > 0 && checks.every((c) => c.ok);
