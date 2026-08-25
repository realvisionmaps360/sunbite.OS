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

-- Etapa 2 do plano de execucao (02-Projetos/sunbite-ops/plano-execucao.md).
-- Ate aqui a politica de UPDATE era `using (true) with check (true)`: quem
-- lesse o JavaScript do app conseguia zerar o faturamento da temporada
-- inteira com uma requisicao. As tres policies abaixo substituem
-- "pdv grava venda" e "pdv reenvia venda", que faziam isso.
--
-- Verificacao obrigatoria ANTES de aplicar: rodar o predicado do check de
-- insercao contra as linhas existentes. Zero linhas fora do limite, ou
-- ajustar os limites abaixo antes de seguir.
-- select * from public.sales where not (
--   cup_count between 1 and 50
--   and total >= 0 and total <= 500
--   and payment in ('cash','twint')
--   and created_at > timestamptz '2026-01-01'
--   and created_at < now() + interval '1 day'
--   and local_date between current_date - 30 and current_date + 1
-- );

-- Leitura passa a existir, so para quem esta logado.
drop policy if exists sales_read_auth on public.sales;
create policy sales_read_auth
  on public.sales for select to authenticated using (true);

-- Escrita continua aberta sem login (vender nunca bloqueia), mas com limites.
drop policy if exists "pdv grava venda" on public.sales;
drop policy if exists sales_insert on public.sales;
create policy sales_insert
  on public.sales for insert to anon, authenticated
  with check (
    cup_count between 1 and 50
    and total >= 0 and total <= 500
    and payment in ('cash','twint')
    and created_at > timestamptz '2026-01-01'
    and created_at < now() + interval '1 day'
    and local_date between current_date - 30 and current_date + 1
  );

-- Cancelamento passa a permitir exatamente uma transicao, em duas colunas —
-- nao mais "atualiza qualquer coluna para qualquer valor".
drop policy if exists "pdv reenvia venda" on public.sales;
drop policy if exists sales_cancel_anon on public.sales;
create policy sales_cancel_anon
  on public.sales for update to anon
  using (cancelled = false) with check (cancelled = true);

revoke update on public.sales from anon;
grant  update (cancelled, cancelled_at) on public.sales to anon;

-- Apagar: ninguem. deleteToday() no app continua sendo so local.

-- Conferencia do dia (venda cancelada nao entra em nenhum total):
-- select local_date,
--        count(*) filter (where not cancelled)                       as vendas,
--        sum(cup_count) filter (where not cancelled)                 as copos,
--        sum(total) filter (where not cancelled)                     as chf,
--        sum(total) filter (where not cancelled and payment='cash')  as dinheiro,
--        count(*) filter (where cancelled)                           as canceladas
-- from public.sales group by 1 order by 1 desc;


-- ============================================================================
-- Etapa 1 do plano de execucao — Sunbite Operations App
-- Ver 02-Projetos/sunbite-ops/plano-execucao.md
--
-- Regra desta etapa: SO ADICIONAR. Tudo abaixo e "create table if not
-- exists" ou "alter ... add column if not exists". Nada e renomeado, nada e
-- apagado, e a tabela `sales` acima nao e tocada (exceto a unica coluna nova
-- explicita, mais abaixo). O app publicado hoje continua funcionando sem
-- saber que o banco cresceu.
--
-- RLS: toda tabela nova abaixo tem row level security LIGADO e, de
-- proposito, SEM NENHUMA POLICY ainda. Isso bloqueia leitura e escrita por
-- enquanto (inclusive para o app) — e a escolha segura por padrao, para nao
-- repetir com uma tabela nova o mesmo erro que a Etapa 2 corrige em `sales`
-- (RLS ligado com "using (true)" e a mesma coisa que RLS desligado). As
-- policies de cada tabela chegam junto com a etapa que constroi aquele
-- modulo (Etapa 6 para operations/checklist, Etapa 7 para estoque/compras/
-- financeiro, Etapa 8 para locais/eventos), quando se sabe exatamente quem
-- precisa escrever o que, com ou sem sessao.
-- ============================================================================


-- ── Identidade ────────────────────────────────────────────────────────────

