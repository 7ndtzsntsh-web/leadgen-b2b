import type { SiteStatus } from "./leadRules";

export type PitchLang = "pt" | "en" | "es";

export function pitchLangFor(country: string): PitchLang {
  if (country === "us") return "en";
  if (country === "es") return "es";
  return "pt";
}

interface PitchLead {
  name: string;
  siteStatus: SiteStatus;
  rating: number;
  reviewsCount: number;
}

type Reason = "noSite" | "socialOnly" | "down" | "insecure" | "ok";

function reasonFor(status: SiteStatus): Reason {
  switch (status) {
    case "Sem Site": return "noSite";
    case "Só Rede Social": return "socialOnly";
    case "Erro 404/Inativo": return "down";
    case "HTTP Inseguro": return "insecure";
    default: return "ok";
  }
}

/**
 * Texto de abordagem (Problema → Agitação → Solução) ajustado à situação real do lead.
 * A reputação só é citada quando existe de fato (antes dizia "ótima reputação" para qualquer empresa).
 */
export function buildPitch(lead: PitchLead, lang: PitchLang, city: string): string {
  const { name } = lead;
  const reputable = lead.rating >= 4 && lead.reviewsCount >= 10;
  const stars = lead.rating.toFixed(1);
  const reason = reasonFor(lead.siteStatus);

  if (lang === "en") {
    const rep = reputable ? ` and saw the great reputation of the business (${stars} on Google)` : "";
    const texts: Record<Reason, string> = {
      noSite: `Hi ${name} team! I found your business while searching in ${city}${rep}, but I noticed you don't have an official website yet. Local businesses lose daily quotes when clients search on their phones and only find competitors' pages. I've designed a practical digital capture structure for your profile. Can we schedule a quick, no-obligation meeting this week so I can present it to you?`,
      socialOnly: `Hi ${name} team! I found your business while searching in ${city}${rep}, and noticed you only promote through social media, without a website of your own. Social pages rank poorly on Google, so clients searching on their phones end up choosing whoever has a site. I've designed a practical digital capture structure for your profile. Can we schedule a quick, no-obligation meeting this week?`,
      down: `Hi ${name} team! I was searching for services in ${city} and tried to visit your website, but it doesn't load (it's down or showing an error). Every client who tries and fails goes to a competitor. I already mapped out how to get your online presence back up. Can we schedule a quick, no-obligation meeting this week to talk about it?`,
      insecure: `Hi ${name} team! I was searching for services in ${city} and tried to visit your website, but my browser blocked it with a 'Not Secure' warning due to a missing SSL certificate. This drives new clients away due to mistrust and drops your company's ranking in searches. I already mapped out exactly how to solve this. Can we schedule a quick, no-obligation meeting to talk about it?`,
      ok: `Hi ${name} team! I was searching for services in ${city} and visited your website. I see clear opportunities to improve the mobile experience and turn more visits into quotes and contacts. I prepared a quick diagnosis with the main points. Can we schedule a short, no-obligation chat this week?`,
    };
    return texts[reason];
  }

  if (lang === "es") {
    const rep = reputable ? ` y vi la gran reputación de la empresa (${stars} en Google)` : "";
    const texts: Record<Reason, string> = {
      noSite: `¡Hola equipo de ${name}! Los encontré en las búsquedas en ${city}${rep}, pero noté que aún no tienen un sitio web oficial. Los negocios locales pierden cotizaciones diarias cuando los clientes buscan desde el móvil y solo encuentran la página de la competencia. He diseñado una estructura práctica de captación digital para su perfil. ¿Podemos agendar una reunión rápida sin compromiso esta semana para presentárselo?`,
      socialOnly: `¡Hola equipo de ${name}! Los encontré en las búsquedas en ${city}${rep} y vi que solo se promocionan por redes sociales, sin un sitio web propio. Las redes aparecen mal en Google y el cliente que busca desde el móvil termina eligiendo a quien tiene sitio. He diseñado una estructura práctica de captación digital para su perfil. ¿Podemos agendar una reunión rápida sin compromiso esta semana?`,
      down: `¡Hola equipo de ${name}! Estaba buscando servicios en ${city} e intenté acceder a su sitio web, pero no abre (está caído o con error). Cada cliente que lo intenta y no puede entrar se va con la competencia. Ya tengo mapeado cómo recuperar su presencia digital. ¿Podemos agendar una reunión rápida sin compromiso esta semana para conversar?`,
      insecure: `¡Hola equipo de ${name}! Estaba buscando servicios en ${city} e intenté acceder a su sitio web, pero el navegador lo bloqueó con una alerta de 'No Seguro' por falta de certificado SSL. Esto aleja a nuevos clientes por desconfianza y hunde el posicionamiento de la empresa en las búsquedas. Ya tengo mapeado exactamente cómo resolverlo. ¿Podemos agendar una reunión rápida sin compromiso para conversar al respecto?`,
      ok: `¡Hola equipo de ${name}! Estaba buscando servicios en ${city} y visité su sitio web. Veo oportunidades claras de mejorar la experiencia en el móvil y convertir más visitas en cotizaciones y contactos. Preparé un diagnóstico rápido con los puntos principales. ¿Podemos agendar una charla breve sin compromiso esta semana?`,
    };
    return texts[reason];
  }

  const rep = reputable ? ` e vi a ótima reputação da empresa (nota ${stars} no Google)` : "";
  const texts: Record<Reason, string> = {
    noSite: `Olá, responsável da ${name}! Encontrei vocês nas buscas em ${city}${rep}, mas percebi que ainda não possuem um site oficial. Negócios locais perdem orçamentos diários quando clientes pesquisam no celular e encontram apenas a página de concorrentes. Desenhei uma estrutura prática de captação digital para o perfil de vocês. Podemos marcar uma reunião rápida sem compromisso esta semana para eu te apresentar?`,
    socialOnly: `Olá, responsável da ${name}! Encontrei vocês nas buscas em ${city}${rep} e vi que a divulgação é feita só pelas redes sociais, sem um site próprio. Rede social aparece mal no Google e o cliente que pesquisa no celular acaba fechando com quem tem site. Desenhei uma estrutura prática de captação digital para o perfil de vocês. Podemos marcar uma reunião rápida sem compromisso esta semana?`,
    down: `Olá, responsável da ${name}! Estava pesquisando serviços em ${city} e tentei acessar o site de vocês, mas ele não abre (está fora do ar ou com erro). Cada cliente que tenta entrar e não consegue acaba indo para o concorrente. Já mapeei como recolocar a presença digital de vocês no ar. Podemos marcar uma reunião rápida sem compromisso esta semana para conversarmos?`,
    insecure: `Olá, responsável da ${name}! Estava pesquisando serviços em ${city} e tentei acessar o site de vocês, mas o navegador bloqueou alertando 'Não Seguro' por ausência de certificado SSL. Isso afasta novos clientes por desconfiança e derruba o posicionamento da empresa nas buscas. Já mapeei exatamente como resolver isso. Podemos marcar uma reunião rápida sem compromisso para conversarmos a respeito?`,
    ok: `Olá, responsável da ${name}! Estava pesquisando serviços em ${city} e visitei o site de vocês. Vi oportunidades claras de melhorar a experiência no celular e transformar mais visitas em orçamentos e contatos. Preparei um diagnóstico rápido com os pontos principais. Podemos marcar uma conversa rápida sem compromisso esta semana?`,
  };
  return texts[reason];
}

