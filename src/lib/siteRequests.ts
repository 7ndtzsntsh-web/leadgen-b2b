/**
 * Pedidos de site: gente que está procurando AGORA quem faça um site (pedido do dono em 03/10/2026: "não tem uma
 * empresa que mostre empresas que realmente precisem de sites, tipo buscam isso? ex.: Workana").
 *
 * Fonte: a lista pública de projetos do 99Freelas (o robots.txt libera /projects e os termos não proíbem ler a lista;
 * proíbem trocar contato fora da plataforma, então a proposta é feita LÁ). O Workana fica atrás de um bloqueio
 * anti-robô (Cloudflare): não dá para ler, e não se contorna isso. GetNinjas mostra os pedidos só para profissional
 * logado e cobra pelo contato. Freelancer.com tinha 4 pedidos em português, com 70 a 200 propostas cada. Compras do
 * governo (PNCP): 2 de 750 eram de site, e de portal da transparência (serviço de empresa especializada).
 */

export const SOURCE_ORIGIN = "https://www.99freelas.com.br";

export type RequestKind = "Loja virtual" | "Landing page" | "Site" | "Ajuste em site";

export interface SiteRequest {
  id: string;
  title: string;
  url: string;
  kind: RequestKind;
  /** Subcategoria do 99Freelas ("Desenvolvimento Web") e nível pedido ("Iniciante"). */
  area: string;
  level: string;
  /** Publicado em (ms). */
  publishedAt: number;
  proposals: number;
  interested: number;
  /** "Projeto exclusivo": nas primeiras 24 h só quem é Premium no 99Freelas pode mandar proposta. */
  exclusive: boolean;
  /** Texto do pedido, sem HTML (até 700 caracteres). */
  description: string;
  /** Nota do cliente (0 a 5) e quantas avaliações ele tem; sem avaliações = cliente novo. */
  clientScore?: number;
  clientReviews: number;
}

// ---------------------------------------------------------------------------
// Leitura do HTML (no servidor de borda não há DOM: expressões regulares sobre a lista, que tem formato fixo)
// ---------------------------------------------------------------------------

const VOWEL_ACCENTS: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈" };
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ccedil: "ç", Ccedil: "Ç", ordm: "º", ordf: "ª", deg: "°",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", euro: "€", reg: "®", copy: "©", trade: "™", sup2: "²", sup3: "³", times: "×",
};

