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
- Busca no OpenStreetMap presa à caixa do município (`cityBox`) e também pelo TIPO de lugar em inglês
  (`placeTypeTerms`: "bakery"), com páginas extras. A data da última atualização vem da API do OSM (`lastEdits`).

## Qualidade dos dados (o dono reclamou de número errado, "WPP" sem WhatsApp, site não detectado e empresa fechada)

- Telefone (`cleanPhone`): melhor não mostrar do que mostrar errado. Recusa tamanho/começo impossível (ramal
  colado), põe o 9 no celular antigo, lê `mobile`/`contact:mobile` e separa vários números no mesmo campo.
- WhatsApp: `lead.whatsapp` é SÓ o confirmado (link no site da empresa ou campo de WhatsApp do cadastro).
  Celular sem confirmação aparece como "CEL" + "Testar WPP". Nunca rotular celular como "WPP".
- O site da própria empresa é a fonte mais atual: confirma o telefone do cadastro ou o substitui. O leitor
  lê até 800 KB, porque o contato costuma ficar no rodapé depois de muito CSS.
- WhatsApp do site: vale o mais repetido; o que vem depois de "desenvolvido por" é da agência e é ignorado.
- Busca de site pelo nome (`siteFinder`): exige nome + telefone, ou nome composto + cidade. Não afrouxar:
  num teste, 78 de 96 nomes batiam com domínio de OUTRA empresa.
- Cadastro sem atualização há 8+ anos e sem site no ar: descartado. Há 5+ anos: aparece com "Dados de AAAA".
- Toda frase de checagem tem que ser verdadeira: "confirmado" só quando houve confirmação de verdade.
- Checagem `info: true` (ex.: WhatsApp de celular, que não dá para confirmar de graça) aparece em cinza e não
  derruba o selo VERIFICADO. Não usar `info` para esconder o que DÁ para checar.
- **Lead sem telefone nem WhatsApp não entra** (só e-mail não serve: o dono reclamou de empresas "sem número").
  O e-mail ainda é usado no caminho: o domínio dele pode levar ao site, e o site ao telefone.
- E-mail do lead (`fixEmailTypo` e `isAccountantEmail` em `src/lib/emailCheck.ts`): provedor digitado errado vira o certo
  ("gamil.com" -> gmail.com; eram milhares, e o e-mail iria para o domínio de outra pessoa); e-mail de contador
  ("contabilidadexyz@", "joao.contador@") sai, a não ser que a empresa seja de contabilidade. Depois, o MX é conferido.
- **Idade da empresa não dá ponto.** Antes a empresa nova ganhava +10 e a Receita vinha "da mais nova para a mais
  velha": a lista virava só empresa recém-aberta. Agora a ordem da Receita é por faixa (`cnpjTier`: celular com
  telefone recente primeiro, até 6 anos), misturada de um jeito fixo dentro da faixa (`mixKey`), e o telefone
  confirmado vale +5 na nota.

## Cadastro de CNPJ da Receita Federal (fonte principal no Brasil: 27 estados, 5.571 cidades)

- Dados abertos da Receita em `public/cnpj` (formato em `scripts/cnpj/output.mjs`). Estados ativos: os de
  `public/cnpj/index.json`. Cidade com até 6.000 empresas é um arquivo (`<uf>/<cidade>.json`); maior vira uma pasta
  com um arquivo por ramo (`<uf>/<cidade>/<cnae>.json`), para a busca baixar só o ramo pedido (São Paulo inteira
  seria dezenas de MB a cada busca). `<uf>/index.json` diz o que existe. Na busca, vêm ANTES do mapa; o mesmo
  negócio no mapa é repetição e fica de fora.
- Entram só: CNPJ ATIVO, dos nichos de `src/lib/data/nicheCnaes.json` (códigos conferidos na tabela oficial),
  com nome fantasia, com telefone/e-mail próprio. Telefone ou e-mail usado por 3+ empresas = contador: sai.
  Sócios não são baixados.
- Atualizar todo mês (a Receita publica mensalmente; ~5,4 GB, uns 25 min de download). O arquivo da Receita já é
  do Brasil todo; sem UF, os comandos fazem os 27 estados (ou só os indicados: `-- SC PR`):
  ```bash
  npm run cnpj:baixar                # baixa o mês mais recente para .cache/ (fora do git)
  npm run cnpj:mapa                  # sites/redes do OpenStreetMap; estado que falhar: rodar de novo
  npm run cnpj:gerar -- AAAA-MM      # separa por estado e processa um de cada vez (até ~2 GB de memória)
  ```
- Nome de cidade diferente na Receita e no IBGE ("MOJI MIRIM", nome antigo): o gerador casa sozinho quando dá e
  lista no fim os que não casou. Esses vão em `CITY_ALIASES` (`scripts/cnpj/build.mjs`), senão a busca não acha.