/**
 * Assunto do e-mail de abordagem (nos EUA não há WhatsApp: a mensagem vai por e-mail). Curto e com o nome da
 * empresa, como um e-mail escrito por gente, e dizendo o problema real do lead.
 */
export function buildEmailSubject(lead: Pick<PitchLead, "name" | "siteStatus">, lang: PitchLang): string {
  const { name } = lead;
  const subjects: Record<PitchLang, Record<Reason, string>> = {
    en: {
      noSite: `A website for ${name}`,
      socialOnly: `A website of your own for ${name}`,
      down: `${name}'s website isn't loading`,
      insecure: `${name}'s website shows "Not Secure"`,
      ok: `An idea for ${name}'s website`,
    },
    es: {
      noSite: `Un sitio web para ${name}`,
      socialOnly: `Un sitio web propio para ${name}`,
      down: `El sitio web de ${name} no abre`,
      insecure: `El sitio web de ${name} aparece como "No seguro"`,
      ok: `Una idea para el sitio web de ${name}`,
    },
    pt: {
      noSite: `Um site para a ${name}`,
      socialOnly: `Um site próprio para a ${name}`,
      down: `O site da ${name} não está abrindo`,
      insecure: `O site da ${name} aparece como "Não seguro"`,
      ok: `Uma ideia para o site da ${name}`,
    },
  };
  return subjects[lang][reasonFor(lead.siteStatus)];
}

const SIGN_OFF: Record<PitchLang, string> = { en: "Best regards,", es: "Saludos,", pt: "Abraço," };

/** Corpo do e-mail: o mesmo texto de abordagem, com a despedida de e-mail (a assinatura fica por conta do app). */
export function buildEmailBody(lead: PitchLead, lang: PitchLang, city: string): string {
  return `${buildPitch(lead, lang, city)}\n\n${SIGN_OFF[lang]}`;
}
