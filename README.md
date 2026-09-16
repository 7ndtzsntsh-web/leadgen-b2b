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