/** &aacute; &#233; &#xE9; -> letra. Entidade desconhecida fica como está. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d?);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    if (NAMED[code]) return NAMED[code];
    const accent = /^([aeiouyAEIOUYnN])(acute|grave|circ|tilde|uml)$/.exec(code);
    return accent ? (accent[1] + VOWEL_ACCENTS[accent[2]]).normalize("NFC") : whole;
  });
}

const htmlToText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const num = (s: string | undefined) => (s ? Number(s.replace(/\D/g, "")) || 0 : 0);

/** Projetos de uma página da lista do 99Freelas (todos, sem filtrar). */
export function parseProjectList(html: string): Omit<SiteRequest, "kind">[] {
  const out: Omit<SiteRequest, "kind">[] = [];
  for (const chunk of html.split(/<li class="(?=[^"]*result-item)/).slice(1)) {
    const item = chunk.slice(0, chunk.indexOf("</li>") >= 0 ? chunk.indexOf("</li>") : undefined);
    const id = /data-id="(\d+)"/.exec(item)?.[1];
    const link = /<h1 class="title">\s*<a href="(\/project\/[a-z0-9-]+)(?:\?[^"]*)?"[^>]*>([\s\S]*?)<\/a>/.exec(item);
    const published = /Publicado:\s*<b class="datetime" cp-datetime="(\d+)"/.exec(item)?.[1];
    if (!id || !link || !published) continue;
    const info = /<p class="item-text information">([\s\S]*?)Publicado:/.exec(item)?.[1] ?? "";
    const [area = "", level = ""] = htmlToText(info).split("|").map((s) => s.trim()).filter(Boolean);
    const description = htmlToText(/data-content="([^"]*)"/.exec(item)?.[1] ?? "");
    const score = /class="avaliacoes-star"[^>]*data-score="([\d.]+)"/.exec(item)?.[1];
    out.push({
      id,
      title: htmlToText(link[2]),
      url: `${SOURCE_ORIGIN}${link[1]}`,
      area,
      level,
      publishedAt: Number(published),
      proposals: num(/Propostas:\s*<b>(\d+)<\/b>/.exec(item)?.[1]),
      interested: num(/Interessados:\s*<b>(\d+)<\/b>/.exec(item)?.[1]),
      exclusive: /Projeto exclusivo/i.test(item),
      description: description.length > 700 ? `${description.slice(0, 700).replace(/\s+\S*$/, "")}…` : description,
      clientScore: score ? Number(score) : undefined,
      clientReviews: num(/avaliacoes-text">\s*\((\d+)/.exec(item)?.[1]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// É pedido de site?
// ---------------------------------------------------------------------------

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STORE = /\b(loja virtual|loja online|lojas virtuais|e-?commerce|nuvemshop|shopify|woocommerce|loja integrada|dropshipping)\b/;
const LANDING = /\b(landing ?pages?|pagina de (vendas|captura|captacao|obrigado)|one ?page|hotsite|pagina unica)\b/;
const SITE = /\b(sites?|website|wordpress|wix|elementor|blog|pagina (pessoal|profissional|institucional|web))\b/;
// O pedido é de outra coisa quando isso vem ANTES do site no título ("backend para o site", "IA para criar sites").
const OTHER = /\b(app|apps|aplicativos?|android|ios|apk|bot|chatbot|automac\w*|n8n|zapier|scraping|raspagem|crawler|api|apis|backend|back-end|banco de dados|erp|crm|saas|sistema|software|plataforma|marketplace|ia|inteligencia artificial|agente|builder|jogo|game|mod|extensao|plugin|integra\w*|pagamentos?|gateway|pix|checkout|shopee|mercado livre|hotmart|bling|planilha)\b/;
// Trabalho de design ou mídia ("logotipo para loja virtual", "vídeos para o site").
const MEDIA = /\b(logo|logotipo|logomarca|identidade visual|flyers?|banners?|videos?|animac\w*|ilustrac\w*|thumbnails?|criativos?|posts?|carrossel|carrosseis|edicao)\b/;
const ADULT = /\+18|\badult[oa]s?\b|acompanhantes|eroti|porn/;
// Mexer num site que já existe: também é cliente de site, mas é outro tipo de venda.
const FIX = /\b(ajustes?|correc\w*|corrigir|erros?|bugs?|manutencao|migrac\w*|migrar|hospedagem|dominio|velocidade|otimiza\w*|atualiza\w*|alterac\w*|melhorias?|configur\w*|finaliz\w*|apontamento|publicacao|suporte)\b/;
const DATA_ENTRY = /\b(alimentar|cadastr\w*|subir produtos)\b/;
// Pedido de site novo.
const NEW = /\b(criac\w*|criar|desenvolv\w*|montar|montagem|construir|construcao|fazer|novo|nova|refazer|reformul\w*|redesign|do zero|configurar (um|uma))\b/;

const at = (re: RegExp, s: string) => re.exec(s)?.index ?? -1;
const siteAt = (s: string) => Math.min(...[STORE, LANDING, SITE].map((re) => at(re, s)).filter((i) => i >= 0));

/**
 * Tipo do pedido ou undefined se não for pedido de site. Quem manda é o título: o texto de qualquer projeto cita
 * "site" ("integração com o site já existente"). O que vem PRIMEIRO no título decide: "Criação de site e vídeos" é
 * site; "Criação de logotipo para loja virtual" e "Central de pagamentos para site" não são. App/sistema depois do
 * site só vale com pedido de criação ("Desenvolvimento de site e aplicativo" sim; "Transformar site em app" não).
 * Título vago ("Preciso de um profissional"): decide o começo do texto. Ajustado nos 273 pedidos abertos do
 * 99Freelas (web + design) em 03/10/2026.
 */
export function requestKind(title: string, description: string): RequestKind | undefined {
  const t = fold(title);
  const d = fold(description.slice(0, 300));
  if (ADULT.test(t) || ADULT.test(d)) return undefined;

  let text = t;
  const pos = siteAt(t);
  if (pos === Infinity) {
    // Título vago: só entra se o começo do texto pedir um site novo, sem nada de outra coisa antes.
    const dPos = siteAt(d);
    if (t.split(/\s+/).length > 6 || OTHER.test(t) || MEDIA.test(t) || dPos === Infinity) return undefined;
    const before = d.slice(0, dPos);
    if (OTHER.test(before) || MEDIA.test(before) || !NEW.test(d.slice(0, dPos + 40))) return undefined;
    text = d;
  } else {
    const before = t.slice(0, pos);
    if (OTHER.test(before) || MEDIA.test(before)) return undefined;
    if (OTHER.test(t.slice(pos)) && !NEW.test(before)) return undefined;
  }

  if (DATA_ENTRY.test(t) || (FIX.test(t) && !NEW.test(t))) return "Ajuste em site";
  if (STORE.test(text)) return "Loja virtual";
  if (LANDING.test(text)) return "Landing page";
  return "Site";
}

const BID_QUESTIONS: Record<RequestKind, string> = {
  Site: "quantas páginas você imagina e se já tem logo, fotos e textos",
  "Landing page": "o que a página vai vender e para onde devem ir os contatos (WhatsApp, formulário, checkout)",
  "Loja virtual": "quantos produtos são e se já tem preferência de plataforma (Nuvemshop, Shopify, WooCommerce)",
  "Ajuste em site": "em qual plataforma o site está e o que precisa mudar exatamente",
};
const BID_WHAT: Record<RequestKind, string> = {
  Site: "sites profissionais, rápidos e que funcionam bem no celular",
  "Landing page": "landing pages rápidas, feitas para converter e que funcionam bem no celular",
  "Loja virtual": "lojas virtuais rápidas, fáceis de administrar e que funcionam bem no celular",
  "Ajuste em site": "criação e ajustes de sites, com atenção para não quebrar o que já funciona",
};

/**
 * Começo de proposta para colar no 99Freelas. Sem telefone, e-mail nem link: a plataforma proíbe e pode suspender
 * a conta. Termina com perguntas, que fazem o cliente responder (e mostram que o pedido foi lido).
 */
export function buildBid(r: Pick<SiteRequest, "title" | "kind">): string {
  return `Olá! Li o seu pedido "${r.title}" e posso fazer. Trabalho com ${BID_WHAT[r.kind]}. Para te passar prazo e valor certinhos, me conta ${BID_QUESTIONS[r.kind]}? Com isso já te digo como eu faria.`;
}

/** Só os pedidos de site, com o tipo. */
export function siteRequestsFrom(html: string): SiteRequest[] {
  const out: SiteRequest[] = [];
  for (const p of parseProjectList(html)) {
    const kind = requestKind(p.title, p.description);
    if (kind) out.push({ ...p, kind });
  }
  return out;
}
