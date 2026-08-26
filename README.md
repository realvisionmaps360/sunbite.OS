# Sunbite.OS

Sistema interno de operacoes da Sunbite. Comecou como PDV offline (registrar a venda em
poucos segundos, sem internet) e cresceu para operacao, estoque, compras, financeiro,
locais, equipamentos e IA.

No ar: **https://sunbite-pdv.vercel.app**

Base: `prd-pdv-offline-v1` e `prd-sunbite-os-v2` · decisoes: `DEC-2026-001` (preco e
formato) e `DEC-2026-002` (cancelamento e painel).

**A regra que nao muda:** vender nunca depende de login, de internet nem de operacao
aberta. Todo o resto do sistema foi construido em volta disso.

## Regra de preco

| Item | Valor |
|---|---|
| Copo | CHF 7.50 |
| Cada topping | + CHF 0.50 |
| Copo com chantilly | CHF 8.00 |
| Copo com amendoa + coco | CHF 8.50 |

Fonte unica: [`src/config.ts`](src/config.ts). Mudou o preco, muda ali — e so ali.

## As telas

**Venda** — resumo no topo, copo e toppings no meio, finalizar embaixo. O copo
selecionado aparece em creme solido: e nele que o proximo topping cai.

**Conferir** — entre o pagamento e a comemoracao. Mostra valor, forma de pagamento,
quantos copos e quantos toppings. **A venda so e gravada no toque em Confirmar**:
voltar daqui devolve o pedido inteiro e nao deixa rastro no banco.

**Cardapio** — so leitura. O copo, os toppings e a conta pronta (puro, 1, 2 ou 3
toppings). Serve para consultar e para mostrar ao cliente que pergunta o preco. Todo
preco sai de [`src/config.ts`](src/config.ts) — nenhum numero digitado a mao ali.

**Vendas** — tres abas:

- *Hoje*: as vendas do dia, com total, copos e a divisao Dinheiro/TWINT. Cada venda
  pode ser cancelada.
- *Por dia*: quanto entrou em cada dia da temporada.
- *Resumo*: total da temporada, media por venda, copos por venda, melhor dia,
  canceladas e o ranking de toppings.

**Ajustes** — desde a V2 e o **modulo unico de configuracao**: preco, Cardapio,
Fornecedores, Sistema, conexao com o Supabase e a limpeza das vendas de hoje. Antes a
mesma coisa aparecia em "Ajustes", "Sistema" e "Precos" e nenhum dos tres era o dono.

## Home (V2)

Deixou de ser um menu de 14 ladrilhos e passou a responder *"o que eu preciso fazer
agora"*:

- estado da operacao no topo (`Operacao fechada` / `Operacao em andamento · Aarau`);
- uma acao principal grande: **Iniciar operacao**, ou **Continuar vendendo** se ja ha
  operacao aberta;
- o resumo do dia em 2×2: copos, faturamento, dinheiro e tempo;
- **✦ Sunbite IA** em destaque;
- seis modulos: Operacao, Vendas, Financeiro, Estoque, Locais, Equipamento;
- Ajustes discreto no fim.

**"Dinheiro" nao e o caixa.** E o que entrou em dinheiro hoje. O caixa de verdade
precisa do `cash_initial`, que a Etapa 6 fechou para quem nao esta logado — a conta
completa mora no Financeiro.

> ⚠️ [`HomeScreen.tsx`](src/components/HomeScreen.tsx) **nao importa** `../auth` nem
> `../supabase`, e e essa ausencia — nao um `if` — que mantem o bundle de entrada leve e
> o app abrindo offline. O resumo sai do IndexedDB (`allSales`) e o estado da operacao do
> cache local `sunbite.operation.open_view`. Se um dia alguem precisar de um dado que so
> vem do servidor, o caminho e **depositar no cache** de quem ja tem sessao (ver
> `cacheOpenOperationView` em [`src/operations.ts`](src/operations.ts)), nunca chamar o
> Supabase daqui.

## Navegacao

Cada tela tem seu botao na Home, e volta para la pelo **‹ Inicio** (ou pelo **×**, em
Vendas e Cardapio). O botao fisico de voltar do Android faz o mesmo caminho — ver
`goBack()` em [`src/App.tsx`](src/App.tsx).

Desde a V2 ha tambem uma **barra fixa embaixo** com quatro destinos: Inicio · Vender ·
Vendas · IA.

> ⚠️ **`Vender` esta na barra porque precisa estar.** A Home V2 nao tem mais ladrilho
> "Vender": a acao principal cobre isso, mas so leva a vender quando ha operacao aberta.
> Sem a barra, ficar sem operacao deixava a venda inalcancavel. Quem tirar `sale` de la
> tem que devolver o caminho na Home.

