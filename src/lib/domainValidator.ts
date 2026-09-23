import type { DomainStatus } from "./leadRules";

export type { DomainStatus } from "./leadRules";

export interface SiteInspection {
  status: DomainStatus;
  email: string;
  /** Números de WhatsApp achados em links do site (só dígitos, com DDI), do mais repetido para o menos. */
  whatsapp: string[];
  /** Telefones que o próprio site mostra (links tel: e texto), do mais repetido para o menos. Ainda não validados. */
  phones: string[];
}

const PROBE_TIMEOUT_MS = 5000;
// Sites de WordPress/Elementor enchem o começo da página de CSS e deixam o contato no rodapé: com 250 KB, o
// telefone da Padaria Bublitz (posição 261.566) ficava de fora, e o e-mail e o WhatsApp do rodapé também.
const MAX_HTML_BYTES = 800_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Perfis de rede social / link-na-bio: para vender site, a empresa ainda "não tem site".
const SOCIAL_HOSTS = [
  "instagram.com", "facebook.com", "fb.com", "fb.me", "linktr.ee", "linktree.com", "beacons.ai",
  "bio.link", "linkin.bio", "taplink.cc", "wa.me", "whatsapp.com", "tiktok.com", "youtube.com",
  "youtu.be", "twitter.com", "x.com", "linkedin.com", "ifood.com.br", "g.page", "goo.gl", "linktw.in",
  // Diretórios e marketplaces: a página é da plataforma, não um site próprio da empresa.
  "tripadvisor.com", "tripadvisor.com.br", "guiamais.com.br", "apontador.com.br", "telelistas.net",
  "solutudo.com.br", "yelp.com", "foursquare.com", "rappi.com.br", "mercadolivre.com.br", "olx.com.br",
  "doctoralia.com.br", "booking.com", "airbnb.com.br", "business.google.com", "maps.google.com",
  // Plataformas de academia, cardápio e delivery: a página é da plataforma ("Sharks Gym" apontava para o TotalPass).
  "totalpass.com", "wellhub.com", "gympass.com", "goomer.app", "anota.ai", "menudino.com", "cardapioweb.com",
  "aiqfome.com", "ubereats.com", "deliverymuch.com.br", "linktree.com.br",
];

// Páginas padrão de servidor / domínio estacionado / conta suspensa: existem, mas não são um site.
const PARKED_MARKERS = [
  "account suspended", "conta suspensa", "this domain is for sale", "domain is for sale", "domínio à venda",
  "dominio a venda", "sedoparking", "parkingcrew", "default web site page", "welcome to nginx",
  "apache2 ubuntu default page", "index of /", "site em construção", "página em construção",
  "under construction", "parked domain", "domain parking", "domínio estacionado", "dominio estacionado",
];

const JUNK_EMAIL_DOMAINS = [
  "example.com", "domain.com", "email.com", "sentry.io", "wixpress.com", "wix.com", "godaddy.com",
  "seusite.com", "seudominio.com", "yoursite.com", "yourdomain.com", "meusite.com", "site.com",
  "wixsite.com", "sentry-next.wixpress.com",
];
const JUNK_EMAIL_LOCALS = ["your", "you", "name", "email", "seuemail", "seu-email", "nome", "usuario", "user", "exemplo", "example", "test", "teste", "noreply", "no-reply", "donotreply"];
const BAD_TLDS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "css", "js", "pdf", "zip", "woff", "woff2", "ico", "mp4", "html"];

