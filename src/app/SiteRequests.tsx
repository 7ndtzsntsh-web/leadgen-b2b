"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBid, SOURCE_ORIGIN, type RequestKind, type SiteRequest } from "@/lib/siteRequests";

interface Feed {
  fetchedAt: number;
  requests: SiteRequest[];
  scanned: number;
  failedPages: number;
}

const KINDS: RequestKind[] = ["Site", "Landing page", "Loja virtual", "Ajuste em site"];
const HOUR = 3600_000;
/** Pedido novo e com poucas propostas: a melhor chance (com 100 propostas o cliente nem lê as últimas). */
const HOT_HOURS = 12;
const HOT_PROPOSALS = 30;

// Pedidos em que o usuário já mandou proposta: ficam marcados (no aparelho).
const SENT_KEY = "leadhunter.pedidos.v1";
let sentSnapshot: Record<string, number> | null = null;
const sentListeners = new Set<() => void>();
function readSent(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
const EMPTY: Record<string, number> = {};
const getSent = () => (sentSnapshot ??= readSent());
const subscribeSent = (onChange: () => void) => {
  sentListeners.add(onChange);
  return () => sentListeners.delete(onChange);
};
function toggleSent(id: string) {
  const next = { ...getSent() };
  if (next[id]) delete next[id];
  else next[id] = Date.now();
  // Guarda só os últimos 500 (os pedidos fecham em ~30 dias).
  sentSnapshot = Object.fromEntries(Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, 500));
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify(sentSnapshot));
  } catch {
    // bloqueado: vale até fechar a página
  }
  sentListeners.forEach((l) => l());
}

const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
};

function ago(ms: number, now: number): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** Só links do próprio 99Freelas viram link (o endereço vem de página de terceiro). */
const safeUrl = (url: string) => (url.startsWith(`${SOURCE_ORIGIN}/project/`) ? url : undefined);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const FEED_ERROR = "Não foi possível carregar os pedidos.";