> ⚠️ **A barra some na venda, no pagamento e na conferencia** (`SEM_BARRA` em
> `App.tsx`). Durante o atendimento o dedo nao pode encostar em navegacao por acidente —
> foi exatamente por isso que os gestos laterais sairam.

Telas administrativas usam posicionamento fixo e por isso **ignoram o padding do
container**: elas precisam da classe `.tela-sobreposta` ([`src/index.css`](src/index.css))
para pararem acima da barra. Tela nova que abrir por cima usa essa classe, nao
`fixed inset-0`.

Ate a Etapa 8 a tela de venda tinha gestos laterais (arrastar abria Vendas e Cardapio),
heranca de quando o app era so o PDV. **Removidos na Etapa 9, a pedido do Felipe**: com
uma pagina propria para cada coisa, o gesto virou um segundo caminho para o mesmo lugar,
e um caminho que disparava sem querer no meio do atendimento.

Ate a Etapa 8 a tela de venda tinha gestos laterais (arrastar abria Vendas e Cardapio),
heranca de quando o app era so o PDV. **Removidos na Etapa 9, a pedido do Felipe**: com
uma pagina propria para cada coisa, o gesto virou um segundo caminho para o mesmo lugar,
e um caminho que disparava sem querer no meio do atendimento.

## Numeros que cabem

[`src/components/Valor.tsx`](src/components/Valor.tsx) escolhe o tamanho da fonte pelo
comprimento do texto. Um cartao de um terco de tela aperta antes que a largura toda,
entao os degraus sao diferentes por tamanho.

Motivo: `CHF 222.00` ocupava 109px de um cartao de 114px e encostava nas duas bordas;
com quatro digitos vazava de verdade. Testado com um dia de `CHF 1320.00`, em portugues
e em alemao, medindo por codigo que nenhum texto passa da largura do seu container.

**O `<Valor>` sozinho nao basta se a coluna for estreita demais.** O resumo da Home
nasceu com os quatro numeros numa fileira so; cada cartao ficou com ~85px e
`CHF 1251.50` vazou por cima do vizinho mesmo no menor degrau. Virou 2×2. A licao: o
componente ajusta a fonte, nao a largura da coluna — quem escolhe a grade precisa dar
espaco.

## Cores — a hierarquia de fundo (V2)

Cada camada tem que ser diferente da de baixo, senao o elemento some:

| Camada | Cor |
|---|---|
| pagina | `bg-cream-soft` |
| `Card` | `bg-cream` |
| campo **dentro** de um Card | `bg-cream-soft` |
| campo **solto** na pagina | `bg-cream` |

Nenhuma tela usa `bg-white` — o kit compartilhado fica em
[`src/components/ui.tsx`](src/components/ui.tsx) e e de la que toda tela puxa cabecalho,
cartao, badge e botao, em vez de reinventar.

Descoberto na marra: quando o `Card` virou creme, os campos do login sumiram no fundo —
pagina e campo tinham virado a mesma cor e so a borda os separava. O build passou limpo;
foi a screenshot que mostrou.

## Cancelar nao e apagar

Venda errada se **cancela**: sai de todos os totais, mas continua na lista, riscada e
marcada. O motivo e simples — se um toque pudesse apagar uma venda, o total do fim do
dia deixaria de bater com o dinheiro na caixa, e o app perderia a razao de existir.

O cancelamento tambem sobe para o Supabase na hora, sem esperar o ciclo de 2 minutos:
cancelar marca a venda como nao sincronizada e dispara o envio.

A unica coisa que apaga de verdade e o botao vermelho no fim dos Ajustes, e ele so
alcanca **o dia corrente**. Serve para tirar os testes antes de abrir a temporada.

## Corrigir venda (Fatia 3 da V2)

Cancelar tira a venda inteira dos totais. Quando o erro foi so o **valor digitado** ou o
**botao de pagamento**, isso destroi informacao boa junto com a ruim — dai o "Corrigir"
ao lado do "Cancelar" na lista de Vendas.

Corrigir muda `total` e `payment`, guarda o valor de antes em `original_total`, exige um
**motivo escrito** e carimba `corrected_at`. Os copos ficam como foram registrados: o que
se erra no balcao e o numero e o botao, e refazer o pedido inteiro custaria mais toques e
mexeria no ranking de toppings retroativamente.

**Uma correcao por venda.** A policy do banco so aceita a transicao de `corrected_at`
nulo para nao nulo. Errou duas vezes, cancela — assim "corrigir" nunca vira uma forma
educada de reescrever o faturamento aos poucos.

A correcao viaja pelo **mesmo caminho anonimo do cancelamento** (`sync.ts`), e nao pela
fila autenticada: corrigir precisa funcionar no celular, na hora, sem internet e sem
login. Se fosse pela fila, uma correcao feita deslogada ficaria presa para sempre com o
servidor guardando o valor errado.

