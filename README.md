# Sunbite PDV — Offline V1

Registro de vendas da Sunbite em poucos segundos, sem internet.

No ar: **https://sunbite-pdv.vercel.app**

Base: `prd-pdv-offline-v1` · decisoes: `DEC-2026-001` (preco e formato) e
`DEC-2026-002` (cancelamento e painel).

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

**Ajustes** — precos, conexao com o Supabase e a limpeza das vendas de hoje.

## Navegacao

Cada tela tem seu botao na Home, e volta para la pelo **‹ Inicio** (ou pelo **×**, em
Vendas e Cardapio, que voltam para Vender). O botao fisico de voltar do Android faz o
mesmo caminho — ver `goBack()` em [`src/App.tsx`](src/App.tsx).

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

## Cancelar nao e apagar

Venda errada se **cancela**: sai de todos os totais, mas continua na lista, riscada e
marcada. O motivo e simples — se um toque pudesse apagar uma venda, o total do fim do
dia deixaria de bater com o dinheiro na caixa, e o app perderia a razao de existir.

O cancelamento tambem sobe para o Supabase na hora, sem esperar o ciclo de 2 minutos:
cancelar marca a venda como nao sincronizada e dispara o envio.

A unica coisa que apaga de verdade e o botao vermelho no fim dos Ajustes, e ele so
alcanca **o dia corrente**. Serve para tirar os testes antes de abrir a temporada.

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