-- Nome legivel de quem esta logado. Existe porque `auth.users` nao e
-- lida pelo app (chave anon/authenticated nao tem acesso a ela).
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Um aparelho fisico (celular). O id e gerado no proprio aparelho por
-- deviceId() — o mesmo id ja usado em sales.device_id — nunca pelo banco.
create table if not exists public.devices (
  id           uuid primary key,
  app_version  text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.devices enable row level security;


-- ── A espinha: operacoes ─────────────────────────────────────────────────

create table if not exists public.places (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  fee        numeric(8,2),
  contact    text,
  rating     text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.places enable row level security;

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid references public.places(id),
  starts_at  timestamptz not null,
  label_en   text,
  label_de   text,
  is_public  boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

create table if not exists public.operations (
  id           uuid primary key default gen_random_uuid(),
  local_date   date not null,
  place_id     uuid references public.places(id),
  event_id     uuid references public.events(id),
  status       text not null default 'planned'
               check (status in ('planned', 'open', 'closed')),
  cash_initial numeric(8,2),
  cash_final   numeric(8,2),
  opened_by    uuid references public.profiles(id),
  opened_at    timestamptz,
  closed_by    uuid references public.profiles(id),
  closed_at    timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.operations enable row level security;

-- Uma operacao aberta por vez, garantido pelo banco, nao pela tela.
-- Dois celulares nao conseguem abrir duas.
create unique index if not exists one_open_operation
  on public.operations ((status)) where status = 'open';


-- ── Ligacao da venda com a operacao ─────────────────────────────────────

-- Aceita nulo, por exigencia: o celular carimba a partir da operacao aberta
-- guardada localmente, entao uma venda offline tambem sai ligada. Sem
-- operacao em cache, a venda grava solta e sincroniza igual — recuperacao
-- e a acao "anexar vendas soltas deste dia", que chega com o modulo.
alter table public.sales
  add column if not exists operation_id uuid
  references public.operations(id) on delete set null;


-- ── Checklist — a decisao mais importante do esquema ────────────────────

-- O modelo, editavel, com rotulo PT e DE. `active = false` em vez de
-- apagar, porque operacoes antigas continuam referenciando o template
-- usado na epoca.
create table if not exists public.checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  phase      text not null
             check (phase in ('preparacao', 'saida', 'operacao', 'encerramento')),
  label_pt   text not null,
  label_de   text not null,
  critical   boolean not null default false,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.checklist_templates enable row level security;

-- Uma linha por item por operacao — nunca um bloco jsonb. E isso que faz o
-- tempo real funcionar: marcar um item manda ~200 bytes para o outro
-- celular, e dois celulares marcando itens diferentes no mesmo segundo nao
-- se atropelam, porque cada item e uma celula independente.
create table if not exists public.checklist_state (
  id           uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  template_id  uuid not null references public.checklist_templates(id),
  checked      boolean not null default false,
  checked_by   uuid references public.profiles(id),
  checked_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (operation_id, template_id)
);

alter table public.checklist_state enable row level security;


-- ── Coisas: equipamento, estoque, fornecedores, compras ─────────────────

create table if not exists public.equipment (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'ok'
             check (status in ('ok', 'issue', 'broken', 'missing')),
  critical   boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.equipment enable row level security;

create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  product    text,
  contact    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;

create table if not exists public.stock_items (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  unit                text not null,
  quantity            numeric(10,3) not null default 0,
  low_stock_threshold numeric(10,3),
  supplier_id         uuid references public.suppliers(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.stock_items enable row level security;

-- O movimento e a verdade. A quantidade em stock_items e so um total
-- mantido por gatilho — nunca escrita direto pelo app.
create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  stock_item_id  uuid not null references public.stock_items(id),
  quantity_delta numeric(10,3) not null,
  reason         text not null
                 check (reason in ('compra', 'uso', 'ajuste', 'perda')),
  operation_id   uuid references public.operations(id),
  notes          text,
  created_by     uuid references public.profiles(id),
  device_id      uuid references public.devices(id),
  created_at     timestamptz not null default now()
);

alter table public.stock_movements enable row level security;

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
as $$
begin
  update public.stock_items
    set quantity   = quantity + new.quantity_delta,
        updated_at = now()
    where id = new.stock_item_id;
  return new;
end;
$$;

drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- Sem tabela de historico de preco de compra — isso e uma consulta sobre
-- purchase_items. Duplicar seria criar duas verdades.
create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid references public.suppliers(id),
  purchased_at date not null default current_date,
  total        numeric(8,2),
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.purchases enable row level security;

create table if not exists public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchases(id) on delete cascade,
  stock_item_id uuid references public.stock_items(id),
  description   text,
  quantity      numeric(10,3) not null,
  unit_cost     numeric(10,4),
  subtotal      numeric(10,2) generated always as (quantity * unit_cost) stored
);

alter table public.purchase_items enable row level security;


-- ── Dinheiro e tarefas ───────────────────────────────────────────────────

-- Receita de venda nao e redigitada aqui — vive em sales. Isto e so
-- despesa, entrada e movimento de caixa (aporte/retirada).
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  type         text not null
               check (type in ('despesa', 'entrada', 'movimento_caixa')),
  category     text,
  description  text,
  value        numeric(8,2) not null,
  occurred_at  date not null default current_date,
  operation_id uuid references public.operations(id),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.expenses enable row level security;

create table if not exists public.pendencies (
  id           uuid primary key default gen_random_uuid(),
  description  text not null,
  critical     boolean not null default false,
  status       text not null default 'aberta'
               check (status in ('aberta', 'concluida')),
  origin       text,
  operation_id uuid references public.operations(id),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  resolved_by  uuid references public.profiles(id),
  resolved_at  timestamptz
);

alter table public.pendencies enable row level security;

-- Junta a receita de sales com despesas/entradas/movimentos de expenses,
-- por dia. Nao redigita nada, so agrupa o que ja existe nas duas tabelas.
create or replace view public.v_finance_daily as
select
  d.local_date,
  coalesce(s.receita_dinheiro, 0) as receita_dinheiro,
  coalesce(s.receita_twint, 0)    as receita_twint,
  coalesce(s.receita_total, 0)    as receita_total,
  coalesce(e.despesas, 0)         as despesas,
  coalesce(e.entradas, 0)         as entradas,
  coalesce(e.movimentos_caixa, 0) as movimentos_caixa
from (
  select local_date from public.sales
  union
  select occurred_at as local_date from public.expenses
) d
left join (
  select
    local_date,
    sum(total) filter (where payment = 'cash' and not cancelled)  as receita_dinheiro,
    sum(total) filter (where payment = 'twint' and not cancelled) as receita_twint,
    sum(total) filter (where not cancelled)                       as receita_total
  from public.sales
  group by 1
) s on s.local_date = d.local_date
left join (
  select
    occurred_at as local_date,
    sum(value) filter (where type = 'despesa')         as despesas,
    sum(value) filter (where type = 'entrada')          as entradas,
    sum(value) filter (where type = 'movimento_caixa')  as movimentos_caixa
  from public.expenses
  group by 1
) e on e.local_date = d.local_date
order by d.local_date desc;


-- ── Preco de venda — sai do codigo ───────────────────────────────────────

-- O que vale hoje. src/config.ts continua existindo como valor de partida,
-- para o app abrir antes de conseguir ler o banco — mas o dono do numero
-- passa a ser esta tabela. Ver DEC-2026-005.
create table if not exists public.prices (
  item_key   text primary key,
  value      numeric(6,2) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.prices enable row level security;

-- Obrigatorio, nao enfeite: venda antiga nao pode mudar de valor quando o
-- preco novo entrar (ja garantido porque sales.total guarda o valor
-- cobrado no momento). Isto e o que permite responder "por que a media de
-- julho e diferente".
create table if not exists public.price_history (
  id         uuid primary key default gen_random_uuid(),
  item_key   text not null,
  old_value  numeric(6,2),
  new_value  numeric(6,2) not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

alter table public.price_history enable row level security;


-- ── Log ──────────────────────────────────────────────────────────────────

-- Escrito no aparelho — e o unico lugar que enxerga o que nunca chega ao
-- servidor. occurred_at e a hora do aparelho (um evento offline guarda a
-- hora real de quando aconteceu, nao de quando sincronizou).
-- O gatilho que registra toda venda inserida chega na Etapa 5, junto com a
-- tela de Sistema que le esta tabela — aqui so a estrutura.
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  profile_id  uuid references public.profiles(id),
  device_id   uuid references public.devices(id),
  action      text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table public.activity_log enable row level security;


-- ============================================================================
-- Etapa 5 do plano de execucao — Tela de Sistema e o log
-- Ver 02-Projetos/sunbite-ops/plano-execucao.md
-- ============================================================================

-- Leitura do log do servidor, so para quem esta logado (mesma regra de sales).
drop policy if exists activity_log_read_auth on public.activity_log;
create policy activity_log_read_auth
  on public.activity_log for select to authenticated using (true);

-- Nenhuma policy de insert para anon/authenticated, de proposito: a chave
-- anon viaja no JavaScript do app, e se ela pudesse escrever aqui qualquer
-- um forjaria uma entrada de log. So o gatilho abaixo, com privilegio
-- elevado (security definer), consegue escrever nesta tabela.
create index if not exists activity_log_occurred_at_idx
  on public.activity_log (occurred_at desc);

create or replace function public.log_sale_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (occurred_at, profile_id, device_id, action, message)
  values (
    new.created_at,   -- hora do aparelho, nao do servidor
    null,              -- venda gravada por anon, sem sessao: nao ha "quem"
    new.device_id,
    'sale_insert',
    'Venda de ' || new.cup_count || ' copo(s), CHF ' ||
      to_char(new.total, 'FM999990.00') || ', via ' ||
      case new.payment when 'cash' then 'dinheiro' else 'TWINT' end || '.'
  );
  return new;
end;
$$;

drop trigger if exists sales_log_insert on public.sales;
create trigger sales_log_insert
  after insert on public.sales
  for each row execute function public.log_sale_insert();


-- ── Tempo real ───────────────────────────────────────────────────────────

-- Ligado so nestas tres. Nem sales — volume alto e sem necessidade entre
-- aparelhos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operations'
  ) then
    alter publication supabase_realtime add table public.operations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checklist_state'
  ) then
    alter publication supabase_realtime add table public.checklist_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pendencies'
  ) then
    alter publication supabase_realtime add table public.pendencies;
  end if;
end $$;


-- ============================================================================
-- Etapa 6 do plano de execucao — Operacao, checklist e tempo real
-- Ver 02-Projetos/sunbite-ops/plano-execucao.md
--
-- operations/checklist_templates/checklist_state/pendencies sao modulo
-- administrativo: leitura e escrita completas exigem `authenticated` (Felipe
-- e Romana, login permanente desde a Etapa 4). Excecao proposital: o
-- fluxo de venda precisa saber a operacao aberta sem depender de login, entao
-- `anon` ganha leitura das colunas nao sensiveis, so da operacao aberta.
--
-- Sem "for all": apagar continua sendo ninguem, mesma regra de `sales`.
-- ============================================================================

-- profiles precisa de policy propria: e para onde apontam opened_by/
-- checked_by/created_by das quatro tabelas abaixo — sem isso nada delas
-- consegue gravar quem fez.
drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth
  on public.profiles for select to authenticated using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- operations
drop policy if exists operations_select_auth on public.operations;
create policy operations_select_auth
  on public.operations for select to authenticated using (true);

drop policy if exists operations_insert_auth on public.operations;
create policy operations_insert_auth
  on public.operations for insert to authenticated with check (true);

drop policy if exists operations_update_auth on public.operations;
create policy operations_update_auth
  on public.operations for update to authenticated using (true) with check (true);

-- Leitura minima para anon: so a operacao aberta, e so as colunas que o
-- caminho da venda precisa para carimbar `sales.operation_id` offline.
-- cash_initial/cash_final/opened_by/closed_by continuam invisiveis a quem
-- nao esta logado — mesmo principio que ja fechou `sales` na Etapa 2.
drop policy if exists operations_read_open_anon on public.operations;
create policy operations_read_open_anon
  on public.operations for select to anon using (status = 'open');

revoke select on public.operations from anon;
grant select (id, status, local_date, place_id, event_id) on public.operations to anon;

-- checklist_templates
drop policy if exists checklist_templates_select_auth on public.checklist_templates;
create policy checklist_templates_select_auth
  on public.checklist_templates for select to authenticated using (true);

drop policy if exists checklist_templates_insert_auth on public.checklist_templates;
create policy checklist_templates_insert_auth
  on public.checklist_templates for insert to authenticated with check (true);

drop policy if exists checklist_templates_update_auth on public.checklist_templates;
create policy checklist_templates_update_auth
  on public.checklist_templates for update to authenticated using (true) with check (true);

-- checklist_state
drop policy if exists checklist_state_select_auth on public.checklist_state;
create policy checklist_state_select_auth
  on public.checklist_state for select to authenticated using (true);

drop policy if exists checklist_state_insert_auth on public.checklist_state;
create policy checklist_state_insert_auth
  on public.checklist_state for insert to authenticated with check (true);

drop policy if exists checklist_state_update_auth on public.checklist_state;
create policy checklist_state_update_auth
  on public.checklist_state for update to authenticated using (true) with check (true);

-- pendencies
drop policy if exists pendencies_select_auth on public.pendencies;
create policy pendencies_select_auth
  on public.pendencies for select to authenticated using (true);

drop policy if exists pendencies_insert_auth on public.pendencies;
create policy pendencies_insert_auth
  on public.pendencies for insert to authenticated with check (true);

drop policy if exists pendencies_update_auth on public.pendencies;
create policy pendencies_update_auth
  on public.pendencies for update to authenticated using (true) with check (true);


-- ── Seed do checklist ────────────────────────────────────────────────────
-- Mesclado do PRD (secao 5) e do documento-base 05 (secoes 3, 10, 12, 21, 33).
-- Tudo editavel pelo app depois — isto e so o ponto de partida. Indice unico
-- por (phase, label_pt) evita duplicar ao rodar este arquivo de novo.
create unique index if not exists checklist_templates_phase_label_pt_idx
  on public.checklist_templates (phase, label_pt);

insert into public.checklist_templates (phase, label_pt, label_de, critical, sort_order) values
  ('preparacao', 'Caixa vermelha', 'Roter Kasten', false, 10),
  ('preparacao', 'Dinheiro contado dentro da caixa', 'Geld in der Kasse gezählt', false, 20),
  ('preparacao', 'Duas colheres de chocolate', 'Zwei Schokoladenlöffel', false, 30),
  ('preparacao', 'Dois recipientes para chocolate', 'Zwei Schokoladenbehälter', false, 40),
  ('preparacao', 'Duas tampas dos recipientes', 'Zwei Behälterdeckel', false, 50),
  ('preparacao', 'Tripé para celular', 'Stativ fürs Handy', false, 60),
  ('preparacao', 'Carregador do celular', 'Handy-Ladegerät', false, 70),
  ('preparacao', 'Celular carregado', 'Handy aufgeladen', false, 80),
  ('preparacao', 'Luvas pretas', 'Schwarze Handschuhe', false, 90),
  ('preparacao', 'Sacos de lixo', 'Müllsäcke', false, 100),
  ('preparacao', 'Caixa de som', 'Lautsprecher', false, 110),
  ('preparacao', 'Caixa de som carregada', 'Lautsprecher aufgeladen', false, 120),
  ('preparacao', 'Bateria da geladeira carregada', 'Kühlschrank-Batterie aufgeladen', false, 130),
  ('preparacao', 'Bateria do motor carregada', 'Motor-Batterie aufgeladen', false, 140),
  ('preparacao', 'Pacotes de gelo', 'Eispackungen', false, 150),
  ('preparacao', 'Gelo no congelador na véspera', 'Eis am Vortag ins Gefrierfach gelegt', false, 160),
  ('preparacao', 'Material/QR Code TWINT', 'TWINT-Material/QR-Code', false, 170),

  ('saida', 'Local confirmado', 'Standort bestätigt', false, 10),
  ('saida', 'Horário confirmado', 'Uhrzeit bestätigt', false, 20),
  ('saida', 'Autorização verificada', 'Bewilligung geprüft', true, 30),
  ('saida', 'Morangos', 'Erdbeeren', false, 40),
  ('saida', 'Chocolate', 'Schokolade', false, 50),
  ('saida', 'Toppings', 'Toppings', false, 60),
  ('saida', 'Chantilly', 'Rahm', false, 70),
  ('saida', 'Copos', 'Becher', false, 80),
  ('saida', 'Freio', 'Bremse', true, 90),
  ('saida', 'Bateria', 'Batterie', true, 100),

  ('encerramento', 'Parar novos pedidos', 'Keine neuen Bestellungen mehr annehmen', false, 10),
  ('encerramento', 'Contabilizar ingredientes restantes', 'Restliche Zutaten zählen', false, 20),
  ('encerramento', 'Identificar produto descartável', 'Nicht mehr verwendbares Produkt identifizieren', false, 30),
  ('encerramento', 'Guardar produto aproveitável de forma segura', 'Verwendbares Produkt sicher verstauen', false, 40),
  ('encerramento', 'Fechar caixa', 'Kasse abschliessen', false, 50),
  ('encerramento', 'Conferir TWINT', 'TWINT prüfen', false, 60),
  ('encerramento', 'Desligar equipamentos', 'Geräte ausschalten', false, 70),
  ('encerramento', 'Limpar superfícies', 'Flächen reinigen', false, 80),
  ('encerramento', 'Desmontar materiais', 'Material abbauen', false, 90),
  ('encerramento', 'Carregar equipamentos', 'Geräte einladen', false, 100),
  ('encerramento', 'Verificar se nada ficou no local', 'Prüfen, dass nichts am Ort zurückbleibt', false, 110)
on conflict (phase, label_pt) do nothing;