`sales.ts` e a view `v_finance_daily` **nao mudaram**: as duas leem `total`, que passa a
ser o valor corrigido.

## Ocorrencia sem sair do PDV

O botao `＋⚠︎` no cabecalho da tela de venda abre uma folha curta — o que aconteceu, se e
critica, registrar — e devolve na hora o pedido em aberto. Grava na tabela `pendencies`,
que ja existia, pela fila offline do `outbox`.

Duas coisas nao podem ser trocadas de lugar aqui:

- **A folha entra por `lazy()` em `App.tsx`.** `outbox.ts` importa `./supabase`, e o
  caminho da venda nao pode carregar essa biblioteca. E a separacao em pedacos, nao um
  `if`, que mantem "vender nao depende de login".
- **Quem espera e a ocorrencia, nunca a venda.** Se a fila falhar, a folha fecha do mesmo
  jeito e o pedido continua intacto.

## Fechar a caixa com motivo

O fechamento deixou de gravar so o dinheiro contado. Agora mostra **esperado × contado ×
diferenca** (PRD V2 §7.3):

```
inicial + vendas em dinheiro + entradas - despesas + movimentos de caixa
```

TWINT fica de fora de proposito — nao passa pela caixa fisica, aparece so ao lado.
"Retirada" nao tem tipo proprio: e um `movimento_caixa` com valor negativo.

Diferenca diferente de zero **trava o botao** ate haver um motivo escrito, e o motivo vira
lancamento no Financeiro amarrado a operacao — `type: movimento_caixa`, `category:
ajuste`. Nao e um tipo `ajuste` proprio porque o `check` de `expenses` so aceita tres
tipos, e criar um quarto exigiria alterar uma restricao de tabela em producao; o efeito e
o mesmo e `v_finance_daily` ja soma isso.

Essa e a **unica** confirmacao do app inteiro. Em qualquer outro lugar, velocidade ganha:
a protecao e desfazer depois, nunca perguntar antes. Aqui o dinheiro ja acabou de ser
contado, e nao ha "depois".

## Financeiro que se entende (Fatia 4 da V2)

A tela responde "como foi hoje" antes de qualquer outra coisa, e explica cada numero em vez
de assumir que quem le sabe contabilidade (PRD V2 §7.1).

**Resultado de hoje** (§7.2): faturamento, Cash, TWINT, despesas e **resultado
operacional** — faturamento menos despesas lancadas. Sai da linha de hoje de
`v_finance_daily`, sem consulta nova.

> **"Lucro liquido" nao aparece em lugar nenhum, e isso e deliberado.** O custo do morango e
> do chocolate por copo ainda nao esta no sistema, entao esse numero mentiria. Quem for
> tentado a acrescenta-lo: o que destrava a conta e a ficha do copo, na Fatia 5.

**Caixa fisico** (§7.3) com a conta aberta linha por linha, e o TWINT sempre fora dela
(§7.4). E a mesma conta do fechamento, e mora num lugar so:

```
src/cashbox.ts   — puro: nao importa ./supabase nem ./auth
```

Ela nasceu dentro de `OperationScreen.tsx`. Quando o Financeiro passou a mostrar a mesma
conta, virou modulo: **duas copias da mesma formula e um jeito garantido de um dia elas
discordarem**, e a que discorda e a que o dinheiro na mao vai contradizer. `Linha` (rotulo ×
valor) foi junto para `ui.tsx` pelo mesmo motivo — a conta tem que se **parecer** igual nas
duas telas, senao vira duas contas aos olhos de quem le.

**O "?" ao lado do numero** e o componente `Explain` em `ui.tsx`, que abre um `Modal` com
duas ou tres frases. O texto vem de `explain.<topico>.title` e `explain.<topico>.body` no
`i18n.tsx`, **em PT e DE**. Sao seis: caixa, Cash × TWINT, despesa, retirada e ajuste,
fechamento, resultado operacional.

> **Nenhuma chave sem um "?" que a abra.** Foi escrito um texto so para "ajuste" e depois
> removido: ajuste e retirada sao a mesma linha na tela, entao a chave ficaria inalcancavel.
> Chave que ninguem alcanca e peso morto que envelhece.

**Origem clara em cada lancamento** (§7.5). A tabela guarda tres tipos, mas o que se precisa
ler na lista e de onde veio: compra, despesa, entrada, retirada, ajuste, movimento de caixa.
Retirada e um `movimento_caixa` negativo e ajuste e o que o fechamento cria sozinho — antes
os tres apareciam com o mesmo rotulo e a lista nao explicava nada.

