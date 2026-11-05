-- =====================================================================
--  Курс під угоду, а не один на всю програму
--
--  Власник 05.11: «курс має бути не загальний на всю програму, а під
--  угоду: почалась угода — курс такий; наступна через тиждень — уже
--  інший». Тож:
--   • installations.exchange_rate — курс угоди, грн за 1 $. Нова угода
--     сама бере поточний курс (app_settings.usd_uah_rate) у момент
--     створення й далі його тримає: зміна поточного курсу старих угод
--     не чіпає. Змінити курс угоди можна в її картці.
--   • Старим угодам курс НЕ підтягуємо (власник: «не мають — та й не
--     мають»): поки курсу немає, розрахунки беруть поточний.
--   • Прибуток (v_object_profit) і собівартість матеріалів
--     (v_object_materials_cost) — за курсом своєї угоди.
--
--  Копія до змін: backup.installations_20261105
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.installations_20261105 as
    select * from public.installations;

alter table public.installations
    add column if not exists exchange_rate numeric(12, 4);
comment on column public.installations.exchange_rate is
    'Курс угоди: грн за 1 $. Нова угода бере поточний курс у момент створення; змінюється лише вручну в картці';

-- Поточний курс (той, що в «Налаштуваннях»): ним заповнюються нові угоди
create or replace function public.current_usd_rate()
returns numeric
language sql
stable
as $$
    select coalesce(
        (select nullif(value ->> 'rate', '')::numeric from public.app_settings where key = 'usd_uah_rate'),
        41.5)
$$;

-- Нова угода — з поточним курсом (якщо його не вказали самі)
create or replace function public.installations_deal_rate()
returns trigger
language plpgsql
as $$
begin
    if NEW.exchange_rate is null or NEW.exchange_rate <= 0 then
        NEW.exchange_rate := public.current_usd_rate();
    end if;
    return NEW;
end $$;

drop trigger if exists trg_installations_deal_rate on public.installations;
create trigger trg_installations_deal_rate
    before insert on public.installations
    for each row execute function public.installations_deal_rate();

-- Собівартість матеріалів об'єкта — долари за курсом угоди
create or replace view public.v_object_materials_cost as
with r as (
    select public.current_usd_rate() as usd
), q as (
    select stock_movements.installation_custom_id,
           stock_movements.nomenclature_id,
           sum(case when stock_movements.operation_type = 'return'::stock_operation_type
                    then - stock_movements.quantity else stock_movements.quantity end) as qty
      from stock_movements
     where stock_movements.installation_custom_id is not null
       and stock_movements.operation_type = any (array['issue'::stock_operation_type, 'return'::stock_operation_type])
     group by stock_movements.installation_custom_id, stock_movements.nomenclature_id
)
select q.installation_custom_id,
       q.nomenclature_id,
       n.name,
       n.brand,
       u.name as unit_name,
       q.qty,
       n.cost_price,
       n.cost_currency,
       case when n.cost_price is null then null::numeric
            when n.cost_currency = 'USD' then n.cost_price * coalesce(i.exchange_rate, r.usd)
            else n.cost_price end as unit_cost_uah,
       q.qty * case when n.cost_price is null then null::numeric
                    when n.cost_currency = 'USD' then n.cost_price * coalesce(i.exchange_rate, r.usd)
                    else n.cost_price end as amount_uah
  from q
  join nomenclature n on n.id = q.nomenclature_id
  left join units u on u.id = n.unit_id
  left join installations i on i.custom_id = q.installation_custom_id
  cross join r
 where q.qty <> 0::numeric;

