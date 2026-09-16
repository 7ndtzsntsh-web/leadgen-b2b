"use client";

import { useState, useRef } from "react";
import { Search, MapPin, Globe, Star, Download, Copy, MessageCircle, Settings, LayoutDashboard, FileText, Play } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DomainStatus } from "@/lib/domainValidator";

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
  const [noSite, setNoSite] = useState(false);
  const [insecure, setInsecure] = useState(false);
  const [radius, setRadius] = useState([15]);

  const stopSearch = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
    setStatusMessage("Busca interrompida.");
  };

  const startSearch = () => {
    if (!category.trim()) {
      alert("Por favor, informe ao menos o Nicho/Segmento.");
      return;
    }
    
    // Reset state
    setLeads([]);
    setLoading(true);
    setHasSearched(true);
    setStatusMessage("Iniciando conexão com o motor de busca...");

    const params = new URLSearchParams();
    params.append("category", category);
    if (city.trim()) params.append("city", city);
    params.append("volume", volume);

    const sse = new EventSource(`/api/search-leads?${params.toString()}`);
    eventSourceRef.current = sse;

    sse.onmessage = (e) => {
      const parsed = JSON.parse(e.data);
      if (parsed.type === 'info') {
        setStatusMessage(parsed.message);
      } else if (parsed.type === 'lead') {
        const newLead = parsed.data as Lead;
        // Aplicar filtros de interface em tempo real
        if (noSite && newLead.siteStatus !== 'Sem Site') return;
        if (insecure && newLead.siteStatus !== 'HTTP Inseguro' && newLead.siteStatus !== 'Erro 404/Inativo') return;
        
        setLeads(prev => {
          // Evitar duplicação acidental na renderização
          if (prev.some(l => l.id === newLead.id)) return prev;
          const updated = [...prev, newLead];
          // Ordenar pelo Score
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
      setStatusMessage("Conexão encerrada ou falha no servidor.");
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
    
    if (lead.siteStatus === 'Sem Site' || lead.siteStatus === 'Erro 404/Inativo') {
      return `Olá, responsável da ${lead.name}! Tudo bem?\n\nEstava buscando por ${nicho} e percebi que vocês têm excelentes avaliações, mas ainda não possuem um site próprio e profissional operando.\n\nHoje, a maioria dos clientes que pesquisa pelo celular acaba fechando com a concorrência porque clicam no link oficial direto no Google. Vocês estão perdendo de receber contatos diários por causa disso.\n\nPodemos marcar uma rápida reunião, sem compromisso, para eu te mostrar como resolver isso e dominar as buscas na sua região?`;
    } else {
      return `Olá, responsável da ${lead.name}! Tudo bem?\n\nEncontrei vocês no Google e fui acessar o site, mas o navegador bloqueou alertando "Não Seguro" (sem certificado HTTPS atualizado).\n\nIsso faz muitos clientes desistirem do contato por medo de vírus ou golpe, além de derrubar o posicionamento de vocês nas buscas.\n\nIdentifiquei exatamente onde está a falha. Podemos marcar uma rápida reunião, sem compromisso, para eu te explicar como consertar isso e voltar a transmitir credibilidade máxima para os clientes?`;
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
    alert("Todas as abordagens foram copiadas!");
  };

  const handleOpenWhatsApp = (lead: Lead) => {
    if (lead.phone === 'Não informado') {
      alert("Este lead não possui telefone cadastrado.");
      return;
    }
    const msg = generatePASCopy(lead);
    const num = lead.phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ["Nome da Empresa", "Segmento", "Telefone / WhatsApp", "E-mail", "Endereço", "Status do Site", "URL Atual", "Avaliação Google", "Problema Identificado", "Score de Oportunidade"];
    const csvContent = [
      headers.join(";"),
      ...leads.map(l => {
        let problema = "";
        if (l.siteStatus === 'Sem Site') problema = "Não possui presença web estruturada.";
        else if (l.siteStatus === 'HTTP Inseguro') problema = "Falta certificado de segurança (Alerta Não Seguro).";
        else if (l.siteStatus === 'Erro 404/Inativo') problema = "Site fora do ar ou link quebrado.";
        else problema = "Necessidade de atualização visual/performance.";

        return [
          `"${l.name}"`, 
          `"${l.category}"`, 
          `"${l.phone}"`, 
          `"${l.email}"`, 
          `"${l.address}"`, 
          `"${l.siteStatus}"`,
          `"${l.website || ''}"`,
          l.rating,
          `"${problema}"`,
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
            <p className="font-mono text-muted-foreground">Motor de prospecção inteligente e contínua em larga escala.</p>
          </header>

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="font-serif italic font-light text-2xl">Mineração em Massa</CardTitle>
              <CardDescription className="font-mono text-xs">Busca semântica ampla. A cidade é opcional para buscas estaduais ou nacionais.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                <div className="space-y-4 col-span-1 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Nicho / Segmento *</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Ex: Padaria, Clínica, Advocacia" 
                          className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-primary/50"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Região / Cidade (Opcional)</label>
                      <Input 
                        placeholder="Ex: SP, Nordeste ou Brasil" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="bg-black/20 border-white/10" 
                        onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="no-site" checked={noSite} onCheckedChange={(c) => setNoSite(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="no-site" className="text-sm font-medium leading-none text-gray-300">Apenas S/ Site</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="insecure" checked={insecure} onCheckedChange={(c) => setInsecure(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                        <label htmlFor="insecure" className="text-sm font-medium leading-none text-gray-300">Apenas Inseguros</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Volume de Captura</label>
                    <Select value={volume} onValueChange={(val: string) => setVolume(val || "50")}>
                      <SelectTrigger className="bg-black/20 border-white/10">
                        <SelectValue placeholder="Volume" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20 Leads Rápidos</SelectItem>
                        <SelectItem value="50">50 Leads (Médio)</SelectItem>
                        <SelectItem value="100">100 Leads (Alto)</SelectItem>
                        <SelectItem value="200">Máximo Possível (200+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Raio ({radius[0]} km)</label>
                    <div className="pt-2">
                      <Slider 
                        defaultValue={[15]} max={100} min={5} step={5}
                        value={radius} onValueChange={(val) => setRadius(val as number[])}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col justify-end space-y-3">
                  {loading ? (
                    <Button variant="destructive" className="w-full h-12 shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all" onClick={stopSearch}>
                      Interromper Busca
                    </Button>
                  ) : (
                    <Button 
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all"
                      onClick={startSearch}
                    >
                      Disparar Mineração <Play className="w-4 h-4 ml-2" />
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
                  Resultados em Tempo Real
                  {loading && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span></span>}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{leads.length} leads qualificados capturados. {statusMessage}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={handleCopyAllMessages}>
                  <FileText className="w-4 h-4 mr-2" />
                  Disparar Fila (Copiar Tudo)
                </Button>
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={handleExportCSV}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[30%]">Empresa & Contato</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground w-[25%]">Presença Digital (E-mail/Site)</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Diagnóstico</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Score</TableHead>
                    <TableHead className="text-right font-mono text-xs uppercase text-muted-foreground">Abordagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!hasSearched ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">Preencha um Nicho (Ex: Clínica) e clique em Disparar Mineração.</TableCell>
                    </TableRow>
                  ) : leads.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-mono">Nenhuma oportunidade encontrada com esses critérios precisos.</TableCell>
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
