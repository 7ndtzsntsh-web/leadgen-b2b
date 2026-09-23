"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, MapPin, Download, CheckCircle2, Play, MessageCircle, Phone, FileText, Copy, Star, LayoutDashboard, Settings, Mail, Check } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  NO_PHONE, callOf, compareLeads, formatCnpj, getPhoneType, internationalNumber, isNewCompany, matchesSiteFilters, sameNumber, whatsappOf,
  type Lead,
} from "@/lib/leadRules";
import { semanticDictionary, uiTranslations } from "@/lib/semanticDictionary";
import { buildEmailBody, buildEmailSubject, buildPitch, pitchLangFor } from "@/lib/pitches";

const DESKTOP_QUERY = "(min-width: 768px)";
const FLUSH_INTERVAL_MS = 300;

/** Só monta a versão (cards ou tabela) que cabe na tela. Antes as duas eram renderizadas e uma ficava escondida. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para navegadores/contextos sem a Clipboard API.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

const getSiteStatusColor = (status: string) => {
  switch (status) {
    case "Sem Site": return "bg-destructive/20 text-destructive border-destructive/30";
    case "Só Rede Social": return "bg-pink-500/20 text-pink-400 border-pink-500/30";
    case "HTTP Inseguro": return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    case "Erro 404/Inativo": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "SSL Válido": return "bg-green-500/20 text-green-500 border-green-500/30";
    default: return "bg-secondary text-secondary-foreground";
  }
};

/** O site vem de dados de terceiros: só http/https viram link (impede `javascript:` e similares). */
function safeHref(website: string): string | undefined {
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `http://${website}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const csvCell = (value: string | number | undefined): string => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // evita fórmula ao abrir no Excel/Sheets
  return `"${text.replace(/"/g, '""')}"`;
};

interface LeadItemProps {
  lead: Lead;
  /** País da busca que trouxe o lead (não o que está selecionado agora na tela). */
  country: string;
  copied: boolean;
  onCopy: (lead: Lead) => void;
  onWhatsApp: (lead: Lead) => void;
  onEmail: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
}

/** Só endereço simples vira link mailto: (o e-mail vem de terceiros; "?" ou "&" poderiam mudar a mensagem). */
const MAILTO_SAFE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * `wpp` abre no WhatsApp: o confirmado ou, se não houver, o celular (aí o botão diz "Testar", porque pode não ter
 * WhatsApp). Nos EUA não há WhatsApp: no lugar dele vai o e-mail (`mail`). `call` é o número para ligar.
 * `numbers` são os telefones a exibir além do WhatsApp confirmado.
 */
function contactOf(lead: Lead, country: string) {
  const byEmail = country === "us";
  const wpp = byEmail ? undefined : whatsappOf(lead);
  const mail = byEmail && MAILTO_SAFE.test(lead.email) ? lead.email : undefined;
  const call = callOf(lead);
  const numbers = [lead.phone, ...(lead.otherPhones ?? [])].filter(
    (n) => n !== NO_PHONE && !(lead.whatsapp && sameNumber(n, lead.whatsapp))
  );
  return { wpp, wppConfirmed: !!lead.whatsapp, mail, call, numbers };
}

/**
 * Tipo do número. Celular sem WhatsApp confirmado é "CEL", nunca "WPP": era isso que enganava. Nos EUA não dá para
 * saber pelo número se é celular ou fixo: não mostra nada (antes lia como número do Brasil e dizia "FIXO").
 */
function PhoneKind({ phone, country }: { phone: string; country: string }) {
  const kind = getPhoneType(phone, country);
  if (kind === "MOBILE") {
    return (
      <Badge variant="outline" title="Celular: WhatsApp não confirmado" className="bg-gray-500/10 text-gray-300 border-gray-500/30 text-[9px] mr-2 px-1">
        CEL
      </Badge>
    );
  }
  if (kind === "LANDLINE") {
    return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[9px] mr-2 px-1">FIXO</Badge>;
  }
  return null;
}

/** CNPJ e ano de abertura (quando o lead veio da Receita Federal) e o selo de empresa recém-aberta. */
function CompanyInfo({ lead }: { lead: Lead }) {
  if (!lead.cnpj) return null;
  return (
    <div className="text-[10px] font-mono text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
      <span>CNPJ {formatCnpj(lead.cnpj)}{lead.openedOn ? ` · aberta em ${lead.openedOn.slice(0, 4)}` : ""}</span>
      {isNewCompany(lead.openedOn) && (
        <Badge
          variant="outline"
          title="Aberta há até 2 anos: a melhor hora para vender site"
          className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px] px-1 uppercase whitespace-nowrap"
        >
          Empresa nova
        </Badge>
      )}
    </div>
  );
}

