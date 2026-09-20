# LeadGen B2B Pro

Uma plataforma web avançada focada em Lead Generation para prospecção ativa de venda de novos sites, redesign e serviços digitais B2B.

## 🚀 Objetivo
A ferramenta identifica empresas que são oportunidades claras para venda de serviços web, filtrando por:
- Negócios sem website.
- Sites inseguros (sem HTTPS).
- Negócios locais com presença digital precária (baixo rating, sem site, etc.).

## 🛠️ Stack Tecnológica
- **Next.js 15 (App Router)**
- **TypeScript**
- **Tailwind CSS v4** + Design System *High-End Editorial Glassmorphism*
- **shadcn/ui** (Radix UI)
- **Lucide Icons**

## 📦 Como Rodar Localmente

1. Clone o repositório ou baixe o código.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` na raiz com base no `.env.example`.
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. Acesse `http://localhost:3000`.

## ⚙️ Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e preencha as chaves:
```bash
cp .env.example .env
```
_(Consulte o arquivo `.env.example` para ver quais variáveis são necessárias caso expanda a API)._

## 🔎 Como a busca funciona
- **Nichos:** o termo digitado é expandido só quando é o nome principal de um nicho do dicionário (`src/lib/semanticDictionary.ts`, ignora acentos e plural). Termos específicos (ex.: "restaurante japonês") são pesquisados exatamente como digitados.
- **Cidades:** a fila começa na cidade pedida e, se a meta não for atingida, expande para as cidades vizinhas da mesma região do IBGE, das mais populosas para as menos (`src/lib/locations.ts`). A base de cidades é gerada por `node scripts/build-br-cities.mjs`.
- **Verificação do site:** uma única passada (HTTPS e HTTP em paralelo) classifica como `SSL Válido`, `HTTP Inseguro`, `Erro 404/Inativo`, `Só Rede Social` ou `Sem Site`. Respostas 401/403/405 (site que bloqueia robôs) contam como site no ar.
- **Filtro "Sem site":** inclui empresas sem site, só com Instagram/Facebook/link na bio e com site fora do ar.
- **Pontuação (`src/lib/leadRules.ts`):** prioriza quem não tem site funcionando, é bem avaliado (tem clientes e verba), tem celular (WhatsApp) e e-mail. Empresas fechadas e redes/franquias (mesmo nome 3+ vezes) são descartadas.

## ✅ Verificação dos dados (selo VERIFICADO / PARCIAL)
O selo de cada lead é calculado no servidor (`src/lib/verification.ts`) a partir de checagens reais, e só é **VERIFICADO** se todas se confirmam; qualquer item não confirmado vira **PARCIAL** e o motivo aparece ao tocar em "o que foi checado".
- **Telefone:** formato, DDD do estado pesquisado, números falsos e 0800.
- **WhatsApp:** só conta como confirmado quando o número foi achado no site/perfil da própria empresa. Não é possível saber se um celular tem WhatsApp sem a API dele.
- **E-mail:** extraído do site e o domínio precisa ter servidor de e-mail (registro MX, via DNS-sobre-HTTPS). Domínio inexistente ou que não recebe e-mail é descartado. Não prova que a caixa postal existe.
- **Site:** requisição real (HTTPS e HTTP), incluindo redirecionamentos; perfis de rede social e diretórios (TripAdvisor, GuiaMais...) não contam como site da empresa.
- **Empresa ativa:** status `OPERATIONAL` do Google. Sem a chave do Google (modo OpenStreetMap) fica não confirmado, então todos os leads saem PARCIAL.
- **Cidade:** o endereço precisa estar numa das cidades pesquisadas; endereço de outro estado é descartado e a cidade real do endereço é a usada no texto de abordagem.

## 🔒 Segurança (padrão MDN HTTP Observatory, meta A+)
Todo deploy deve passar nos 12 testes do [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory).
- **CSP estrita com nonce** em `src/proxy.ts` (sem `unsafe-inline`/`unsafe-eval` em produção, `object-src 'none'`). Outros headers em `next.config.ts` (HSTS com preload, `X-Frame-Options`, `nosniff`, COOP/CORP, `Referrer-Policy`).
- **SRI:** `experimental.sri` (sha384) coloca `integrity` nos scripts do site; o navegador recusa qualquer arquivo alterado no caminho.
- **Antes de publicar:** `npm run build && npm start` e, em outro terminal, `npm run security:scan`. Ele roda o scanner oficial do MDN no servidor local e falha (código 1) se algum teste reprovar.
- **Depois de publicar:** confirme o domínio real na página do Observatório.
- O servidor só consulta sites públicos (bloqueio de SSRF em `src/lib/domainValidator.ts`, inclusive em redirecionamentos).
- **Proteção das APIs (`src/lib/apiGuard.ts`):** em produção `/api/search-leads` e `/api/cities` só aceitam chamadas feitas pelo próprio site (`Sec-Fetch-Site`), com limite de 20 buscas por 10 min e 2 simultâneas por visitante. É proteção "melhor esforço" (memória da instância).
- **Violações de CSP** enviadas pelos navegadores são registradas nos logs da Vercel (`[csp-violation]`, rota `/api/csp-report`).
- Headers: sem `X-Powered-By`, `Permissions-Policy` fechada, CORP `same-origin`. `public/.well-known/security.txt` indica como reportar vulnerabilidades e `.github/dependabot.yml` abre PRs de atualização de dependências.
- ⚠️ `/api/search-leads` gasta a cota paga do Google Places. Restrinja a chave à API Places (New) e defina cota diária e alerta de orçamento no Google Cloud: é o limite firme, independente do código.

## 🚀 Deploy e Automação Git

Para subir este projeto para o GitHub via terminal:

1. Inicie o repositório local (já iniciado se você clonou):
   ```bash
   git init
   git add .
   git commit -m "feat: commit inicial LeadGen B2B"
   ```
2. Crie o repositório no GitHub pelo terminal (se possuir o GitHub CLI):
   ```bash
   gh repo create leadgen-b2b --public --source=. --remote=origin
   git push -u origin main
   ```
   *Ou manualmente pelo site do GitHub e adicione o remote:*
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```

### Deploy na Vercel (1 clique)
Como este projeto utiliza o Next.js, o deploy na Vercel é nativo e otimizado.
Basta conectar o seu repositório do GitHub na plataforma Vercel, e as configurações de Build serão detectadas automaticamente (`npm run build`). Lembre-se de configurar as mesmas variáveis de ambiente do `.env.example` na aba Settings > Environment Variables da Vercel.
