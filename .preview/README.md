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

Depois: `http://localhost:5233/?lang=de` para o alemão, `&click=3` para abrir
sozinho o quarto "?" da tela e fotografar a caixinha do tutorial.

Os números são o pior caso de largura de propósito: `CHF 1234.50` em todas as
linhas, que é a combinação mais larga que o app consegue produzir.