/** Cadastro sem atualização há 5 anos ou mais: a empresa pode ter fechado ou trocado de número. */
function StaleBadge({ lead }: { lead: Lead }) {
  if (!lead.staleSince) return null;
  return (
    <Badge
      variant="outline"
      title="Cadastro sem atualização há anos: a empresa pode ter fechado ou trocado de número"
      className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] px-1 uppercase whitespace-nowrap"
    >
      ⚠ Dados de {lead.staleSince}
    </Badge>
  );
}

/**
 * Selo de verificação: reflete as checagens REAIS feitas no servidor (telefone, WhatsApp, e-mail, site, atividade
 * da empresa e cidade do endereço). Só é "VERIFICADO" quando TODAS foram confirmadas; o resto é "PARCIAL" com o motivo.
 * Usa <details>, então abre com um toque no celular (não depende de passar o mouse).
 */
function VerificationDetails({ lead }: { lead: Lead }) {
  const checks = lead.checks ?? [];
  if (checks.length === 0) return null;
  // As checagens só informativas (ex.: WhatsApp, que não dá para confirmar de graça) não entram na conta.
  const counted = checks.filter((c) => !c.info);
  const confirmed = counted.filter((c) => c.ok).length;
  return (
    <details className="text-[11px]">
      <summary
        className="list-none cursor-pointer inline-flex items-center gap-2 select-none py-3 md:py-1 [&::-webkit-details-marker]:hidden"
        aria-label="Ver o que foi verificado neste lead"
      >
        {lead.verified ? (
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px] px-1 uppercase whitespace-nowrap flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> VERIFICADO
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] px-1 uppercase whitespace-nowrap">
            ⚠ PARCIAL {confirmed}/{counted.length}
          </Badge>
        )}
        <span className="text-muted-foreground underline decoration-dotted">o que foi checado</span>
      </summary>
      <ul className="mt-2 space-y-1 leading-snug">
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? "text-green-400" : c.info ? "text-gray-400" : "text-yellow-400"}>
            {c.ok ? "✔" : c.info ? "ℹ" : "⚠"} {c.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}

const LeadCard = memo(function LeadCard({ lead, country, copied, onCopy, onWhatsApp, onEmail, onCall }: LeadItemProps) {
  const { wpp, wppConfirmed, mail, call, numbers } = contactOf(lead, country);
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
      {lead.isExpansion && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>}
      <div>
        <div className="font-medium text-white text-lg flex items-center gap-2">{lead.name}</div>
        <div className="text-xs text-muted-foreground mt-1">{lead.category}</div>
        <CompanyInfo lead={lead} />
        {lead.staleSince && <div className="mt-1"><StaleBadge lead={lead} /></div>}
        <div className="mt-2"><VerificationDetails lead={lead} /></div>
        {lead.isExpansion && <div className="text-[10px] text-indigo-400 mt-1">🚀 EXPANSÃO: {lead.expansionSource}</div>}
      </div>

      <div className="flex flex-col gap-1 text-sm text-gray-300">
        {lead.whatsapp && <div className="flex items-center gap-2 text-[#25D366]"><MessageCircle className="w-3 h-3" /> {lead.whatsapp}</div>}
        {numbers.map((n) => (
          <div key={n} className="flex items-center gap-2"><Phone className="w-3 h-3 text-muted-foreground" /> <span className="flex items-center"><PhoneKind phone={n} country={country} />{n}</span></div>
        ))}
        {lead.email !== "N/D" && <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-muted-foreground" /> <span className="truncate">{lead.email}</span></div>}
        <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" /> <span className="truncate">{lead.address}</span></div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <Badge variant="outline" className={`${getSiteStatusColor(lead.siteStatus)} font-mono text-[10px] uppercase`}>{lead.siteStatus}</Badge>
        <div className="flex items-center gap-3">
          {lead.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-500 fill-current" />
              <span className="text-xs text-yellow-500">{Number(lead.rating).toFixed(1)}</span>
            </div>
          )}
          <span className="text-xs font-mono text-muted-foreground">score {lead.score}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-1">
        <Button variant="outline" className="bg-white/5 border-white/10 text-xs h-11" onClick={() => onCopy(lead)}>
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />} {copied ? "Copiado" : "Copiar"}
        </Button>
        {wpp && (
          <Button variant="default" className="bg-[#25D366]/20 text-[#25D366] border-[#25D366]/50 text-xs h-11" onClick={() => onWhatsApp(lead)}>
            <MessageCircle className="w-3 h-3 mr-1" /> {wppConfirmed ? "WPP" : "Testar WPP"}
          </Button>
        )}
        {mail && (
          <Button variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-xs h-11" onClick={() => onEmail(lead)}>
            <Mail className="w-3 h-3 mr-1" /> E-mail
          </Button>
        )}
        {call && (
          <Button variant="default" className={`bg-blue-600/20 text-blue-400 border-blue-500/50 text-xs h-11 ${wpp || mail ? "col-span-2" : ""}`} onClick={() => onCall(lead)}>
            <Phone className="w-3 h-3 mr-1" /> Ligar
          </Button>
        )}
      </div>
    </div>
  );
});