- A Receita não tem site: o `cnpj:mapa` junta o site/rede do mapa pelo telefone (ou nome único). Sem ele,
  empresa com site aparece "sem site" (eram 90 casos só em Florianópolis).
- Site pelo e-mail da empresa (`siteFromEmail`): no ar, basta UMA palavra do nome ou o telefone; quebrado ou
  estacionado vira "fora do ar" só se o domínio tiver uma palavra do nome (e-mail de contador não conta).
- Mesmo nome fantasia com outro CNPJ (matriz/filial) aparece uma vez só.
  Depois: conferir o resumo (empresas, cidades, tamanho, cidades sem par), testar uma busca e publicar por PR.
- Telefone da Receita conta como confirmado se a empresa tem até 6 anos; mais antiga aparece com aviso.
  "CNPJ ativo" confirma que a empresa existe no papel (pode estar parada: por isso o texto diz "CNPJ ativo").
- Nicho novo: acrescentar em `nicheCnaes.json` conferindo o código na tabela `Cnaes.zip` e rodar o gerar.
- Celular: alvos de toque com 44px (`h-11 md:h-8`); campos com letra de 16px (o iPhone não dá zoom).
- PRs do Dependabot com salto grande de versão: decisão do dono.

## EUA: Overture Maps (fonte principal nos EUA)

- Nos EUA não existe cadastro público com telefone como o da Receita. A fonte é o **Overture Maps** (base aberta de
  empresas com dados de Meta, Microsoft, Amazon e outras; licença CDLA-Permissive-2.0), em `public/us`, no mesmo
  formato de `public/cnpj` (ramo = categoria do Overture). Estados ativos: os de `public/us/index.json`.
- Entram só: abertas, confiança de existir >= 60%, **sem marca** (rede/franquia), com telefone válido da América do
  Norte (`cleanPhone` "us": 10 dígitos, DDD válido, sem 800/888...) e **sem site próprio** (nenhum, ou só rede
  social/diretório: Yelp, Facebook, DoorDash, business.site...). Nos EUA ~75% já têm site: por isso só os sem site.
  Telefone usado por 3+ empresas com nomes diferentes (central/agência) sai. O e-mail também, e o de plataforma,
  entidade ou jornal (BBB, Facebook, Patch, U-Haul: `companyEmail`), porque nos EUA a abordagem é por e-mail.
- Nicho -> categorias do Overture: `NICHES` em `scripts/us/build.mjs` (grava `src/lib/data/nicheOverture.json`).
  A busca aceita o nicho em português ou a categoria em inglês ("barber", "nail salon").
- Cidades (autocompletar "Miami - FL" e vizinhas num raio de 60 km): `src/lib/data/usCities.json`, gerado junto.
  "St. Louis", "St Louis" e "Saint Louis" são a mesma cidade (`usCityKey` / `cityKey`: Saint/Fort/Mount viram St/Ft/Mt,
  sem ponto nem apóstrofo). Antes eram arquivos separados e a busca por uma não via as empresas da outra.
- Verificação: telefone "da ficha do Overture, atualizada em MM/AAAA" conta como confirmado se a ficha tem até 2
  anos; "aberta" conta se a confiança for >= 80%.
- **Nos EUA não há WhatsApp: o botão de mensagem é "E-mail"** (abre o app de e-mail com assunto e texto em inglês,
  `buildEmailSubject`/`buildEmailBody`), e "Ligar" continua. Não há como saber se o número é celular: sem selo CEL/FIXO.
  Por isso, entre as fichas com confiança >= 80%, vêm primeiro as que têm e-mail (~34% têm). Os botões usam o país
  da BUSCA (`searched`), não o selecionado depois na tela (senão o DDI mudava).
- Atualizar todo mês (o Overture publica uma versão por mês; o comando acha a mais recente sozinho):
  ```bash
  npm run us:gerar                   # ~15 min na 1ª vez (baixa ~1,5 GB para .cache/overture); depois ~2 min
  ```
  O DuckDB (lê os arquivos do Overture) é instalado pelo próprio comando e NÃO vai para o package.json: senão a
  Vercel baixaria o binário dele em toda publicação.

## Sessão na nuvem (aberta pelo celular, com o PC do dono desligado)

- Dá para: editar, rodar tipos/lint/build, abrir o PR, esperar o check da Vercel no PR e mesclar.
  Se não conseguir mesclar, peça ao dono para tocar em "Merge" no PR (dá pelo app do GitHub).
- Se não der para conferir o site no ar, diga isso claramente em vez de supor que funcionou.
- O que não der para fazer ou conferir na nuvem: deixe anotado no GitHub (issue, ou PR em rascunho)
  com título começando por **"Fazer no PC:"**, para não se perder.
