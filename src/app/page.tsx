"use client";

import { useState, useRef } from "react";
import { Search, MapPin, Globe, Star, Download, Copy, MessageCircle, Settings, LayoutDashboard, FileText, Play } from "lucide-react";

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
}

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Filtros
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [volume, setVolume] = useState("50");
  const [country, setCountry] = useState("br");
  const [noSite, setNoSite] = useState(false);
  const [insecure, setInsecure] = useState(false);

  // Textos Dinâmicos (Internacionalização)
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

    sse.onerror = () => {
      sse.close();
      setLoading(false);
      setStatusMessage("Connection closed.");
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
    
    if (lead.siteStatus === 'Sem Site' || lead.siteStatus === 'Erro 404/Inativo') {
      if (lang === 'en') {
        return `Hi ${lead.name} team! Hope you're doing well.\n\nI was looking for ${nicho} services and noticed you have great reviews, but I couldn't find an official professional website for your business.\n\nToday, most mobile customers end up going to competitors simply because they click on the official link right from Google. You are likely missing out on daily contacts because of this.\n\nCould we schedule a quick, no-obligation meeting so I can show you how to fix this and dominate local searches in your area?`;
      } else if (lang === 'es') {
        return `¡Hola equipo de ${lead.name}! ¿Todo bien?\n\nEstaba buscando servicios de ${nicho} y noté que tienen excelentes reseñas, pero aún no cuentan con un sitio web oficial y profesional operando.\n\nHoy en día, la mayoría de los clientes que buscan desde el móvil terminan cerrando con la competencia simplemente porque hacen clic en el enlace oficial directo en Google. Probablemente estén perdiendo contactos diarios por esto.\n\n¿Podríamos agendar una breve reunión sin compromiso para mostrarte cómo resolver esto y dominar las búsquedas en tu zona?`;
      } else {
        return `Olá, responsável da ${lead.name}! Tudo bem?\n\nEstava buscando por ${nicho} e percebi que vocês têm excelentes avaliações, mas ainda não possuem um site próprio e profissional operando.\n\nHoje, a maioria dos clientes que pesquisa pelo celular acaba fechando com a concorrência porque clicam no link oficial direto no Google. Vocês estão perdendo de receber contatos diários por causa disso.\n\nPodemos marcar uma rápida reunião, sem compromisso, para eu te mostrar como resolver isso e dominar as buscas na sua região?`;
      }
    } else {
      if (lang === 'en') {
        return `Hi ${lead.name} team! Hope you're doing well.\n\nI found you on Google and tried to visit your website, but my browser blocked it with a "Not Secure" warning (missing updated HTTPS certificate).\n\nThis causes many potential customers to leave out of fear of viruses or scams, and it heavily drops your ranking on Google searches.\n\nI identified exactly where the issue is. Could we schedule a quick, no-obligation meeting so I can explain how to fix this and restore full credibility for your clients?`;
      } else if (lang === 'es') {
        return `¡Hola equipo de ${lead.name}! ¿Todo bien?\n\nLos encontré en Google e intenté entrar a su sitio web, pero mi navegador lo bloqueó con una alerta de "No Seguro" (falta certificado HTTPS actualizado).\n\nEsto hace que muchos clientes desistan de contactarlos por miedo a virus o estafas, además de hundir su posicionamiento en las búsquedas.\n\nIdentifiqué exactamente dónde está el fallo. ¿Podríamos agendar una breve reunión sin compromiso para explicarte cómo arreglar esto y volver a transmitir máxima credibilidad?`;
      } else {
        return `Olá, responsável da ${lead.name}! Tudo bem?\n\nEncontrei vocês no Google e fui acessar o site, mas o navegador bloqueou alertando "Não Seguro" (sem certificado HTTPS atualizado).\n\nIsso faz muitos clientes desistirem do contato por medo de vírus ou golpe, além de derrubar o posicionamento de vocês nas buscas.\n\nIdentifiquei exatamente onde está a falha. Podemos marcar uma rápida reunião, sem compromisso, para eu te explicar como consertar isso e voltar a transmitir credibilidade máxima para os clientes?`;
      }
    }
  };

  const handleCopyMessage = (lead: Lead) => {
    const msg = generatePASCopy(lead);
    navigator.clipboard.writeText(msg);
  };

  const handleCopyAllMessages = () => {
    if (leads.length === 0) return;
    const allMsgs = leads.map(l => `=== ${l.name} (${l.phone}) ===\n${generatePASCopy(l)}\n`).join('\n');
    navigator.clipboard.writeText(allMsgs);
    alert(t.copyAll + " OK!");
  };

  const handleOpenWhatsApp = (lead: Lead) => {
    if (lead.phone === 'Não informado') {
      alert("No phone / Sem telefone");
      return;
    }
    const msg = generatePASCopy(lead);
    const num = lead.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${country==='br'?'55':''}${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ["Nome da Empresa", "Segmento", "Telefone", "E-mail", "Endereço", "Status do Site", "URL Atual", "Avaliação Google", "Score"];
    const csvContent = [
      headers.join(";"),
      ...leads.map(l => {
        return [
          `"${l.name}"`, 
          `"${l.category}"`, 
          `"${l.phone}"`, 
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
    link.download = "leads_mass_export.csv";
    link.click();
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-20 hidden md:flex flex-col items-center py-8 gap-8 backdrop-blur-xl bg-black/40 border-r border-white/10 z-10 sticky top-0 h-screen transition-all hover:w-64 group">
        <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/50 flex items-center justify-center flex-shrink-0">
          <Globe className="text-primary w-5 h-5" />
        </div>
        <nav className="flex flex-col gap-4 w-full px-4 mt-8">
          {[
            { icon: LayoutDashboard, label: "Dashboard" },
            { icon: Search, label: "Prospecção" },
            { icon: Settings, label: "Configurações" }
          ].map((item, i) => (
            <button key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all w-full text-muted-foreground hover:text-white group/btn">
              <item.icon className="w-5 h-5 flex-shrink-0 group-hover/btn:scale-110 transition-transform" />
              <span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300 font-mono text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <header className="space-y-2">
            <h1 className="font-serif italic font-light text-4xl md:text-5xl text-white tracking-wide">
              Lead Generation <span className="text-primary not-italic font-sans font-semibold tracking-tighter">Pro</span>
            </h1>
            <p className="font-mono text-muted-foreground">{t.title}</p>
          </header>

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="font-serif italic font-light text-2xl">Grid Search</CardTitle>
              <CardDescription className="font-mono text-xs">A busca cobre áreas inteiras baseadas no país escolhido, sem limite de raio fixo.</CardDescription>
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
                        />
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
                        <SelectItem value="20">20 Leads</SelectItem>
                        <SelectItem value="50">50 Leads</SelectItem>
                        <SelectItem value="100">100 Leads</SelectItem>
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
                <CardDescription className="font-mono text-xs">{leads.length} leads. {statusMessage}</CardDescription>
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
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">Nenhuma oportunidade encontrada.</TableCell>
                    </TableRow>
                  ) : (
                    leads.map((lead) => (
                      <TableRow key={lead.id} className="border-white/10 hover:bg-white/5 transition-colors group">
                        <TableCell>
                          <div className="font-medium text-white group-hover:text-primary transition-colors">{lead.name}</div>
                          <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-1 mb-1">{lead.category}</div>
                          <div className="text-sm font-mono text-white mt-2">{lead.phone}</div>
                          <div className="text-xs text-muted-foreground flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1 opacity-70 flex-shrink-0" />
                            <span className="truncate max-w-[200px] block" title={lead.address}>{lead.address}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={lead.email}>
                              📧 {lead.email}
                            </div>
                            {lead.website ? (
                              <div className="text-xs text-blue-400 truncate max-w-[180px] hover:underline cursor-pointer" onClick={() => window.open(lead.website?.startsWith('http') ? lead.website : `http://${lead.website}`, '_blank')}>
                                🌐 {lead.website}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">🌐 Nenhum domínio detectado</div>
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
                              className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all text-xs h-8"
                              onClick={() => { handleCopyMessage(lead); alert("Copiado!"); }}
                            >
                              <Copy className="w-3 h-3 mr-2" />
                              Copiar
                            </Button>
                            <Button 
                              variant="default" size="sm" 
                              className="bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 hover:bg-[#25D366] hover:text-white transition-all shadow-[0_0_10px_rgba(37,211,102,0.1)] hover:shadow-[0_0_20px_rgba(37,211,102,0.4)] text-xs h-8"
                              onClick={() => handleOpenWhatsApp(lead)}
                            >
                              <MessageCircle className="w-3 h-3 mr-2" />
                              WhatsApp
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
