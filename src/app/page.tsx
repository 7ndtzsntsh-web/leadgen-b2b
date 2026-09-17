"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Download, CheckCircle2, Play, MessageCircle, Phone, FileText, Copy, Star, LayoutDashboard, Settings, Mail } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DomainStatus } from "@/lib/domainValidator";
import { uiTranslations } from "@/lib/semanticDictionary";

export interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  siteStatus: DomainStatus | 'Sem Site';
  address: string;
  rating: number;
  reviewsCount: number;
  score: number;
  website?: string;
  phoneType?: 'MOBILE' | 'LANDLINE' | 'UNKNOWN';
  isExpansion?: boolean;
  expansionSource?: string;
}

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [ibgeCities, setIbgeCities] = useState<string[]>([]);

  useEffect(() => {
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')
      .then(res => res.json())
      .then(data => {
        setIbgeCities(data.map((m: any) => `${m.nome} - ${m.microrregiao.mesorregiao.UF.sigla}`));
      })
      .catch(() => {});
  }, []);

  // Filtros
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [volume, setVolume] = useState("50");
  const [country, setCountry] = useState("br");
  const [noSite, setNoSite] = useState(false);
  const [insecure, setInsecure] = useState(false);

  const t = uiTranslations[country] || uiTranslations["br"];

  const stopSearch = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
    setStatusMessage(t.buttonStop + "...");
  };

  const startSearch = () => {
    if (!category.trim()) {
      alert("Por favor, informe ao menos o Nicho/Segmento.");
      return;
    }
    
    setLeads([]);
    setLoading(true);
    setHasSearched(true);
    setStatusMessage("Connecting...");

    const params = new URLSearchParams();
    params.append("category", category);
    if (city.trim()) params.append("city", city);
    params.append("volume", volume);
    params.append("country", country);

    const sse = new EventSource(`/api/search-leads?${params.toString()}`);
    eventSourceRef.current = sse;

    sse.onmessage = (e) => {
      const parsed = JSON.parse(e.data);
      if (parsed.type === 'info') {
        setStatusMessage(parsed.message);
      } else if (parsed.type === 'lead') {
        const newLead = parsed.data as Lead;
        if (noSite && newLead.siteStatus !== 'Sem Site') return;
        if (insecure && newLead.siteStatus !== 'HTTP Inseguro' && newLead.siteStatus !== 'Erro 404/Inativo') return;
        
        setLeads(prev => {
          if (prev.some(l => l.id === newLead.id)) return prev;
          const updated = [...prev, newLead];
          return updated.sort((a, b) => b.score - a.score);
        });
      } else if (parsed.type === 'done' || parsed.type === 'error') {
        sse.close();
        setLoading(false);
        setStatusMessage(parsed.message);
      }
    };

    sse.onerror = (err) => {
      console.error("SSE Error:", err);
      sse.close();
      setLoading(false);
      setStatusMessage("Erro de conexão com o servidor. Verifique os logs.");
      alert("A conexão com o servidor falhou ou foi interrompida.");
    };
  };

  const getSiteStatusColor = (status: string) => {
    switch (status) {
      case 'Sem Site': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'HTTP Inseguro': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
      case 'Erro 404/Inativo': return 'bg-muted/50 text-muted-foreground border-muted/50';
      case 'SSL Válido': return 'bg-green-500/20 text-green-500 border-green-500/30';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const generatePASCopy = (lead: Lead) => {
    const nicho = lead.category || "seu negócio";
    const lang = country === 'us' ? 'en' : (country === 'es' ? 'es' : 'pt');
    
    // Extraindo cidade a partir do endereço para usar no texto (preferindo a fonte de expansão se houver)
    const cidade = lead.isExpansion && lead.expansionSource ? lead.expansionSource : (lead.address ? lead.address.split(',')[0].split('-')[0].trim() : (city || 'sua região'));
    
    if (lead.siteStatus === 'Sem Site' || lead.siteStatus === 'Erro 404/Inativo') {
      if (lang === 'en') {
        return `Hi ${lead.name} team! I found your business while searching in ${cidade} and noticed your great reputation, but I realized you don't have an official website yet. Local businesses lose daily quotes when clients search on their phones and only find competitors' pages. I've designed a practical digital capture structure for your profile. Can we schedule a quick, no-obligation meeting this week so I can present it to you?`;
      } else if (lang === 'es') {
        return `¡Hola equipo de ${lead.name}! Los encontré en las búsquedas en ${cidade} y vi la gran reputación de la empresa, pero noté que aún no tienen un sitio web oficial. Los negocios locales pierden cotizaciones diarias cuando los clientes buscan desde el móvil y solo encuentran la página de la competencia. He diseñado una estructura práctica de captación digital para su perfil. ¿Podemos agendar una reunión rápida sin compromiso esta semana para presentárselo?`;
      } else {
        return `Olá, responsável da ${lead.name}! Encontrei vocês nas buscas em ${cidade} e vi a ótima reputação da empresa, mas percebi que ainda não possuem um site oficial. Negócios locais perdem orçamentos diários quando clientes pesquisam no celular e encontram apenas a página de concorrentes. Desenhei uma estrutura prática de captação digital para o perfil de vocês. Podemos marcar uma reunião rápida sem compromisso esta semana para eu te apresentar?`;
      }
    } else {
      if (lang === 'en') {
        return `Hi ${lead.name} team! I was searching for services in ${cidade} and tried to visit your website, but my browser blocked it with a 'Not Secure' warning due to a missing SSL certificate. This drives new clients away due to mistrust and drops your company's ranking in searches. I already mapped out exactly how to solve this. Can we schedule a quick, no-obligation meeting to talk about it?`;
      } else if (lang === 'es') {
        return `¡Hola equipo de ${lead.name}! Estaba buscando servicios en ${cidade} e intenté acceder a su sitio web, pero el navegador lo bloqueó con una alerta de 'No Seguro' por falta de certificado SSL. Esto aleja a nuevos clientes por desconfianza y hunde el posicionamiento de la empresa en las búsquedas. Ya tengo mapeado exactamente cómo resolverlo. ¿Podemos agendar una reunión rápida sin compromiso para conversar al respecto?`;
      } else {
        return `Olá, responsável da ${lead.name}! Estava pesquisando serviços em ${cidade} e tentei acessar o site de vocês, mas o navegador bloqueou alertando 'Não Seguro' por ausência de certificado SSL. Isso afasta novos clientes por desconfiança e derruba o posicionamento da empresa nas buscas. Já mapeei exatamente como resolver isso. Podemos marcar uma reunião rápida sem compromisso para conversarmos a respeito?`;
      }
    }
  };

  const handleCopyMessage = (lead: Lead) => {
    const msg = generatePASCopy(lead);
    navigator.clipboard.writeText(msg);
  };

  const handleCopyAllMessages = () => {
    if (leads.length === 0) return;
    const allMsgs = leads.map(l => `=== ${l.name} (${l.phone}) ===\n${generatePASCopy(l)}\n`).join('\n\n');
    navigator.clipboard.writeText(allMsgs);
    alert(t.copyAll + " OK!");
  };

  const handleOpenWhatsApp = (lead: Lead) => {
    const msg = generatePASCopy(lead);
    const num = lead.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${country==='br'?'55':''}${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleCall = (lead: Lead) => {
    const num = lead.phone.replace(/\D/g, '');
    window.open(`tel:+${country==='br'?'55':''}${num}`, '_self');
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = [
      "Nome", 
      "Segmento", 
      "Origem (Expansão)", 
      "DDD", 
      "Telefone (Fixo/WPP)", 
      "Tipo Tel", 
      "E-mail Confirmado", 
      "Endereço Completo", 
      "Status do Site", 
      "URL", 
      "Avaliação Google",
      "Score"
    ];

    const csvContent = [
      headers.join(";"),
      ...leads.map(l => {
        let ddd = "";
        let phoneStr = l.phone;
        const digits = l.phone.replace(/\D/g, '');
        if (digits.length >= 10 && (digits.startsWith("55") ? digits.length >= 12 : true)) {
          const brDigits = digits.startsWith("55") ? digits.slice(2) : digits;
          ddd = brDigits.slice(0, 2);
          phoneStr = brDigits.slice(2);
        }
        
        return [
          `"${l.name}"`, 
          `"${l.category}"`, 
          `"${l.isExpansion ? (l.expansionSource || 'Expansão') : 'Busca Primária'}"`, 
          `"${ddd}"`, 
          `"${phoneStr}"`, 
          `"${l.phoneType || 'UNKNOWN'}"`, 
          `"${l.email}"`, 
          `"${l.address}"`, 
          `"${l.siteStatus}"`,
          `"${l.website || ''}"`,
          l.rating,
          l.score
        ].join(";")
      })
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads_pro_export.csv";
    link.click();
  };

  return (
    <div className="relative flex min-h-screen bg-[#090d16] overflow-hidden">
      {/* Padrão geométrico (Grid Pattern) */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
      
      {/* Gradientes radiais (Glow tech) */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-900/15 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-900/10 blur-[120px] rounded-full pointer-events-none"></div>

      <aside className="relative z-10 w-20 hidden md:flex flex-col items-center py-8 gap-8 backdrop-blur-md bg-black/20 border-r border-white/10 sticky top-0 h-screen transition-all hover:w-64 group shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
          <img src="/logo.png" alt="Vanguard Logo" className="w-full h-full object-cover" />
        </div>
        <nav className="flex flex-col gap-4 w-full px-4 mt-8">
          {[
            { icon: LayoutDashboard, label: "Dashboard" },
            { icon: Search, label: "Prospecção" },
            { icon: Settings, label: "Configurações" }
          ].map((item, i) => (
            <button key={i} onClick={() => { if(item.label !== 'Prospecção') alert(`O módulo ${item.label} está em desenvolvimento.`) }} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all w-full text-muted-foreground hover:text-white group/btn">
              <item.icon className="w-5 h-5 flex-shrink-0 group-hover/btn:scale-110 transition-transform" />
              <span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300 font-mono text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="relative z-10 flex-1 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/20 p-6 rounded-3xl border border-white/5 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.png" 
                alt="Vanguard Web Studio" 
                className="h-10 w-auto md:h-16 object-contain rounded-xl shadow-lg border border-white/10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
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

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="font-serif italic font-light text-2xl">Grid Search (Ultra Qualificado)</CardTitle>
              <CardDescription className="font-mono text-xs">Excluindo empresas sem meios de contato. Foco absoluto em leads conversíveis.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                <div className="space-y-4 col-span-1 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.niche}</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder={t.nichePlaceholder}
                          className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-primary/50"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.city}</label>
                      <div className="flex gap-2">
                        <Select value={country} onValueChange={(val) => { if (val) setCountry(val); }}>
                          <SelectTrigger className="bg-black/20 border-white/10 w-24">
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
                          className="bg-black/20 border-white/10 flex-1" 
                          onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                          list="ibge-cities"
                          autoComplete="off"
                        />
                        <datalist id="ibge-cities">
                          {ibgeCities.map((c, i) => <option key={i} value={c} />)}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="no-site" checked={noSite} onCheckedChange={(c) => setNoSite(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="no-site" className="text-sm font-medium leading-none text-gray-300">{t.onlyNoSite}</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="insecure" checked={insecure} onCheckedChange={(c) => setInsecure(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="insecure" className="text-sm font-medium leading-none text-gray-300">{t.onlyInsecure}</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.volume}</label>
                    <Select value={volume} onValueChange={(val) => { if (val) setVolume(val); }}>
                      <SelectTrigger className="bg-black/20 border-white/10">
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

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 bg-white/5 flex-wrap gap-4">
              <div>
                <CardTitle className="font-serif italic font-light text-2xl flex items-center gap-3">
                  {t.results}
                  {loading && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span></span>}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{leads.length} leads qualificados. {statusMessage}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={handleCopyAllMessages}>
                  <FileText className="w-4 h-4 mr-2" />
                  {t.copyAll}
                </Button>
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={handleExportCSV}>
                  <Download className="w-4 h-4 mr-2" />
                  {t.exportCsv}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              
              {/* MOBILE LAYOUT (CARDS) */}
              <div className="md:hidden flex flex-col gap-4 p-4">
                {!hasSearched ? (
                  <div className="text-center py-12 text-muted-foreground font-mono text-sm">Pronto para buscar no país selecionado.</div>
                ) : leads.length === 0 && !loading ? (
                  <div className="text-center py-12 text-muted-foreground font-mono text-sm">Nenhuma oportunidade encontrada.</div>
                ) : (
                  leads.map(lead => (
                    <div key={lead.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
                      {lead.isExpansion && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                      )}
                      <div>
                        <div className="font-medium text-white text-lg flex items-center gap-2">
                          {lead.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{lead.category}</div>
                        {lead.isExpansion && <div className="text-[10px] text-indigo-400 mt-1">🚀 EXPANSÃO: {lead.expansionSource}</div>}
                      </div>
                      
                      <div className="flex flex-col gap-1 text-sm text-gray-300">
                        {lead.phone !== 'Não informado' && <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-muted-foreground"/> {lead.phone}</div>}
                        {lead.email !== 'N/D' && <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-muted-foreground"/> {lead.email}</div>}
                        <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-muted-foreground"/> <span className="truncate">{lead.address}</span></div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <Badge variant="outline" className={`${getSiteStatusColor(lead.siteStatus)} font-mono text-[10px] uppercase`}>{lead.siteStatus}</Badge>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          <span className="text-xs text-yellow-500">{Number(lead.rating).toFixed(1)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button variant="outline" size="sm" className="bg-white/5 border-white/10 text-xs" onClick={() => { handleCopyMessage(lead); alert("Copiado!"); }}>
                          <Copy className="w-3 h-3 mr-1" /> Copiar
                        </Button>
                        {lead.phone !== 'Não informado' && lead.phoneType === 'LANDLINE' && (
                          <Button variant="default" size="sm" className="bg-blue-600/20 text-blue-400 border-blue-500/50 text-xs" onClick={() => handleCall(lead)}>
                            <Phone className="w-3 h-3 mr-1" /> Ligar
                          </Button>
                        )}
                        {lead.phone !== 'Não informado' && lead.phoneType === 'MOBILE' && (
                          <Button variant="default" size="sm" className="bg-[#25D366]/20 text-[#25D366] border-[#25D366]/50 shadow-[0_0_10px_rgba(37,211,102,0.1)] text-xs" onClick={() => handleOpenWhatsApp(lead)}>
                            <MessageCircle className="w-3 h-3 mr-1" /> WPP
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* DESKTOP LAYOUT (TABLE) */}
              <div className="hidden md:block overflow-x-auto">
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
                      <TableRow key={lead.id} className={`border-white/10 hover:bg-white/5 transition-colors group ${lead.isExpansion ? 'bg-indigo-900/10' : ''}`}>
                        <TableCell>
                          <div className="font-medium text-white group-hover:text-primary transition-colors flex flex-wrap items-center gap-2">
                            {lead.name}
                            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-[9px] px-1 uppercase whitespace-nowrap flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> VERIFICADO
                            </Badge>
                            {lead.isExpansion && (
                              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/30 text-[9px] px-1 uppercase whitespace-nowrap">
                                🚀 EXPANSÃO: {lead.expansionSource}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-1 mb-1">{lead.category}</div>
                          
                          <div className="flex items-center gap-2 mt-2">
                            {lead.phone !== 'Não informado' && (
                              <div className="text-sm font-mono text-white flex items-center">
                                {lead.phoneType === 'MOBILE' ? (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-[9px] mr-2 px-1">WPP</Badge>
                                ) : lead.phoneType === 'LANDLINE' ? (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[9px] mr-2 px-1">FIXO</Badge>
                                ) : null}
                                {lead.phone}
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground flex items-center mt-2">
                            <MapPin className="w-3 h-3 mr-1 opacity-70 flex-shrink-0" />
                            <span className="truncate max-w-[200px] block" title={lead.address}>{lead.address}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {lead.email !== 'N/D' ? (
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={lead.email}>
                                📧 {lead.email}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground/50 italic">📧 Sem E-mail detectado</div>
                            )}
                            
                            {lead.website ? (
                              <div className="text-xs text-blue-400 truncate max-w-[180px] hover:underline cursor-pointer" onClick={() => window.open(lead.website?.startsWith('http') ? lead.website : `http://${lead.website}`, '_blank')}>
                                🌐 {lead.website}
                              </div>
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
                            {lead.rating && lead.rating > 0 && (
                              <div className="flex items-center text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                {Number(lead.rating).toFixed(1)} <span className="text-muted-foreground ml-1">({lead.reviewsCount})</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden w-16">
                              <div 
                                className={`h-full ${lead.score > 80 ? 'bg-green-500' : lead.score > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} 
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
                              onClick={() => { handleCopyMessage(lead); alert("Copy PAS copiada!"); }}
                            >
                              Copiar Pitch
                              <Copy className="w-3 h-3 ml-1" />
                            </Button>
                            
                            {lead.phone !== 'Não informado' && (
                              lead.phoneType === 'LANDLINE' ? (
                                <Button 
                                  variant="default" size="sm" 
                                  className="bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600 hover:text-white transition-all text-[10px] h-7 w-24 flex justify-between"
                                  onClick={() => handleCall(lead)}
                                >
                                  Ligar Fixo
                                  <Phone className="w-3 h-3 ml-1" />
                                </Button>
                              ) : (
                                <Button 
                                  variant="default" size="sm" 
                                  className="bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 hover:bg-[#25D366] hover:text-white transition-all shadow-[0_0_10px_rgba(37,211,102,0.1)] hover:shadow-[0_0_20px_rgba(37,211,102,0.4)] text-[10px] h-7 w-24 flex justify-between"
                                  onClick={() => handleOpenWhatsApp(lead)}
                                >
                                  WhatsApp
                                  <MessageCircle className="w-3 h-3 ml-1" />
                                </Button>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