async function fetchFeed(signal?: AbortSignal): Promise<Feed> {
  const res = await fetch("/api/pedidos", { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !Array.isArray(body.requests)) throw new Error(body?.error ?? FEED_ERROR);
  return body as Feed;
}

function RequestCard({ r, now, sent }: { r: SiteRequest; now: number; sent: boolean }) {
  const [copied, setCopied] = useState(false);
  const hot = now - r.publishedAt <= HOT_HOURS * HOUR && r.proposals < HOT_PROPOSALS;
  const url = safeUrl(r.url);
  const copy = async () => {
    if (await copyText(buildBid(r))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${sent ? "border-white/5 bg-white/[0.02] opacity-60" : hot ? "border-green-500/40 bg-green-500/5" : "border-white/10 bg-white/5"}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] uppercase">{r.kind}</Badge>
          {hot && <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-400 text-[10px] uppercase">Novo, poucas propostas</Badge>}
          {sent && <Badge variant="outline" className="border-white/20 text-gray-300 text-[10px] uppercase">✓ Proposta enviada</Badge>}
        </div>
        <div className="mt-2 font-medium text-white text-base md:text-lg leading-snug">{r.title}</div>
        <div className="mt-1 text-xs text-muted-foreground font-mono">
          {ago(r.publishedAt, now)} · {r.proposals} {r.proposals === 1 ? "proposta" : "propostas"} · {r.level || r.area}
          {" · "}
          {r.clientReviews > 0 && r.clientScore !== undefined ? `cliente ★ ${r.clientScore.toFixed(1)} (${r.clientReviews} avaliações)` : "cliente sem avaliações"}
        </div>
        {r.exclusive && (
          <div className="mt-1 text-[11px] text-amber-300">Exclusivo: nas primeiras 24 h só quem é Premium no 99Freelas manda proposta.</div>
        )}
      </div>

      <details className="text-sm text-gray-300">
        <summary className="cursor-pointer select-none text-muted-foreground py-1">Ler o pedido</summary>
        <p className="mt-2 whitespace-pre-line leading-relaxed">{r.description}</p>
      </details>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground text-sm font-medium h-11 md:h-9 px-3"
          >
            <ExternalLink className="w-4 h-4" /> Abrir no 99Freelas
          </a>
        )}
        <Button variant="outline" className="bg-white/5 border-white/10 h-11 md:h-9" onClick={copy}>
          {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} {copied ? "Copiada" : "Copiar proposta"}
        </Button>
        <Button variant="outline" className="bg-white/5 border-white/10 h-11 md:h-9" onClick={() => toggleSent(r.id)}>
          {sent ? "Desmarcar" : "Já mandei proposta"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Pedidos de site: gente procurando AGORA quem faça um site (99Freelas). Os mais novos primeiro; os novos com poucas
 * propostas ficam em verde, que é onde dá para ganhar.
 */
export function SiteRequestsPanel() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<RequestKind | "">("");
  const now = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
  const sent = useSyncExternalStore(subscribeSent, getSent, () => EMPTY);

  const load = useCallback((signal?: AbortSignal) => {
    fetchFeed(signal)
      .then((f) => { setFeed(f); setError(""); })
      .catch((e: Error) => { if (e.name !== "AbortError") setError(e.message || FEED_ERROR); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const requests = (feed?.requests ?? []).filter((r) => !kind || r.kind === kind);
  const hotCount = (feed?.requests ?? []).filter((r) => now - r.publishedAt <= HOT_HOURS * HOUR && r.proposals < HOT_PROPOSALS && !sent[r.id]).length;

  return (
    <Card className="bg-black/60 md:bg-black/40 md:backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
      <CardHeader className="border-b border-white/10 bg-white/5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-serif italic font-light text-2xl">Pedidos de site</CardTitle>
          <Button variant="outline" size="sm" className="bg-white/5 border-white/10 h-11 md:h-8" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        <CardDescription className="text-sm leading-snug">
          Gente procurando <b className="text-white">agora</b> quem faça site, no 99Freelas. A proposta é feita lá: a plataforma não deixa
          passar telefone nem e-mail (pode suspender a conta). Vá nos <span className="text-green-400">verdes</span>: pedido novo, com poucas propostas.
        </CardDescription>
        {feed && (
          <p className="font-mono text-xs text-muted-foreground">
            {feed.requests.length} pedidos de site entre os {feed.scanned} projetos mais recentes · {hotCount} {hotCount === 1 ? "novo" : "novos"} com poucas propostas
            {now > 0 && ` · atualizado ${ago(feed.fetchedAt, now)}`}
            {feed.failedPages > 0 && " · parte da lista não carregou"}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["", ...KINDS] as (RequestKind | "")[]).map((k) => (
            <button
              key={k || "todos"}
              type="button"
              onClick={() => setKind(k)}
              className={`shrink-0 rounded-full border px-3 h-11 md:h-7 text-sm md:text-xs ${kind === k ? "border-primary bg-primary/20 text-white" : "border-white/15 bg-white/5 text-gray-300"}`}
            >
              {k || "Todos"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 flex flex-col gap-4">
        {loading && !feed && <div className="py-10 text-center font-mono text-sm text-muted-foreground">Lendo os pedidos...</div>}
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}
        {feed && requests.length === 0 && <div className="py-10 text-center font-mono text-sm text-muted-foreground">Nenhum pedido desse tipo agora.</div>}
        {requests.map((r) => <RequestCard key={r.id} r={r} now={now} sent={!!sent[r.id]} />)}

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300 space-y-2 leading-snug">
          <div className="font-medium text-white">Outros lugares onde pedem site (abrem no navegador)</div>
          <p>
            <a className="text-blue-400 underline" href="https://www.workana.com/pt/jobs?language=pt&query=site" target="_blank" rel="noopener noreferrer">Workana</a>
            {": o maior da América Latina. Tem bloqueio contra robô, então não dá para trazer para cá: crie o seu perfil lá e confira os projetos novos todo dia."}
          </p>
          <p>
            <a className="text-blue-400 underline" href="https://www.getninjas.com.br/anuncie/design-e-tecnologia/web-design" target="_blank" rel="noopener noreferrer">GetNinjas</a>
            {": pedidos de empresas e pessoas da sua região, com telefone. Ver o pedido é grátis; o contato do cliente é pago (moedas)."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