// Quantificadores limitados: o regex não degenera em HTML gigante.
const EMAIL_RE = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+/gi;
const MAILTO_RE = /mailto:([^"'?&\s<>]{3,120})/gi;

// Botões de WhatsApp: wa.me/5519..., api.whatsapp.com/send?phone=..., whatsapp://send?phone=...
// (wa.me/message/XXXX não traz número e não casa, pois exige dígitos logo após a barra).
const WA_ME_RE = /wa\.me\/\+?(\d{10,15})/gi;
const WA_SEND_RE = /whatsapp(?:\.com)?[^"'\s<>]{0,8}send\/?\?[^"'\s<>]*?phone=\+?(\d{10,15})/gi;
const TEL_LINK_RE = /href\s*=\s*["']tel:([^"']{8,30})["']/gi;
// Telefone escrito na página: exige separador antes dos 4 últimos dígitos, para não pegar códigos e IDs.
const PHONE_TEXT_RE = /(?:\+?55[\s.-]*)?\(?\b\d{2}\)?[\s.-]*9?\s?\d{4}[\s.-]\d{4}\b/g;
// Crédito de quem fez o site ("Desenvolvido por ... [WhatsApp]"): esse número é da agência, não da empresa.
const CREDIT_RE = /(desenvolvid[oa]|criad[oa]|feito|produzid[oa]|developed|made|powered|site)\s+(por|by|pela|pelo)\b/i;

/** Só dígitos, sem DDI 55 e sem o zero de discagem: variações do mesmo número contam juntas. */
const phoneDigits = (s: string) => {
  let d = s.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  return d;
};

const cleanSource = (text: string) =>
  text.slice(0, MAX_HTML_BYTES).replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "");

/** Ordena do mais repetido para o menos (empate: o que aparece primeiro). */
function rankByCount(found: { value: string; index: number }[]): string[] {
  const counts = new Map<string, { n: number; first: number }>();
  for (const { value, index } of found) {
    const c = counts.get(value);
    if (c) c.n++;
    else counts.set(value, { n: 1, first: index });
  }
  return [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).map(([value]) => value);
}

/**
 * Extrai números de WhatsApp de links (em HTML ou de uma URL), do mais repetido para o menos.
 * O número da empresa costuma aparecer várias vezes (topo, botão flutuante, rodapé); o da agência que fez o
 * site aparece uma vez, perto de "desenvolvido por", e é ignorado. Antes valia o primeiro que aparecesse.
 */
export function extractWhatsAppNumbers(text: string): string[] {
  if (!text) return [];
  const source = cleanSource(text);
  const found: { value: string; index: number }[] = [];
  for (const re of [WA_ME_RE, WA_SEND_RE]) {
    for (const m of source.matchAll(re)) {
      const before = source.slice(Math.max(0, m.index - 200), m.index).replace(/<[^>]*>/g, " ");
      if (CREDIT_RE.test(before)) continue;
      found.push({ value: m[1], index: m.index });
    }
  }
  return rankByCount(found).slice(0, 5);
}

/** Telefones que a página mostra (links tel: e texto visível), do mais repetido para o menos. Sem validar. */
export function extractPhoneNumbers(html: string): string[] {
  if (!html) return [];
  const source = cleanSource(html);
  const found: { value: string; index: number }[] = [];
  for (const m of source.matchAll(TEL_LINK_RE)) found.push({ value: phoneDigits(m[1]), index: m.index });
  const visible = source.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  for (const m of visible.matchAll(PHONE_TEXT_RE)) found.push({ value: phoneDigits(m[0]), index: MAX_HTML_BYTES + m.index });
  return rankByCount(found).slice(0, 8);
}

export function getHostname(website: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function isSocialHost(host: string): boolean {
  return SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Escolhe o melhor e-mail do HTML: prefere os de `mailto:` e os do domínio do próprio site. */
export function extractEmailFromHtml(html: string, host: string): string {
  if (!html) return "N/D";
  const text = html
    .slice(0, MAX_HTML_BYTES)
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "")
    .replace(/&#64;|&commat;|\[at\]|\(at\)/gi, "@");

  const candidates: string[] = [];
  for (const m of text.matchAll(MAILTO_RE)) {
    try {
      candidates.push(decodeURIComponent(m[1]));
    } catch {
      candidates.push(m[1]);
    }
  }
  for (const m of text.matchAll(EMAIL_RE)) candidates.push(m[0]);

  const valid = candidates
    .map((e) => e.toLowerCase())
    .filter((e, i, all) => all.indexOf(e) === i)
    .filter((e) => {
      const [local, domain] = e.split("@");
      if (!local || !domain) return false;
      const tld = domain.split(".").pop() ?? "";
      if (BAD_TLDS.includes(tld) || tld.length < 2 || tld.length > 24) return false;
      if (JUNK_EMAIL_LOCALS.includes(local)) return false;
      return !JUNK_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
    });

  if (valid.length === 0) return "N/D";
  const root = host.replace(/^www\./, "");
  return valid.find((e) => e.split("@")[1].endsWith(root)) ?? valid[0];
}

export interface Probe {
  status: number;
  finalUrl: string;
  html: string;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return out;
}

/**
 * Só endereços públicos. O site vem de dados de terceiros (Google Places) e é o servidor quem o consulta,
 * então é preciso impedir que um cadastro malicioso aponte para rede interna (SSRF): localhost, IPs privados
 * e de link-local (metadados de nuvem, 169.254.x.x), nomes sem ponto (intranet) e sufixos internos.
 */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h || h.length > 253) return false;
  if (h.includes(":")) return false; // IPv6 literal (::1, fe80::, ...): nenhum site de empresa precisa disso
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  if (h === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet|home\.arpa)$/.test(h)) return false;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    return !isPrivate;
  }
  // Formas numéricas (decimal/hex/octal) que resolveriam para IP: o parser de URL já as normaliza para a.b.c.d,
  // então o que sobra aqui e é só dígitos/pontos é inválido.
  if (/^[\d.]+$/.test(h)) return false;
  return h.includes("."); // sem ponto = nome interno
}

