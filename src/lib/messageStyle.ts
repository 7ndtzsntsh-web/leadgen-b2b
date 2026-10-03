import { PITCH_STYLES, type PitchStyle } from "./pitches";

/** Estilo de mensagem escolhido na tela. Fica no aparelho, como as marcações. */
const STORAGE_KEY = "leadhunter.mensagem.v1";
export const DEFAULT_STYLE: PitchStyle = "curta";

let current: PitchStyle | null = null;
const listeners = new Set<() => void>();

function read(): PitchStyle {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && saved in PITCH_STYLES ? (saved as PitchStyle) : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function subscribeStyle(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getStyle(): PitchStyle {
  if (current === null) current = read();
  return current;
}

export const getServerStyle = (): PitchStyle => DEFAULT_STYLE;

export function setStyle(style: PitchStyle): void {
  current = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // bloqueado: vale até fechar a página
  }
  listeners.forEach((l) => l());
}
