import { NO_PHONE, lastDigits, type Lead } from "./leadRules";
import type { PitchStyle } from "./pitches";

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
  /** Número do WhatsApp com DDI (só dígitos), para mandar o lembrete. Marcas antigas não têm. */
  w?: string;
  /** Estilo da mensagem mandada, para comparar a taxa de resposta. Marcas antigas: a completa (era a única). */
  m?: PitchStyle;
  /** Quando o lembrete foi mandado (ms). */
  r?: number;
}

export type Marks = Record<string, Mark>;

const STORAGE_KEY = "leadhunter.marcados.v1";
const EMPTY: Marks = {};
const DAY_MS = 24 * 3600 * 1000;
/** Sem resposta depois de tantos dias: hora do lembrete. */
export const REMIND_AFTER_DAYS = 2;

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

function save(next: Marks): void {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sem espaço ou bloqueado: vale só até fechar a página
  }
  notify();
}

/**
 * Marca (ou desmarca, com `null`) um lead. `extra`: o número do WhatsApp e o estilo da mensagem, quando se sabe
 * (trocar o status depois mantém os dois e o lembrete já mandado).
 */
export function setMark(
  lead: Pick<Lead, "id" | "cnpj" | "name" | "phone" | "whatsapp" | "otherPhones">,
  status: LeadStatus | null,
  extra: { w?: string; m?: PitchStyle } = {},
): void {
  const key = markKeyOf(lead);
  const next: Marks = { ...getMarks() };
  if (status === null) delete next[key];
  else {
    const prev = next[key];
    const numbers = [lead.phone, lead.whatsapp, ...(lead.otherPhones ?? [])]
      .filter((p): p is string => !!p && p !== NO_PHONE)
      .map(lastDigits)
      .filter((d) => d.length === 8);
    const mark: Mark = { s: status, t: Date.now(), n: lead.name, f: [...new Set(numbers)] };
    const w = prev?.w ?? extra.w;
    const m = prev?.m ?? extra.m;
    if (w) mark.w = w;
    if (m) mark.m = m;
    if (prev?.r) mark.r = prev.r;
    next[key] = mark;
  }
  save(next);
}

/** O lembrete foi mandado: o lead continua "Enviado", mas sai da lista de lembretes. */
export function setReminded(key: string): void {
  const prev = getMarks()[key];
  if (!prev) return;
  save({ ...getMarks(), [key]: { ...prev, r: Date.now() } });
}

/** Troca o status de um lead marcado (na lista de lembretes não há o lead inteiro, só a marca). */
export function setMarkStatus(key: string, status: LeadStatus | null): void {
  const prev = getMarks()[key];
  if (!prev) return;
  const next: Marks = { ...getMarks() };
  if (status === null) delete next[key];
  else next[key] = { ...prev, s: status, t: Date.now() };
  save(next);
}

/** Todos os números já marcados (os mais recentes primeiro), para a busca não trazer esses leads de volta. */
export function markedNumbers(marks: Marks): string[] {
  return Object.values(marks)
    .sort((a, b) => b.t - a.t)
    .flatMap((m) => m.f);
}

export interface Reminder {
  key: string;
  mark: Mark;
  /** Dias desde o envio. */
  days: number;
}

/**
 * Mandados há 2 dias ou mais, sem resposta e ainda sem lembrete (os mais antigos primeiro). Só os que têm o número
 * guardado (marcas de antes desta versão não têm).
 */
export function dueReminders(marks: Marks, now = Date.now()): Reminder[] {
  return Object.entries(marks)
    .filter(([, m]) => m.s === "enviado" && !m.r && m.w && now - m.t >= REMIND_AFTER_DAYS * DAY_MS)
    .map(([key, mark]) => ({ key, mark, days: Math.floor((now - mark.t) / DAY_MS) }))
    .sort((a, b) => a.mark.t - b.mark.t);
}

export interface StyleResult {
  enviados: number;
  responderam: number;
}

export interface MarksSummary {
  total: number;
  enviados: number;
  responderam: number;
  semZap: number;
  naoQuer: number;
  /** % de quem respondeu (inclusive "não quer") entre as mensagens que chegaram (enviado + respondeu + não quer). */
  taxa: number | null;
  /** Mesma conta por estilo de mensagem (marca antiga = completa, a única que existia). */
  porEstilo: Partial<Record<PitchStyle, StyleResult>>;
}

const SENT: LeadStatus[] = ["enviado", "respondeu", "naoquer"];

export function summarizeMarks(marks: Marks): MarksSummary {
  const all = Object.values(marks);
  const count = (s: LeadStatus) => all.filter((m) => m.s === s).length;
  const enviados = count("enviado");
  const responderam = count("respondeu");
  const naoQuer = count("naoquer");
  const sent = enviados + responderam + naoQuer;
  const porEstilo: MarksSummary["porEstilo"] = {};
  for (const m of all) {
    if (!SENT.includes(m.s)) continue;
    const r = (porEstilo[m.m ?? "completa"] ??= { enviados: 0, responderam: 0 });
    r.enviados++;
    if (m.s !== "enviado") r.responderam++;
  }
  return {
    total: all.length,
    enviados: sent,
    responderam,
    semZap: count("semzap"),
    naoQuer,
    taxa: sent > 0 ? Math.round(((responderam + naoQuer) / sent) * 100) : null,
    porEstilo,
  };
}