const MAX_REDIRECTS = 5;

/** GET seguindo redirecionamentos manualmente, validando o destino de cada salto (o `redirect: "follow"` não valida). */
async function fetchValidated(
  startUrl: string,
  signal: AbortSignal
): Promise<{ res: Response | null; finalUrl: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = getHostname(current);
    if (!host || !isPublicHost(host)) return null;

    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return { res, finalUrl: current };

    res.body?.cancel().catch(() => {});
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return null;
    }
    if (!/^https?:\/\//i.test(next)) return null;
    // Perfil de rede social: não precisa (nem deve) ser consultado; o destino já diz tudo.
    const nextHost = getHostname(next);
    if (nextHost && isSocialHost(nextHost)) return { res: null, finalUrl: next };
    current = next;
  }
  return null; // redirecionamentos demais
}

/** Faz um GET real (HEAD é recusado por muitos servidores). O timeout cobre também a leitura do corpo. */
export async function probe(url: string): Promise<Probe | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const followed = await fetchValidated(url, controller.signal);
    if (!followed) return null;
    const { res, finalUrl } = followed;
    if (!res) return { status: 200, finalUrl, html: "" };

    let html = "";
    if (res.status < 400) {
      try {
        html = await readCapped(res, MAX_HTML_BYTES);
      } catch {
        /* corpo interrompido: o status já basta */
      }
    } else {
      res.body?.cancel().catch(() => {});
    }
    return { status: res.status, finalUrl, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// No título, valem para página de qualquer tamanho (a de domínio estacionado da Hostinger tem 32 KB).
const PARKED_TITLE_MARKERS = [
  "parked domain", "domain parking", "domínio estacionado", "dominio estacionado", "this domain is for sale",
  "domain for sale", "account suspended", "conta suspensa", "coming soon", "em breve", "site em construção",
];

/** Página padrão de servidor, domínio estacionado/à venda ou conta suspensa: o endereço existe, mas não é um site. */
export function isParkedPage(html: string): boolean {
  const title = (html.match(/<title[^>]*>([^<]{0,200})/i)?.[1] ?? "").toLowerCase();
  if (PARKED_TITLE_MARKERS.some((marker) => title.includes(marker))) return true;
  if (html.length >= 60_000) return false;
  const lower = html.toLowerCase();
  return PARKED_MARKERS.some((marker) => lower.includes(marker));
}

// 401/403/405/429 significam que o servidor está no ar (só recusou o "robô"). Só isto indica site quebrado:
const isBroken = (p: Probe) => p.status === 404 || p.status === 410 || p.status >= 500;

/**
 * Descobre a situação real do site em uma única passada (HTTPS e HTTP em paralelo) e já extrai o e-mail
 * do HTML baixado, evitando uma segunda requisição.
 */
const OFFLINE: SiteInspection = { status: "Erro 404/Inativo", email: "N/D", whatsapp: [], phones: [] };

export async function inspectWebsite(website: string): Promise<SiteInspection> {
  const host = getHostname(website);
  if (!host) return OFFLINE;
  // Endereço interno cadastrado no Google: não consultamos (SSRF) e ele não é um site público.
  if (!isPublicHost(host) && !isSocialHost(host)) return OFFLINE;
  // O "site" cadastrado no Google costuma ser justamente o link do WhatsApp (wa.me/55...).
  if (isSocialHost(host)) return { status: "Só Rede Social", email: "N/D", whatsapp: extractWhatsAppNumbers(website), phones: [] };

  const [secure, plain] = await Promise.all([probe(`https://${host}`), probe(`http://${host}`)]);

  let winner: Probe | null = null;
  let status: DomainStatus = "Erro 404/Inativo";
  if (secure && !isBroken(secure)) {
    winner = secure;
    status = "SSL Válido";
  } else if (plain && !isBroken(plain)) {
    winner = plain;
    // O HTTP pode ter redirecionado para HTTPS (o HTTPS só demorou mais que o limite).
    status = plain.finalUrl.startsWith("https://") ? "SSL Válido" : "HTTP Inseguro";
  }

  if (!winner) return OFFLINE;

  const finalHost = getHostname(winner.finalUrl);
  if (finalHost && isSocialHost(finalHost)) {
    return { status: "Só Rede Social", email: "N/D", whatsapp: extractWhatsAppNumbers(winner.finalUrl), phones: [] };
  }

  if (isParkedPage(winner.html)) return OFFLINE;

  return {
    status,
    email: extractEmailFromHtml(winner.html, host),
    whatsapp: extractWhatsAppNumbers(winner.html),
    phones: extractPhoneNumbers(winner.html),
  };
}