## Ver as telas que exigem login — `.preview/`

Financeiro, Operacao e Compras so abrem com sessao no Supabase, que a maquina de quem
desenvolve nao tem. `.preview/vite.config.ts` monta um Vite descartavel que troca
`src/auth.ts`, `src/supabase.ts` e `src/main.tsx` por versoes de mentira **no momento de
carregar** — nenhum arquivo de `src/` e alterado.

```bash
npx vite --config .preview/vite.config.ts
# http://localhost:5233/?lang=de        alemao
# http://localhost:5233/?lang=de&click=3  abre sozinho o quarto "?"
```

Os numeros sao o pior caso de largura de proposito: `CHF 1234.50` em todas as linhas.

**Por que existe:** a tela de fechamento da Fatia 3 foi entregue sem nunca ter sido vista —
o calculo foi conferido por sonda, e sonda nao mostra texto vazando nem numero encostando na
borda. Dois defeitos da Fatia 4 so apareceram na imagem: `± CHF -312.50` com dois sinais na
mesma linha, e um rotulo alemao empurrando o "?" para uma segunda linha sozinho.

## Como funciona offline

A venda e gravada no **IndexedDB do celular** antes de qualquer coisa. Internet nunca
entra no caminho critico: sem sinal ou com o Supabase fora do ar, a venda ja esta salva.

A sincronizacao roda sozinha ao abrir o app, ao finalizar uma venda, ao cancelar uma
venda, quando a rede volta, e a cada 2 minutos.

### Por que nao ha upsert aqui

O `id` nasce no celular. O envio e um `insert` puro, e **id duplicado e tratado como
sucesso** — e isso que garante que reenviar a mesma venda mil vezes nunca duplique.

Nao se usa `upsert`. `INSERT ... ON CONFLICT` precisa **ler** a linha conflitante, e a
politica de leitura esta fechada de proposito — o Supabase responde `42501`. Manter a
leitura fechada importa: a chave anon viaja dentro do app, e com `SELECT` liberado
qualquer pessoa leria o faturamento inteiro da Sunbite.

Depois do insert, um `PATCH` acerta o que mudou desde entao — hoje, o cancelamento.
Isso cobre inclusive a venda que foi cancelada antes de existir no servidor.

Nao ha dependencia do `@supabase/supabase-js`: sao duas chamadas REST com `fetch`, o
que tirou 51KB comprimidos do app.

## Supabase

O app ja vem conectado: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` sao variaveis de
ambiente na Vercel, e localmente ficam em `.env.local` (fora do git). A chave anon e
publica por design — quem protege os dados e o RLS, que permite gravar e proibe ler.

Os campos em Ajustes continuam existindo e **sobrescrevem** o padrao, para o caso de
trocar de projeto sem publicar de novo.

Antes do primeiro uso, rodar [`docs/supabase.sql`](docs/supabase.sql) no SQL Editor.

## Publicar e instalar no Android

```bash
npm run build
npx vercel --prod
```

No celular, abrir a URL no **Chrome** → menu ⋮ → **Adicionar a tela inicial**, e abrir
uma vez com internet.

Cuidado conhecido: o service worker guarda a versao anterior. Depois de publicar, a
primeira abertura ainda mostra o app velho — fechar e abrir de novo resolve.

## Idioma

Portugues e alemao, com o botao `PT · DE` no topo de todas as telas. A escolha fica
salva. Valores sempre em CHF.

**O banco nao muda com o idioma**: a venda grava o topping por id (`almond`, `coconut`,
`cream`), nunca pelo rotulo. Venda registrada em portugues aparece correta em alemao.

Textos em [`src/i18n.tsx`](src/i18n.tsx). Grafia alema no padrao suico (`Abschliessen`).

## Confirmacao da venda

`framer-motion`, em [`src/components/SaleConfirmation.tsx`](src/components/SaleConfirmation.tsx).
Ondas do centro, selo entrando com mola, o certo desenhado traco a traco, valor subindo,
morangos voando.

Duas regras valem mais que a animacao: **fecha ao toque** (esperar animacao numa fila e
tempo perdido) e **fecha sozinha em 1,9s**. Respeita `prefers-reduced-motion`.

Erro nao usa essa tela: falha ao gravar aparece em vermelho, parada, por 5 segundos.
Comemoracao e erro nunca podem parecer a mesma coisa.

## Icones

`node scripts/make-icons.mjs` gera os PNGs em `public/`. Para usar o logo oficial,
substituir `icon-192.png`, `icon-512.png` e `icon-maskable.png` pelos arquivos certos.

## Fora do escopo

Estoque, compra de ingredientes, checklist de preparo, operacao do dia, multiplos
usuarios, multiplos celulares, automacoes, gamificacao e gorjeta.