const LeadRow = memo(function LeadRow({ lead, country, copied, onCopy, onWhatsApp, onEmail, onCall }: LeadItemProps) {
  const { wpp, wppConfirmed, mail, call, numbers } = contactOf(lead, country);
  return (
    <TableRow className={`border-white/10 hover:bg-white/5 transition-colors group ${lead.isExpansion ? "bg-indigo-900/10" : ""}`}>
      <TableCell>
        <div className="font-medium text-white group-hover:text-primary transition-colors flex flex-wrap items-center gap-2">
          {lead.name}
          {lead.isExpansion && (
            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[9px] px-1 uppercase whitespace-nowrap">
              🚀 EXPANSÃO: {lead.expansionSource}
            </Badge>
          )}
          <StaleBadge lead={lead} />
        </div>
        <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-1 mb-1">{lead.category}</div>
        <CompanyInfo lead={lead} />
        <div className="mt-1"><VerificationDetails lead={lead} /></div>

        <div className="flex flex-col gap-1 mt-2">
          {lead.whatsapp && (
            <div className="text-sm font-mono text-white flex items-center">
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-[9px] mr-2 px-1">WPP</Badge>
              {lead.whatsapp}
            </div>
          )}
          {numbers.map((n) => (
            <div key={n} className="text-sm font-mono text-white flex items-center">
              <PhoneKind phone={n} country={country} />
              {n}
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground flex items-center mt-2">
          <MapPin className="w-3 h-3 mr-1 opacity-70 flex-shrink-0" />
          <span className="truncate max-w-[200px] block" title={lead.address}>{lead.address}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {lead.email !== "N/D" ? (
            <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={lead.email}>📧 {lead.email}</div>
          ) : (
            <div className="text-xs text-muted-foreground/50 italic">📧 Sem E-mail detectado</div>
          )}

          {lead.website ? (
            <a
              className="text-xs text-blue-400 truncate max-w-[180px] hover:underline"
              href={safeHref(lead.website)}
              target="_blank"
              rel="noopener noreferrer"
            >
              🌐 {lead.website}
            </a>
          ) : (
            <div className="text-xs text-muted-foreground/50 italic">🌐 Nenhum domínio detectado</div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-2">
          <Badge variant="outline" className={`${getSiteStatusColor(lead.siteStatus)} font-mono text-[10px] uppercase`}>
            {lead.siteStatus}
          </Badge>
          {lead.rating > 0 && (
            <div className="flex items-center text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
              <Star className="w-3 h-3 mr-1 fill-current" />
              {Number(lead.rating).toFixed(1)} <span className="text-muted-foreground ml-1">({lead.reviewsCount})</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="bg-white/10 rounded-full h-1.5 overflow-hidden w-16">
            <div
              className={`h-full ${lead.score > 80 ? "bg-green-500" : lead.score > 50 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${lead.score}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{lead.score}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col gap-2 items-end">
          <Button
            variant="outline" size="sm"
            className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all text-[10px] h-7 w-24 flex justify-between"
            onClick={() => onCopy(lead)}
          >
            {copied ? "Copiado!" : "Copiar Pitch"}
            {copied ? <Check className="w-3 h-3 ml-1" /> : <Copy className="w-3 h-3 ml-1" />}
          </Button>

          {wpp && (
            <Button
              variant="default" size="sm"
              className="bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 hover:bg-[#25D366] hover:text-white transition-all shadow-[0_0_10px_rgba(37,211,102,0.1)] hover:shadow-[0_0_20px_rgba(37,211,102,0.4)] text-[10px] h-7 w-24 flex justify-between"
              onClick={() => onWhatsApp(lead)}
            >
              {wppConfirmed ? "WhatsApp" : "Testar WPP"}
              <MessageCircle className="w-3 h-3 ml-1" />
            </Button>
          )}
          {mail && (
            <Button
              variant="default" size="sm"
              className="bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500 hover:text-white transition-all text-[10px] h-7 w-24 flex justify-between"
              onClick={() => onEmail(lead)}
            >
              E-mail
              <Mail className="w-3 h-3 ml-1" />
            </Button>
          )}
          {call && (
            <Button
              variant="default" size="sm"
              className="bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600 hover:text-white transition-all text-[10px] h-7 w-24 flex justify-between"
              onClick={() => onCall(lead)}
            >
              Ligar
              <Phone className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<Lead[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const isDesktop = useIsDesktop();

  // Filtros
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [volume, setVolume] = useState("50");
  const [country, setCountry] = useState("br");
  // País e cidade da última busca: os botões dos leads usam estes (trocar o país na tela depois não muda o DDI).
  const [searched, setSearched] = useState({ country: "br", city: "" });
  const [noSite, setNoSite] = useState(false);
  const [insecure, setInsecure] = useState(false);

  const t = uiTranslations[country] || uiTranslations["br"];

  // Autocomplete de cidades (Brasil e EUA): consulta só as sugestões que casam (antes baixava os 5.571 municípios
  // do IBGE e montava 5.571 opções na tela, o que travava o celular).
  const cityQuery = city.split(" - ")[0].trim();
  const canSuggest = (country === "br" || country === "us") && cityQuery.length >= 2 && !city.includes(" - ");
  useEffect(() => {
    if (!canSuggest) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/cities?q=${encodeURIComponent(cityQuery)}&country=${country}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((list: string[]) => setCitySuggestions(Array.isArray(list) ? list : []))
        .catch(() => {});
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSuggest, cityQuery, country]);
  const shownSuggestions = canSuggest ? citySuggestions : [];

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  // Os leads chegam um a um; agrupar em lotes evita renderizar a lista inteira a cada lead (pesado no celular).
  const flushLeads = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const batch = bufferRef.current;
    bufferRef.current = [];
    if (batch.length === 0) return;
    setLeads((prev) => {
      const seen = new Set(prev.map((l) => l.id));
      const merged = [...prev, ...batch.filter((l) => !seen.has(l.id))];
      // Sempre da maior nota (mais fácil de vender) para a menor, inclusive durante a busca.
      return merged.sort(compareLeads);
    });
  }, []);

  const queueLead = useCallback((lead: Lead) => {
    bufferRef.current.push(lead);
    if (flushTimerRef.current === null) {
      flushTimerRef.current = window.setTimeout(() => flushLeads(), FLUSH_INTERVAL_MS);
    }
  }, [flushLeads]);

  const closeStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const stopSearch = () => {
    closeStream();
    flushLeads();
    setLoading(false);
    setStatusMessage(t.buttonStop);
  };

  const startSearch = () => {
    if (!category.trim()) {
      showToast("Informe ao menos o Nicho/Segmento.");
      return;
    }

    closeStream();
    bufferRef.current = [];
    setLeads([]);
    setLoading(true);
    setHasSearched(true);
    setSearched({ country, city });
    setStatusMessage("Conectando...");
    if (!isDesktop) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const params = new URLSearchParams();
    params.append("category", category);
    if (city.trim()) params.append("city", city);
    params.append("volume", volume);
    params.append("country", country);
    if (noSite) params.append("noSite", "true");
    if (insecure) params.append("insecure", "true");

    const sse = new EventSource(`/api/search-leads?${params.toString()}`);
    eventSourceRef.current = sse;

    const finish = (message: string) => {
      sse.close();
      if (eventSourceRef.current === sse) eventSourceRef.current = null;
      flushLeads();
      setLoading(false);
      setStatusMessage(message);
    };

    sse.onmessage = (e) => {
      let parsed: { type: string; message?: string; data?: Lead };
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      if (parsed.type === "info" && parsed.message) {
        setStatusMessage(parsed.message);
      } else if (parsed.type === "lead" && parsed.data) {
        const lead = parsed.data;
        if (matchesSiteFilters(lead.siteStatus, noSite, insecure)) queueLead(lead);
      } else if (parsed.type === "done" || parsed.type === "error") {
        finish(parsed.message ?? "");
      }
    };

    // Rede móvel oscila. Não reconecta sozinho (recomeçaria a busca e gastaria a API de novo), mas mantém os
    // leads já encontrados e avisa sem alert() bloqueante.
    sse.onerror = () => {
      finish("Conexão interrompida. Os leads encontrados foram mantidos; toque em buscar para tentar de novo.");
    };
  };

  // A cidade do ENDEREÇO do lead vem primeiro (a busca pode devolver empresas de cidades vizinhas).
  const cityOf = useCallback(
    (lead: Lead) => lead.city || lead.expansionSource || searched.city.split(" - ")[0].trim() || (searched.country === "us" ? "your area" : "sua região"),
    [searched]
  );
  const pitchFor = useCallback(
    (lead: Lead) => buildPitch(lead, pitchLangFor(searched.country), cityOf(lead)),
    [searched, cityOf]
  );

  const handleCopyMessage = useCallback(async (lead: Lead) => {
    const ok = await copyToClipboard(pitchFor(lead));
    if (!ok) {
      showToast("Não foi possível copiar.");
      return;
    }
    setCopiedId(lead.id);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedId(null), 1800);
  }, [pitchFor, showToast]);

  const handleCopyAllMessages = async () => {
    if (leads.length === 0) return;
    const all = leads.map((l) => `=== ${l.name} (${l.phone}) ===\n${pitchFor(l)}\n`).join("\n\n");
    showToast((await copyToClipboard(all)) ? `${t.copyAll} OK!` : "Não foi possível copiar.");
  };

  const handleOpenWhatsApp = useCallback((lead: Lead) => {
    const number = contactOf(lead, searched.country).wpp;
    if (!number) return;
    window.open(`https://wa.me/${internationalNumber(number, searched.country)}?text=${encodeURIComponent(pitchFor(lead))}`, "_blank", "noopener,noreferrer");
  }, [searched, pitchFor]);

  // Abre o app de e-mail já com assunto e texto (nos EUA, no lugar do WhatsApp).
  const handleEmail = useCallback((lead: Lead) => {
    const address = contactOf(lead, searched.country).mail;
    if (!address) return;
    const lang = pitchLangFor(searched.country);
    const subject = encodeURIComponent(buildEmailSubject(lead, lang));
    const body = encodeURIComponent(buildEmailBody(lead, lang, cityOf(lead)));
    window.open(`mailto:${address}?subject=${subject}&body=${body}`, "_self");
  }, [searched, cityOf]);

  const handleCall = useCallback((lead: Lead) => {
    const number = contactOf(lead, searched.country).call;
    if (!number) return;
    window.open(`tel:+${internationalNumber(number, searched.country)}`, "_self");
  }, [searched]);

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = [
      "Nome", "Segmento", "Origem (Expansão)", "DDD", "Telefone (Fixo/WPP)", "Tipo Tel", "WhatsApp",
      "E-mail do site (domínio recebe e-mails)", "Endereço Completo", "Cidade (do endereço)", "Status do Site", "URL",
      "Avaliação Google", "Score", "Verificação", "Checagens", "WhatsApp confirmado", "Outros telefones",
      "Cadastro sem atualização desde", "CNPJ", "Aberta em",
    ];

    const rows = leads.map((l) => {
      let ddd = "";
      let phoneStr = l.phone;
      const digits = l.phone.replace(/\D/g, "");
      if (digits.length >= 10 && (digits.startsWith("55") ? digits.length >= 12 : true)) {
        const brDigits = digits.startsWith("55") ? digits.slice(2) : digits;
        ddd = brDigits.slice(0, 2);
        phoneStr = brDigits.slice(2);
      }
      return [
        l.name, l.category, l.isExpansion ? (l.expansionSource || "Expansão") : "Busca Primária", ddd, phoneStr,
        l.phoneType || "UNKNOWN", whatsappOf(l) ?? "", l.email, l.address, l.city ?? "", l.siteStatus, l.website || "",
        l.rating > 0 ? l.rating : "", l.score, l.verified ? "VERIFICADO" : "PARCIAL",
        (l.checks ?? []).map((c) => `${c.ok ? "OK" : c.info ? "INFO" : "PENDENTE"}: ${c.detail}`).join(" | "),
        l.whatsapp ? "Sim" : "Não", (l.otherPhones ?? []).join(" / "), l.staleSince ?? "",
        l.cnpj ? formatCnpj(l.cnpj) : "", l.openedOn ?? "",
      ].map(csvCell).join(";");
    });

    const blob = new Blob(["﻿" + [headers.map(csvCell).join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads_pro_export.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const target = parseInt(volume, 10) || 50;

  return (
    <div className="relative flex min-h-screen bg-[#090d16] overflow-hidden">
      {/* Padrão geométrico (Grid Pattern) */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

      {/* Brilhos de fundo. Gradiente radial no lugar de blur-[120px], que pesava muito na GPU do celular */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[radial-gradient(closest-side,rgba(30,58,138,0.28),transparent)] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[radial-gradient(closest-side,rgba(76,29,149,0.2),transparent)] pointer-events-none"></div>

      <aside className="relative z-10 w-20 hidden md:flex flex-col items-center py-8 gap-8 backdrop-blur-md bg-black/20 border-r border-white/10 sticky top-0 h-screen transition-all hover:w-64 group shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Vanguard Logo" className="w-full h-full object-cover" />
        </div>
        <nav className="flex flex-col gap-4 w-full px-4 mt-8">
          {[
            { icon: LayoutDashboard, label: "Dashboard" },
            { icon: Search, label: "Prospecção" },
            { icon: Settings, label: "Configurações" },
          ].map((item, i) => (
            <button key={i} onClick={() => { if (item.label !== "Prospecção") showToast(`O módulo ${item.label} está em desenvolvimento.`); }} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all w-full text-muted-foreground hover:text-white group/btn">
              <item.icon className="w-5 h-5 flex-shrink-0 group-hover/btn:scale-110 transition-transform" />
              <span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300 font-mono text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="relative z-10 flex-1 p-4 md:p-12 overflow-y-auto min-w-0">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">

          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/40 md:bg-black/20 p-4 md:p-6 rounded-3xl border border-white/5 md:backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Vanguard Web Studio"
                className="h-10 w-auto md:h-16 object-contain rounded-xl shadow-lg border border-white/10"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  console.error("Arquivo /logo.png não encontrado na pasta public/");
                }}
              />
              <div>
                <h1 className="font-serif italic font-light text-3xl md:text-4xl text-white tracking-wide">
                  LeadHunter <span className="text-primary not-italic font-sans font-semibold tracking-tighter">B2B</span>
                </h1>
                <p className="font-mono text-muted-foreground text-sm mt-1">{t.title}</p>
              </div>
            </div>
          </header>

          <Card className="bg-black/60 md:bg-black/40 md:backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="font-serif italic font-light text-2xl">Grid Search (Ultra Qualificado)</CardTitle>
              <CardDescription className="font-mono text-xs">Excluindo empresas sem meios de contato. Foco absoluto em leads conversíveis.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

                <div className="space-y-4 col-span-1 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.niche}</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3.5 md:top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={t.nichePlaceholder}
                          className="pl-9 h-11 md:h-8 bg-black/20 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-primary/50"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && startSearch()}
                          list="niche-suggestions"
                          enterKeyHint="search"
                          autoComplete="off"
                        />
                        <datalist id="niche-suggestions">
                          {Object.keys(semanticDictionary).map((niche) => <option key={niche} value={niche} />)}
                        </datalist>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.city}</label>
                      <div className="flex gap-2">
                        <Select value={country} onValueChange={(val) => { if (val) setCountry(val); }}>
                          <SelectTrigger className="bg-black/20 border-white/10 w-24 h-11! md:h-8!">
                            <SelectValue placeholder="País" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="br">BR 🇧🇷</SelectItem>
                            <SelectItem value="pt">PT 🇵🇹</SelectItem>
                            <SelectItem value="us">US 🇺🇸</SelectItem>
                            <SelectItem value="es">ES 🇪🇸</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder={t.cityPlaceholder}
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="bg-black/20 border-white/10 flex-1 h-11 md:h-8"
                          onKeyDown={(e) => e.key === "Enter" && startSearch()}
                          list="city-suggestions"
                          enterKeyHint="search"
                          autoComplete="off"
                          autoCorrect="off"
                        />
                        <datalist id="city-suggestions">
                          {shownSuggestions.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                      <div className="flex items-center space-x-2 min-h-11 md:min-h-0">
                        <Checkbox id="no-site" checked={noSite} onCheckedChange={(c) => setNoSite(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="no-site" className="text-sm font-medium leading-tight text-gray-300">{t.onlyNoSite}</label>
                      </div>
                      <div className="flex items-center space-x-2 min-h-11 md:min-h-0">
                        <Checkbox id="insecure" checked={insecure} onCheckedChange={(c) => setInsecure(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="insecure" className="text-sm font-medium leading-tight text-gray-300">{t.onlyInsecure}</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.volume}</label>
                    <Select value={volume} onValueChange={(val) => { if (val) setVolume(val); }}>
                      <SelectTrigger className="bg-black/20 border-white/10 h-11! md:h-8!">
                        <SelectValue placeholder="Volume" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20 Leads Válidos</SelectItem>
                        <SelectItem value="50">50 Leads Válidos</SelectItem>
                        <SelectItem value="100">100 Leads Válidos</SelectItem>
                        <SelectItem value="200">Max (200+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col justify-end space-y-3">
                  {loading ? (
                    <Button variant="destructive" className="w-full h-12 shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all" onClick={stopSearch}>
                      {t.buttonStop}
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                      onClick={startSearch}
                    >
                      {t.buttonSearch} <Play className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div ref={resultsRef} className="scroll-mt-4">
            <Card className="bg-black/60 md:bg-black/40 md:backdrop-blur-xl border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 bg-white/5 flex-wrap gap-4">
                <div>
                  <CardTitle className="font-serif italic font-light text-2xl flex items-center gap-3">
                    {t.results}
                    {loading && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span></span>}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">{leads.length}{loading ? `/${target}` : ""} leads qualificados, ordenados pela nota (maior = mais fácil de vender). {statusMessage}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white h-11 md:h-7" onClick={handleCopyAllMessages}>
                    <FileText className="w-4 h-4 mr-2" />
                    {t.copyAll}
                  </Button>
                  <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white h-11 md:h-7" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    {t.exportCsv}
                  </Button>
                </div>
              </CardHeader>
              {loading && (
                <div className="h-0.5 bg-white/10">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, (leads.length / target) * 100)}%` }} />
                </div>
              )}
              <CardContent className="p-0">
                {!isDesktop ? (
                  // MOBILE (cards)
                  <div className="flex flex-col gap-4 p-4">
                    {!hasSearched ? (
                      <div className="text-center py-12 text-muted-foreground font-mono text-sm">Pronto para buscar no país selecionado.</div>
                    ) : leads.length === 0 && !loading ? (
                      <div className="text-center py-12 text-muted-foreground font-mono text-sm">Nenhuma oportunidade encontrada.</div>
                    ) : (
                      leads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} country={searched.country} copied={copiedId === lead.id} onCopy={handleCopyMessage} onWhatsApp={handleOpenWhatsApp} onEmail={handleEmail} onCall={handleCall} />
                      ))
                    )}
                  </div>
                ) : (
                  // DESKTOP (tabela)
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <Table>
                        <TableHeader className="bg-white/5">
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[30%]">Empresa & Contato</TableHead>
                            <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[25%]">Presença Digital</TableHead>
                            <TableHead className="font-mono text-xs uppercase text-muted-foreground">Diagnóstico</TableHead>
                            <TableHead className="font-mono text-xs uppercase text-muted-foreground">Score</TableHead>
                            <TableHead className="text-right font-mono text-xs uppercase text-muted-foreground">Abordagem</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!hasSearched ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">Pronto para buscar no país selecionado.</TableCell>
                            </TableRow>
                          ) : leads.length === 0 && !loading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">Nenhuma oportunidade encontrada. Tente expandir a região.</TableCell>
                            </TableRow>
                          ) : (
                            leads.map((lead) => (
                              <LeadRow key={lead.id} lead={lead} country={searched.country} copied={copiedId === lead.id} onCopy={handleCopyMessage} onWhatsApp={handleOpenWhatsApp} onEmail={handleEmail} onCall={handleCall} />
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded-full bg-black/90 border border-white/20 px-4 py-2 text-sm text-white shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
