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


-- ============================================================================
-- Etapa 7 do plano de execucao — Equipamentos, Estoque, Compras, Financeiro
-- Ver 02-Projetos/sunbite-ops/plano-execucao.md
--
-- Todas as tabelas abaixo ja existiam desde a Etapa 1, com RLS ligado e sem
-- nenhuma policy, de proposito — deixadas fechadas ate esta etapa abrir.
--
-- Mesmo padrao de operations/checklist_state: leitura e escrita completas
-- so para authenticated (Felipe e Romana, poder identico). Sem "for all":
-- apagar continua sendo ninguem. equipment/suppliers/purchases/expenses nao
-- ganham policy nenhuma para anon — sao modulos "sentado com wifi", ao
-- contrario de stock_movements, que a fila offline grava autenticado assim
-- que a sessao volta (nunca como anon).
-- ============================================================================

-- equipment
drop policy if exists equipment_select_auth on public.equipment;
create policy equipment_select_auth
  on public.equipment for select to authenticated using (true);
drop policy if exists equipment_insert_auth on public.equipment;
create policy equipment_insert_auth
  on public.equipment for insert to authenticated with check (true);
drop policy if exists equipment_update_auth on public.equipment;
create policy equipment_update_auth
  on public.equipment for update to authenticated using (true) with check (true);

-- suppliers
drop policy if exists suppliers_select_auth on public.suppliers;
create policy suppliers_select_auth
  on public.suppliers for select to authenticated using (true);
drop policy if exists suppliers_insert_auth on public.suppliers;
create policy suppliers_insert_auth
  on public.suppliers for insert to authenticated with check (true);
drop policy if exists suppliers_update_auth on public.suppliers;
create policy suppliers_update_auth
  on public.suppliers for update to authenticated using (true) with check (true);

-- stock_items — quantity so muda por gatilho (apply_stock_movement, Etapa 1),
-- mas a policy nao restringe a coluna: os dois usuarios sao igualmente
-- confiaveis, a disciplina de nunca mandar quantity direto fica no app.
drop policy if exists stock_items_select_auth on public.stock_items;
create policy stock_items_select_auth
  on public.stock_items for select to authenticated using (true);
drop policy if exists stock_items_insert_auth on public.stock_items;
create policy stock_items_insert_auth
  on public.stock_items for insert to authenticated with check (true);
drop policy if exists stock_items_update_auth on public.stock_items;
create policy stock_items_update_auth
  on public.stock_items for update to authenticated using (true) with check (true);

-- stock_movements — a unica tabela desta etapa tocada em pe na barraca;
-- e por isso a unica com fila offline no app (outbox.ts).
drop policy if exists stock_movements_select_auth on public.stock_movements;
create policy stock_movements_select_auth
  on public.stock_movements for select to authenticated using (true);
drop policy if exists stock_movements_insert_auth on public.stock_movements;
create policy stock_movements_insert_auth
  on public.stock_movements for insert to authenticated with check (true);

-- purchases / purchase_items
drop policy if exists purchases_select_auth on public.purchases;
create policy purchases_select_auth
  on public.purchases for select to authenticated using (true);
drop policy if exists purchases_insert_auth on public.purchases;
create policy purchases_insert_auth
  on public.purchases for insert to authenticated with check (true);
drop policy if exists purchases_update_auth on public.purchases;
create policy purchases_update_auth
  on public.purchases for update to authenticated using (true) with check (true);

drop policy if exists purchase_items_select_auth on public.purchase_items;
create policy purchase_items_select_auth
  on public.purchase_items for select to authenticated using (true);
drop policy if exists purchase_items_insert_auth on public.purchase_items;
create policy purchase_items_insert_auth
  on public.purchase_items for insert to authenticated with check (true);
drop policy if exists purchase_items_update_auth on public.purchase_items;
create policy purchase_items_update_auth
  on public.purchase_items for update to authenticated using (true) with check (true);

