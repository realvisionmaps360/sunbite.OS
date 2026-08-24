-- Sunbite PDV — tabela de vendas
-- Rodar no SQL Editor do Supabase antes de ligar a sincronizacao no app.

create table if not exists public.sales (
  id           uuid primary key,             -- gerado no celular: e o que impede duplicata
  created_at   timestamptz not null,         -- instante da venda, em UTC
  local_date   date not null,                -- data no fuso do celular (relatorio do dia)
  local_time   time not null,
  cup_count    int not null,
  cups         jsonb not null,               -- [{ id, toppings: ["cream","almond"] }]
  total        numeric(6,2) not null,
  payment      text not null check (payment in ('cash','twint')),
  device_id    uuid not null,
  cancelled    boolean not null default false,
  cancelled_at timestamptz,
  synced_at    timestamptz not null default now()
);

create index if not exists sales_local_date_idx on public.sales (local_date);

alter table public.sales enable row level security;

-- O app usa a chave anon. Ele so precisa gravar — nunca ler de volta.
create policy "pdv grava venda"
  on public.sales for insert to anon with check (true);

-- Necessario tambem para o cancelamento chegar ate aqui: cancelar marca a venda
-- como nao sincronizada e o upsert por id atualiza a linha que ja existia.
create policy "pdv reenvia venda"
  on public.sales for update to anon using (true) with check (true);

-- Conferencia do dia (venda cancelada nao entra em nenhum total):
-- select local_date,
--        count(*) filter (where not cancelled)                       as vendas,
--        sum(cup_count) filter (where not cancelled)                 as copos,
--        sum(total) filter (where not cancelled)                     as chf,
--        sum(total) filter (where not cancelled and payment='cash')  as dinheiro,
--        count(*) filter (where cancelled)                           as canceladas
-- from public.sales group by 1 order by 1 desc;
