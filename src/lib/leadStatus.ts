import { NO_PHONE, lastDigits, type Lead } from "./leadRules";

/**
 * Marcação dos leads pelo usuário (pedido do dono em 30/09/2026: muitas empresas não tinham WhatsApp ou não
 * respondiam, e ele perdia tempo com elas de novo). Fica no navegador do aparelho (localStorage): não vai para
 * servidor nenhum. Os números marcados vão na busca (`pular`) para esses leads não voltarem.
 */
export type LeadStatus = "enviado" | "semzap" | "respondeu" | "naoquer";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  enviado: "Enviado",
  semzap: "Sem WhatsApp",
  respondeu: "Respondeu",
  naoquer: "Não quer",
};

export interface Mark {
  /** Status escolhido. */
  s: LeadStatus;
  /** Quando foi marcado (ms). */
  t: number;
  /** Nome da empresa (para a lista de marcados). */
  n: string;
  /** Números do lead (últimos 8 dígitos), para a busca não trazê-lo de novo. */
  f: string[];
}

export type Marks = Record<string, Mark>;

const STORAGE_KEY = "leadhunter.marcados.v1";
const EMPTY: Marks = {};

/** Mesmo lead em buscas diferentes: CNPJ quando há (é o mesmo em todas as fontes), senão o id da fonte. */
export const markKeyOf = (lead: Pick<Lead, "id" | "cnpj">) => (lead.cnpj ? `cnpj/${lead.cnpj}` : lead.id);

function read(): Marks {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Marks) : EMPTY;
  } catch {
    return EMPTY; // navegador sem localStorage (modo privado, bloqueado): funciona, só não guarda
  }
}

// Pequeno "store" para o useSyncExternalStore: a tela lê sempre a mesma referência até algo mudar.
let snapshot: Marks | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeMarks(onChange: () => void): () => void {
  listeners.add(onChange);
  // Outra aba do mesmo navegador marcou algo: atualiza esta também.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    snapshot = read();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getMarks(): Marks {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

export const getServerMarks = (): Marks => EMPTY;

/** Marca (ou desmarca, com `null`) um lead. */
export function setMark(lead: Pick<Lead, "id" | "cnpj" | "name" | "phone" | "whatsapp" | "otherPhones">, status: LeadStatus | null): void {
  const key = markKeyOf(lead);
  const next: Marks = { ...getMarks() };
  if (status === null) delete next[key];
  else {
    const numbers = [lead.phone, lead.whatsapp, ...(lead.otherPhones ?? [])]
      .filter((p): p is string => !!p && p !== NO_PHONE)
      .map(lastDigits)
      .filter((d) => d.length === 8);
    next[key] = { s: status, t: Date.now(), n: lead.name, f: [...new Set(numbers)] };
  }
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sem espaço ou bloqueado: vale só até fechar a página
  }
  notify();
}

/** Todos os números já marcados (os mais recentes primeiro), para a busca não trazer esses leads de volta. */
export function markedNumbers(marks: Marks): string[] {
  return Object.values(marks)
    .sort((a, b) => b.t - a.t)
    .flatMap((m) => m.f);
}

export interface MarksSummary {
  total: number;
  enviados: number;
  responderam: number;
  semZap: number;
  naoQuer: number;
  /** % de quem respondeu (inclusive "não quer") entre as mensagens que chegaram (enviado + respondeu + não quer). */
  taxa: number | null;
}

export function summarizeMarks(marks: Marks): MarksSummary {
  const all = Object.values(marks);
  const count = (s: LeadStatus) => all.filter((m) => m.s === s).length;
  const enviados = count("enviado");
  const responderam = count("respondeu");
  const naoQuer = count("naoquer");
  const sent = enviados + responderam + naoQuer;
  return {
    total: all.length,
    enviados: sent,
    responderam,
    semZap: count("semzap"),
    naoQuer,
    taxa: sent > 0 ? Math.round(((responderam + naoQuer) / sent) * 100) : null,
  };
}