-- expenses
drop policy if exists expenses_select_auth on public.expenses;
create policy expenses_select_auth
  on public.expenses for select to authenticated using (true);
drop policy if exists expenses_insert_auth on public.expenses;
create policy expenses_insert_auth
  on public.expenses for insert to authenticated with check (true);
drop policy if exists expenses_update_auth on public.expenses;
create policy expenses_update_auth
  on public.expenses for update to authenticated using (true) with check (true);

-- prices / price_history — price_history so e escrito pelo gatilho abaixo,
-- nunca direto pelo app (mesmo principio do activity_log na Etapa 5).
drop policy if exists prices_select_auth on public.prices;
create policy prices_select_auth
  on public.prices for select to authenticated using (true);
drop policy if exists prices_insert_auth on public.prices;
create policy prices_insert_auth
  on public.prices for insert to authenticated with check (true);
drop policy if exists prices_update_auth on public.prices;
create policy prices_update_auth
  on public.prices for update to authenticated using (true) with check (true);

-- Leitura tambem para anon: preco nao e dado sensivel (e o que ja esta
-- impresso no cardapio), e o caminho da venda precisa ler sem depender de
-- login (src/prices.ts, mesmo principio de operations.ts). Nada a esconder
-- aqui, ao contrario de cash_initial/cash_final em operations.
drop policy if exists prices_select_anon on public.prices;
create policy prices_select_anon
  on public.prices for select to anon using (true);

drop policy if exists price_history_select_auth on public.price_history;
create policy price_history_select_auth
  on public.price_history for select to authenticated using (true);


-- ── Historico de preco automatico ───────────────────────────────────────
-- Grava o antes-e-depois sozinho, sem depender do app lembrar de inserir as
-- duas linhas — mesmo principio do gatilho de activity_log.
create or replace function public.record_price_history()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.value is distinct from old.value then
    insert into public.price_history (item_key, old_value, new_value, changed_by, changed_at)
    values (new.item_key, old.value, new.value, new.updated_by, now());
  end if;
  return new;
end;
$$;

drop trigger if exists price_history_trigger on public.prices;
create trigger price_history_trigger
  after update on public.prices
  for each row execute function public.record_price_history();


-- ── Seed — equipamento, fornecedores, estoque, precos, pendencias ───────
-- Direto dos 16 documentos-base e da tabela da Etapa 7 do plano. Tudo
-- editavel pelo app depois — isto e so o ponto de partida.

create unique index if not exists equipment_name_idx on public.equipment (name);
insert into public.equipment (name, status, critical, notes) values
  ('Freio da foodbike', 'issue', true, 'Freio fraco — problema de seguranca ativo.'),
  ('Bateria do motor', 'issue', true, 'Descarrega apesar de indicar 100%.'),
  ('Colher de chocolate (principal)', 'broken', false, 'Quebrou durante a operacao.'),
  ('Colher de chocolate (reserva)', 'missing', false, 'Segunda colher — comprar.'),
  ('Material/QR Code TWINT', 'ok', false, null)
on conflict (name) do nothing;

create unique index if not exists suppliers_name_idx on public.suppliers (name);
insert into public.suppliers (name, product, contact, notes) values
  ('A confirmar — chocolate', 'Chocolate', null, 'Fornecedor e preco normal fora de promocao a confirmar.'),
  ('A confirmar — morango', 'Morango', null, 'Fornecedor a confirmar.'),
  ('A confirmar — copo', 'Copo 300ml rPET', null, 'Fornecedor a confirmar.')
on conflict (name) do nothing;