-- Прибуток об'єкта — виручка, витрати й план за курсом угоди
create or replace view public.v_object_profit as
with r as (
    select public.current_usd_rate() as usd
), ir as (
    select i.custom_id, coalesce(i.exchange_rate, r.usd) as usd
      from installations i cross join r
), m as (
    select v_object_materials_cost.installation_custom_id,
           sum(v_object_materials_cost.amount_uah) as materials_uah,
           count(*) as materials_items,
           count(*) filter (where v_object_materials_cost.cost_price is null) as materials_missing
      from v_object_materials_cost
     group by v_object_materials_cost.installation_custom_id
), l as (
    select v_object_labour_cost.installation_custom_id,
           sum(v_object_labour_cost.days) as labour_days,
           sum(v_object_labour_cost.amount_uah) as labour_uah,
           count(*) filter (where v_object_labour_cost.day_rate is null) as labour_missing
      from v_object_labour_cost
     group by v_object_labour_cost.installation_custom_id
), x as (
    select e.installation_custom_id,
           sum(case when e.currency = 'USD' then e.amount * ir.usd else e.amount end) as expenses_uah,
           count(*) as expenses_items
      from object_expenses e
      join ir on ir.custom_id = e.installation_custom_id
     group by e.installation_custom_id
), p as (
    select nd.installation_custom_id,
           sum(nd.required_quantity * case when n.cost_currency = 'USD' then n.cost_price * ir.usd else n.cost_price end)
               filter (where n.cost_price is not null) as plan_materials_uah,
           count(*) filter (where n.cost_price is null) as plan_missing
      from v_object_material_needs nd
      join nomenclature n on n.id = nd.nomenclature_id
      join ir on ir.custom_id = nd.installation_custom_id
     group by nd.installation_custom_id
), base as (
    select i.custom_id as installation_custom_id,
           i.name,
           i.status,
           i.workflow_stage,
           i.created_at,
           i.end_date,
           coalesce(i.currency, 'USD') as currency,
           i.total_cost,
           ir.usd as usd_rate,
           case when coalesce(i.currency, 'USD') = 'USD' then coalesce(i.total_cost, 0::numeric) * ir.usd
                else coalesce(i.total_cost, 0::numeric) end as revenue_uah,
           coalesce(m.materials_uah, 0::numeric) as materials_uah,
           coalesce(m.materials_items, 0::bigint) as materials_items,
           coalesce(m.materials_missing, 0::bigint) as materials_missing,
           coalesce(l.labour_days, 0::numeric) as labour_days,
           coalesce(l.labour_uah, 0::numeric) as labour_uah,
           coalesce(l.labour_missing, 0::bigint) as labour_missing,
           coalesce(x.expenses_uah, 0::numeric) as expenses_uah,
           coalesce(x.expenses_items, 0::bigint) as expenses_items,
           p.plan_materials_uah,
           coalesce(p.plan_missing, 0::bigint) as plan_missing
      from installations i
      join ir on ir.custom_id = i.custom_id
      left join m on m.installation_custom_id = i.custom_id
      left join l on l.installation_custom_id = i.custom_id
      left join x on x.installation_custom_id = i.custom_id
      left join p on p.installation_custom_id = i.custom_id
     where coalesce(i.is_subcontract, false) = false
)
select installation_custom_id,
       name,
       status,
       workflow_stage,
       created_at,
       end_date,
       currency,
       total_cost,
       usd_rate,
       revenue_uah,
       materials_uah,
       materials_items,
       materials_missing,
       labour_days,
       labour_uah,
       labour_missing,
       expenses_uah,
       expenses_items,
       plan_materials_uah,
       plan_missing,
       materials_uah + labour_uah + expenses_uah as cost_uah,
       revenue_uah - (materials_uah + labour_uah + expenses_uah) as profit_uah,
       case when revenue_uah > 0::numeric
            then round((revenue_uah - (materials_uah + labour_uah + expenses_uah)) / revenue_uah * 100::numeric, 1)
            else null::numeric end as margin_pct,
       case when plan_materials_uah is not null and revenue_uah > 0::numeric
            then revenue_uah - plan_materials_uah
            else null::numeric end as plan_profit_before_labour_uah
  from base;
