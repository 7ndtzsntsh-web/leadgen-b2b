@AGENTS.md

# LeadHunter B2B — regras para o Claude

Ferramenta interna da Vanguard Web Studio para achar empresas que precisam de site.
No ar em https://leadgen-b2b-fqbz.vercel.app (push na `main` publica sozinho pela Vercel).

## Como trabalhar

- Autorizado a alterar e publicar sem pedir, **desde que**: revise e teste tudo antes; trabalhe em
  branch + Pull Request (o merge na `main` é a publicação); anote qual versão estava no ar antes;
  se algo quebrar, reverta na hora e conte com franqueza o que aconteceu.
- Consertar o que foi pedido. Funcionalidade nova que ninguém pediu: sugerir primeiro.
- Nunca digitar senha, chave de API ou token. Quem põe é o dono.
- Responder em português do Brasil, simples e direto. O dono costuma ler pelo celular.

## Comandos

```bash
npm install
npx tsc --noEmit && npm run lint && npm run build   # tudo tem que passar antes de publicar
npm run security:scan                               # Observatório contra o servidor local
node_modules/.bin/jiti arquivo.ts                   # teste de lógica (não há test runner; use imports relativos, não "@/")
```

## Regras do código

- Segurança: A+ 150/150 no MDN HTTP Observatory. CSP com nonce em `src/proxy.ts` (`default-src 'none'`).
  Não afrouxar a CSP para "fazer funcionar". Nota A+ não prova que o site funciona: testar no navegador.
- Manter `runtime = 'edge'` na rota de busca (trocar pode quebrar o deploy).
- O validador de sites bloqueia SSRF (`isPublicHost`, redirecionamento manual). Não remover.
- A busca usa o OpenStreetMap (gratuito, 1 consulta por segundo) e por isso os leads saem PARCIAL:
  a fonte não informa se a empresa está funcionando. Não sugerir chave paga do Google; o dono decide
  quando ativar. Se ativar, o nome é `GOOGLE_MAPS_API_KEY`, **sem** `NEXT_PUBLIC_` (senão vaza no navegador).
- Cidade do lead: conferir pelos campos separados do OpenStreetMap (`place`), nunca pelo texto do
  endereço, que começa com o nome da empresa ("Panificadora São José" fica em Belmonte).
- Celular: alvos de toque com 44px (`h-11 md:h-8`); campos com letra de 16px (o iPhone não dá zoom).
- PRs do Dependabot com salto grande de versão: decisão do dono.

## Sessão na nuvem (aberta pelo celular, com o PC do dono desligado)

- Dá para: editar, rodar tipos/lint/build, abrir o PR, esperar o check da Vercel no PR e mesclar.
  Se não conseguir mesclar, peça ao dono para tocar em "Merge" no PR (dá pelo app do GitHub).
- Se não der para conferir o site no ar, diga isso claramente em vez de supor que funcionou.
- O que não der para fazer ou conferir na nuvem: deixe anotado no GitHub (issue, ou PR em rascunho)
  com título começando por **"Fazer no PC:"**, para não se perder.