create unique index if not exists stock_items_name_idx on public.stock_items (name);
insert into public.stock_items (name, unit, quantity, low_stock_threshold, supplier_id, notes)
select 'Chocolate (pacote 2,5kg)', 'pacote', 0, 1, s.id, 'CHF 20/pacote, valor de partida — a confirmar.'
from public.suppliers s where s.name = 'A confirmar — chocolate'
union all
select 'Copo 300ml rPET', 'unidade', 0, 100, s.id, 'CHF 0.2367/un (300 por CHF 71, frete incluido).'
from public.suppliers s where s.name = 'A confirmar — copo'
union all
select 'Morango', 'kg', 0, 2, s.id, '≈CHF 9.17/kg (6kg por CHF 55 em 30.07.2026).'
from public.suppliers s where s.name = 'A confirmar — morango'
on conflict (name) do nothing;

insert into public.prices (item_key, value) values
  ('cup', 7.50),
  ('topping', 0.50)
on conflict (item_key) do nothing;

create unique index if not exists pendencies_seed_idx
  on public.pendencies (description) where origin = 'seed';
insert into public.pendencies (description, critical, status, origin) values
  ('Freio da foodbike com problema de seguranca', true, 'aberta', 'seed'),
  ('Bateria do motor descarregando apesar de indicar 100%', true, 'aberta', 'seed'),
  ('Comprar nova colher de chocolate', false, 'aberta', 'seed'),
  ('Providenciar material/QR Code TWINT', false, 'aberta', 'seed'),
  ('Identificar fornecedor do chocolate', false, 'aberta', 'seed'),
  ('Identificar fornecedor dos morangos', false, 'aberta', 'seed'),
  ('Identificar fornecedor dos copos', false, 'aberta', 'seed')
on conflict (description) where origin = 'seed' do nothing;


-- ── Seed — historico financeiro confirmado ───────────────────────────────
-- 18.07 e 15.08.2026, conforme documento 07. Receita de dinheiro/TWINT
-- dessas datas NAO entra aqui — ja existe como venda real em `sales`;
-- redigitar duplicaria. So o que sales nao guarda: aporte, compra e o
-- caixa contado no fim (que nao bate e fica marcado como tal).
do $$
begin
  if not exists (select 1 from public.expenses where occurred_at = '2026-07-18' and type = 'movimento_caixa') then
    insert into public.expenses (type, category, description, value, occurred_at)
    values ('movimento_caixa', 'operacional', 'Caixa inicial (aporte, nao receita)', 370.00, '2026-07-18');
  end if;

  if not exists (select 1 from public.expenses where occurred_at = '2026-08-15' and type = 'movimento_caixa') then
    insert into public.expenses (type, category, description, value, occurred_at)
    values ('movimento_caixa', 'operacional',
      'Caixa contado — a reconciliar: diferenca de CHF 172.40 nao confirmada (aporte/retirada/despesa em dinheiro desconhecidos)',
      789.10, '2026-08-15');
  end if;

  if not exists (select 1 from public.purchases where notes = 'seed:morangos-30.07') then
    with p as (
      insert into public.purchases (supplier_id, purchased_at, total, notes)
      select s.id, '2026-07-30', 55.00, 'seed:morangos-30.07'
      from public.suppliers s where s.name = 'A confirmar — morango'
      returning id
    ), item as (
      insert into public.purchase_items (purchase_id, stock_item_id, description, quantity, unit_cost)
      select p.id, si.id, 'Morangos', 6, 9.1667
      from p, public.stock_items si where si.name = 'Morango'
      returning purchase_id, stock_item_id, quantity
    )
    insert into public.stock_movements (stock_item_id, quantity_delta, reason, notes)
    select item.stock_item_id, item.quantity, 'compra', 'seed:morangos-30.07' from item;
  end if;
end $$;


-- ============================================================================
-- Etapa 8 do plano de execucao — Planejamento, calendario e site
-- Ver 02-Projetos/sunbite-ops/plano-execucao.md
--
-- places/events sao modulo administrativo: leitura e escrita completas so
-- para authenticated, mesmo padrao das etapas 6 e 7. Sem "for all": apagar
-- continua sendo ninguem — local usado antes nunca some, so arquiva.
--
-- O site (sunbite.ch) precisa ler as proximas aparicoes SEM sessao e SEM
-- enxergar fee/contact/notes de places nem os campos internos de events.
-- Por isso `public_events`: tabela separada, so as colunas publicas,
-- mantida por gatilho a partir de events — nao uma view sobre events, para
-- que o vazamento seja estruturalmente impossivel, nao so evitado por uma
-- policy bem escrita.
-- ============================================================================

