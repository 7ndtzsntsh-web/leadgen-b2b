"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, Globe, Star, Download, Copy, MessageCircle, Settings, LayoutDashboard } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lead } from "./api/leads/route";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [category, setCategory] = useState("");
  const [noSite, setNoSite] = useState(false);
  const [insecure, setInsecure] = useState(false);
  const [radius, setRadius] = useState([15]);

  async function fetchLeads() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.append("category", category);
      if (noSite) params.append("noSite", "true");
      if (insecure) params.append("insecure", "true");

      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      setLeads(data.data);
    } catch (error) {
      console.error("Erro ao buscar leads:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, noSite, insecure]);

  const getSiteStatusColor = (status: string) => {
    switch (status) {
      case 'Sem Site': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'HTTP Inseguro': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
      case 'Erro 404/Inativo': return 'bg-muted/50 text-muted-foreground border-muted/50';
      case 'SSL Válido': return 'bg-green-500/20 text-green-500 border-green-500/30';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const generateWhatsAppLink = (lead: Lead) => {
    let message = `Olá, equipe da ${lead.name}. Tudo bem?\nEncontrei vocês aqui no Google e vi que `;
    if (lead.siteStatus === 'Sem Site') {
      message += `ainda não possuem um site profissional.`;
    } else if (lead.siteStatus === 'HTTP Inseguro') {
      message += `o site de vocês (${lead.website}) está marcando como 'Não Seguro' para os visitantes.`;
    } else {
      message += `a presença digital de vocês tem grande potencial de melhoria.`;
    }
    return `https://wa.me/${lead.phone}?text=${encodeURIComponent(message)}`;
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ["Nome", "Categoria", "Telefone", "Email", "Status do Site", "Endereço", "Score"];
    const csvContent = [
      headers.join(";"),
      ...leads.map(l => [
        `"${l.name}"`, 
        `"${l.category}"`, 
        `"${l.phone}"`, 
        `"${l.email}"`, 
        `"${l.siteStatus}"`, 
        `"${l.address}"`, 
        l.score
      ].join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads_export.csv";
    link.click();
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar/Dock */}
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

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <header className="space-y-2">
            <h1 className="font-serif italic font-light text-4xl md:text-5xl text-white tracking-wide">
              Lead Generation <span className="text-primary not-italic font-sans font-semibold tracking-tighter">Pro</span>
            </h1>
            <p className="font-mono text-muted-foreground">Motor de prospecção inteligente de negócios locais.</p>
          </header>

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <CardTitle className="font-serif italic font-light text-2xl">Filtros de Busca</CardTitle>
              <CardDescription className="font-mono text-xs">Ajuste os parâmetros para encontrar as melhores oportunidades</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Nicho / Segmento</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Ex: Odontologia..." 
                        className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-primary/50"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Localização</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select defaultValue="br">
                        <SelectTrigger className="bg-black/20 border-white/10">
                          <SelectValue placeholder="País" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="br">Brasil</SelectItem>
                          <SelectItem value="us">EUA</SelectItem>
                          <SelectItem value="pt">Portugal</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Cidade" className="bg-black/20 border-white/10" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Raio de Busca ({radius[0]} km)</label>
                    <div className="pt-4">
                      <Slider 
                        defaultValue={[15]} 
                        max={50} min={5} step={5}
                        value={radius}
                        onValueChange={(val) => setRadius(val as number[])}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="no-site" checked={noSite} onCheckedChange={(c) => setNoSite(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                      <label htmlFor="no-site" className="text-sm font-medium leading-none text-gray-300">Apenas sem website</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="insecure" checked={insecure} onCheckedChange={(c) => setInsecure(c as boolean)} className="border-white/20 data-[state=checked]:bg-primary" />
                      <label htmlFor="insecure" className="text-sm font-medium leading-none text-gray-300">Apenas sites Inseguros/HTTP</label>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col justify-end space-y-3">
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={handleExportCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar .CSV
                    </Button>
                    <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white" onClick={() => navigator.clipboard.writeText(leads.map(l => l.email).join(","))}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all">
                    Buscar Oportunidades
                  </Button>
                </div>

              </div>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-xl bg-black/40 border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 bg-white/5">
              <div>
                <CardTitle className="font-serif italic font-light text-2xl">Resultados</CardTitle>
                <CardDescription className="font-mono text-xs">{leads.length} leads encontrados</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Empresa</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Contato</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Status / Digital</TableHead>
                    <TableHead className="font-mono text-xs uppercase text-muted-foreground">Score</TableHead>
                    <TableHead className="text-right font-mono text-xs uppercase text-muted-foreground">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Buscando leads...</TableCell>
                    </TableRow>
                  ) : leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum lead encontrado com estes filtros.</TableCell>
                    </TableRow>
                  ) : (
                    leads.map((lead) => (
                      <TableRow key={lead.id} className="border-white/10 hover:bg-white/5 transition-colors group">
                        <TableCell>
                          <div className="font-medium text-white group-hover:text-primary transition-colors">{lead.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1 opacity-70" />
                            <span className="truncate max-w-[200px] block" title={lead.address}>{lead.address.split('-')[0]}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-mono">{lead.phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4')}</div>
                          <div className="text-xs text-muted-foreground">{lead.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-2">
                            <Badge variant="outline" className={`${getSiteStatusColor(lead.siteStatus)} font-mono text-[10px] uppercase`}>
                              {lead.siteStatus}
                            </Badge>
                            {lead.rating && (
                              <div className="flex items-center text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                {lead.rating} <span className="text-muted-foreground ml-1">({lead.reviewsCount})</span>
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
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 hover:bg-[#25D366] hover:text-white transition-all shadow-[0_0_15px_rgba(37,211,102,0.1)] hover:shadow-[0_0_20px_rgba(37,211,102,0.4)]"
                            onClick={() => window.open(generateWhatsAppLink(lead), '_blank')}
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Abordar
                          </Button>
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
