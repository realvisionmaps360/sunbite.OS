# `.preview/` — ver as telas que exigem login

Ambiente descartável, **fora do app**, para fotografar telas que só abrem com
sessão no Supabase (Financeiro, Operação, Compras…). Nenhum arquivo de `src/`
é alterado: o `vite.config.ts` daqui troca `src/auth.ts`, `src/supabase.ts` e
`src/main.tsx` por versões de mentira **no momento de carregar**.

Nasceu na Fatia 4. Antes dele, a tela de fechamento foi entregue sem nunca ter
sido vista — o cálculo tinha sido conferido "por sonda", e conferir por sonda
não mostra texto vazando nem número encostando na borda.

```bash
npx vite --config .preview/vite.config.ts
```

Depois: `http://localhost:5233/?lang=de` para o alemão, `&screen=stock` para o
Estoque, `&click=3` para abrir
sozinho o quarto "?" da tela e fotografar a caixinha do tutorial.

Os números são o pior caso de largura de propósito: `CHF 1234.50` em todas as
linhas, que é a combinação mais larga que o app consegue produzir.

## Telas cobertas

`?screen=finance` (padrão), `?screen=stock`, `?screen=ai`.

## ⚠️ Mock que mente não é portão

Na Fatia 6 o `order()` do mock do Supabase era **no-op**. Resultado: um chat fora de ordem
passaria no portão sem ninguém notar. Depois de fazê-lo ordenar de verdade, a ordem errada
apareceu na hora.

Também faltavam `maybeSingle`, `update` e `ilike`, e o `insert()` não devolvia a linha
criada — o que fazia *aprovar um card* estourar aqui por um motivo que **não existe em
produção** (no Supabase de verdade, `insert().select().single()` devolve a linha, ou devolve
erro; nunca devolve `{data: null, error: null}`).

Então: quando o preview acusar erro, a primeira pergunta é **"o mock sabe fazer isto?"**.
A resposta certa é ensiná-lo, nunca contornar o teste.