-- Duas colunas que o schema ainda nao tinha e que este modulo precisa:
-- cidade (o site mostra local + cidade separados) e tipo do evento (o site
-- ja tem essa categoria em src/data/events.ts).
alter table public.places
  add column if not exists city text;

alter table public.events
  add column if not exists event_type text
  check (event_type in ('market', 'festival', 'popup', 'private'));

-- places
drop policy if exists places_select_auth on public.places;
create policy places_select_auth
  on public.places for select to authenticated using (true);
drop policy if exists places_insert_auth on public.places;
create policy places_insert_auth
  on public.places for insert to authenticated with check (true);
drop policy if exists places_update_auth on public.places;
create policy places_update_auth
  on public.places for update to authenticated using (true) with check (true);

-- events
drop policy if exists events_select_auth on public.events;
create policy events_select_auth
  on public.events for select to authenticated using (true);
drop policy if exists events_insert_auth on public.events;
create policy events_insert_auth
  on public.events for insert to authenticated with check (true);
drop policy if exists events_update_auth on public.events;
create policy events_update_auth
  on public.events for update to authenticated using (true) with check (true);


-- ── public_events — o que o site enxerga ────────────────────────────────
-- So as colunas que o site precisa. Sem place_id, sem fee/contact/notes:
-- o erro de vazar dado interno se torna impossivel, nao so evitado.
create table if not exists public.public_events (
  event_id   uuid primary key references public.events(id) on delete cascade,
  starts_at  timestamptz not null,
  label_en   text,
  label_de   text,
  city       text,
  event_type text,
  updated_at timestamptz not null default now()
);

alter table public.public_events enable row level security;

-- Mantem public_events sincronizada sozinha: uma linha existe aqui se, e so
-- se, o evento correspondente esta com is_public = true. Confirmado e
-- publico sao a mesma coisa aqui de proposito — o schema atual nao tem um
-- campo separado de "confirmado", e is_public ja e o unico sinalizador que
-- Felipe usa para dizer "isto pode aparecer para o publico".
create or replace function public.sync_public_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid := coalesce(new.id, old.id);
  ev record;
begin
  if tg_op = 'DELETE' or not exists (
    select 1 from public.events where id = target_id and is_public = true
  ) then
    delete from public.public_events where event_id = target_id;
    return coalesce(new, old);
  end if;

  select e.id, e.starts_at, e.label_en, e.label_de, e.event_type, p.city
    into ev
    from public.events e
    left join public.places p on p.id = e.place_id
    where e.id = target_id;

  insert into public.public_events (event_id, starts_at, label_en, label_de, city, event_type, updated_at)
  values (ev.id, ev.starts_at, ev.label_en, ev.label_de, ev.city, ev.event_type, now())
  on conflict (event_id) do update set
    starts_at  = excluded.starts_at,
    label_en   = excluded.label_en,
    label_de   = excluded.label_de,
    city       = excluded.city,
    event_type = excluded.event_type,
    updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists events_sync_public on public.events;
create trigger events_sync_public
  after insert or update or delete on public.events
  for each row execute function public.sync_public_event();

-- Leitura publica, sem sessao: evento passado some sozinho, sem ninguem
-- editar nada.
drop policy if exists public_events_select_anon on public.public_events;
create policy public_events_select_anon
  on public.public_events for select to anon
  using (starts_at > now() - interval '1 day');


-- ── Seed — locais e eventos do documento 10 ─────────────────────────────
create unique index if not exists places_name_idx on public.places (name);
insert into public.places (name, city, fee, contact, rating, notes) values
  ('Aarau/Aare', 'Aarau', null, null, 'testado', 'Testado em 18.07.2026.'),
  ('Musik in der Altstadt', 'Aarau', null, null, null, 'Oportunidade.'),
  ('Rooftop Aarau', 'Aarau', null, null, null, 'Convite.'),
  ('Street Food Aarau', 'Aarau', null, null, null, 'Prospeccao.'),
  ('A confirmar — venda 15.08', null, null, null, null, 'Local da venda de 15.08.2026 ainda nao confirmado.')
on conflict (name) do nothing;

-- events nao tem chave natural (id sempre gerado) — o indice abaixo e so
-- para o seed nao duplicar ao rodar este arquivo de novo.
create unique index if not exists events_place_starts_at_idx
  on public.events (place_id, starts_at);

insert into public.events (place_id, starts_at, label_en, label_de, is_public, event_type, notes)
select p.id, timestamptz '2026-07-18 10:00:00+02', 'Aarau/Aare Market', 'Aarau/Aare Markt', true, 'market', 'Testado — venda real registrada.'
from public.places p where p.name = 'Aarau/Aare'
on conflict (place_id, starts_at) do nothing;

insert into public.pendencies (description, critical, status, origin) values
  ('Confirmar local da venda de 15.08.2026', false, 'aberta', 'seed')
on conflict (description) where origin = 'seed' do nothing;


-- ============================================================================
-- Etapa 9 do plano de execucao — Entrada por conversa com IA
-- Ver 02-Projetos/sunbite-ops/plano-etapa-9.md
--
-- A IA NAO escreve nas tabelas de negocio. Ela so grava propostas aqui, em
-- ai_suggestions, com status 'pending'. Quem aplica na tabela real e o app,
-- no clique de "Aprovar" do Felipe — mesmo padrao do VisionFlow
-- (client_pending_updates). Card rejeitado nunca vira dado.
--
-- Isto e a excecao deliberada a DEC-2026-004 ("sem confirmacoes em lugar
-- nenhum"): e o unico lugar do app onde quem escreve nao e uma pessoa, e
-- sim a interpretacao de uma frase. O resto do app segue sem confirmacao.
--
-- ai_messages guarda o que foi dito e o que a IA entendeu — e o log que o
-- plano exige, e o que permite responder "por que ela gravou isso".
-- ============================================================================

create table if not exists public.ai_messages (
  id           uuid primary key default gen_random_uuid(),
  input_text   text not null,
  input_mode   text not null default 'text'
               check (input_mode in ('text', 'voice')),
  model        text,
  raw_response jsonb,
  error        text,
  created_by   uuid references public.profiles(id),
  device_id    uuid references public.devices(id),
  created_at   timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

-- target_table nao e FK nem enum do Postgres de proposito: a lista branca
-- de verdade vive na Edge Function (ALLOWED_FIELDS), que e quem sanitiza o
-- payload antes de gravar. O check aqui e a segunda barreira, nao a
-- primeira — se as duas discordarem, a insercao falha em vez de gravar
-- numa tabela que o app nao sabe aplicar.
create table if not exists public.ai_suggestions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.ai_messages(id) on delete cascade,
  target_table text not null
               check (target_table in (
                 'stock_movements', 'purchases', 'expenses', 'pendencies',
                 'equipment', 'suppliers', 'prices', 'places', 'events'
               )),
  operation    text not null default 'insert'
               check (operation in ('insert', 'update')),
  summary      text not null,
  payload      jsonb not null default '{}'::jsonb,
  uncertain    boolean not null default false,
  status       text not null default 'pending'
               check (status in ('pending', 'applied', 'rejected')),
  applied_id   uuid,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

alter table public.ai_suggestions enable row level security;

create index if not exists ai_suggestions_pending_idx
  on public.ai_suggestions (created_at desc)
  where status = 'pending';

create index if not exists ai_suggestions_message_idx
  on public.ai_suggestions (message_id);


-- ── Policies ─────────────────────────────────────────────────────────────
-- Modulo administrativo: so authenticated, mesmo padrao das etapas 6/7/8.
-- anon nao le nem escreve nada aqui — a tela de IA exige sessao.
--
-- Sem policy de delete: proposta rejeitada vira status 'rejected' e fica.
-- O rastro do que a IA sugeriu e nao foi aceito e justamente o que permite
-- corrigir o prompt depois.

drop policy if exists ai_messages_select on public.ai_messages;
create policy ai_messages_select on public.ai_messages
  for select to authenticated using (true);

drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_insert on public.ai_messages
  for insert to authenticated with check (true);

drop policy if exists ai_suggestions_select on public.ai_suggestions;
create policy ai_suggestions_select on public.ai_suggestions
  for select to authenticated using (true);

drop policy if exists ai_suggestions_insert on public.ai_suggestions;
create policy ai_suggestions_insert on public.ai_suggestions
  for insert to authenticated with check (true);

-- Update so para decidir (aprovar/rejeitar). O payload continua editavel
-- porque o Felipe pode corrigir um campo antes de aprovar — mesmo que o
-- VisionFlow ja faz em approve(id, editedPayload).
drop policy if exists ai_suggestions_update on public.ai_suggestions;
create policy ai_suggestions_update on public.ai_suggestions
  for update to authenticated using (true) with check (true);


-- ── Limpeza ──────────────────────────────────────────────────────────────
-- Proposta pendente que ninguem decidiu em 30 dias nao e mais proposta, e
-- lixo: o contexto da frase que a gerou ja se perdeu. Mesma poda de 30 dias
-- que o log local da Etapa 5 faz.
create or replace function public.prune_ai_suggestions()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_suggestions
     set status = 'rejected', decided_at = now()
   where status = 'pending'
     and created_at < now() - interval '30 days';
$$;


-- ============================================================================
-- Fatia 3 da V2 — corrigir venda
-- Ver 02-Projetos/sunbite-ops/plano-v2.md (Fatia 3, decisao 8) e PRD V2 6.3.
--
-- Ate aqui a unica saida para uma venda errada era cancelar, o que tira a
-- venda inteira dos totais. Se o erro foi o valor digitado ou o botao de
-- pagamento, cancelar destroi a informacao boa junto com a ruim.
-- ============================================================================

alter table public.sales add column if not exists original_total    numeric(6,2);
alter table public.sales add column if not exists correction_reason text;
alter table public.sales add column if not exists corrected_at      timestamptz;

-- Correcao segue o mesmo caminho anonimo do cancelamento, de proposito:
-- corrigir precisa funcionar no celular, na hora, sem internet e sem login —
-- igual a cancelar. Levar isto pela fila autenticada faria uma correcao feita
-- deslogada ficar presa para sempre, com o servidor guardando o valor errado.
--
-- A policy e estreita: UMA correcao por venda (corrected_at nulo -> nao nulo),
-- so em venda nao cancelada, com os mesmos limites de valor do insert.
drop policy if exists sales_correct_anon on public.sales;
create policy sales_correct_anon
  on public.sales for update to anon
  using (cancelled = false and corrected_at is null)
  with check (
    cancelled = false
    and corrected_at is not null
    and original_total is not null
    and correction_reason is not null
    and total >= 0 and total <= 500
    and payment in ('cash','twint')
  );

-- As policies de UPDATE se somam (OR): cancelar continua passando pela
-- sales_cancel_anon, corrigir passa por esta. Nenhuma das duas sozinha
-- permite o que a outra faz.
grant update (total, payment, original_total, correction_reason, corrected_at)
  on public.sales to anon;

-- Conferencia das correcoes:
-- select local_date, local_time, original_total, total, payment,
--        correction_reason, corrected_at
--   from public.sales where corrected_at is not null order by corrected_at desc;
