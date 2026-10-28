-- =====================================================================
--  K-CORE · Монтаж: що потрібно на завтра — списком зі складу (18.10.2026)
--
--  У звіті бригада вибирає позиції з довідника складу (пошук з першої
--  літери, одразу видно, скільки є в наявності) і вказує кількість.
--  Чого немає в довіднику — пише своїми словами (nomenclature_id = null).
--  Вільний текст «що потрібно» (installer_reports.need_tomorrow) лишається
--  для решти.
--
--  v_pick_nomenclature — довідник для вибору: назва з характеристиками,
--  одиниця, категорія, доступно на всіх складах (без резерву).
--  Нею ж вибирається кабель у кроці «Кабель» (категорії «Кабель», «Провід»).
-- =====================================================================

create table if not exists public.installer_report_needs (
  id               bigserial primary key,
  report_id        bigint not null references public.installer_reports(id) on delete cascade,
  nomenclature_id  bigint references public.nomenclature(id) on delete set null,
  name             text not null check (length(btrim(name)) > 0),
  quantity         numeric check (quantity is null or quantity > 0),
  unit             text,
  created_at       timestamptz not null default now()
);
create index if not exists installer_report_needs_report_idx on public.installer_report_needs (report_id);

create or replace view public.v_pick_nomenclature
with (security_invoker = true) as
select n.id,
       btrim(n.name || coalesce(' ' || nullif(btrim(n.technical_characteristics), ''), '')) as name,
       n.brand,
       n.model,
       lower(coalesce(u.code, u.name, '')) as unit,
       n.category_id,
       c.name as category_name,
       coalesce(s.available, 0) as available
  from public.nomenclature n
  left join public.units u on u.id = n.unit_id
  left join public.categories c on c.id = n.category_id
  left join (
        select nomenclature_id, sum(quantity_available) as available
          from public.v_warehouse_stock_available
         group by nomenclature_id
       ) s on s.nomenclature_id = n.id
 where n.is_active and n.archived_at is null and n.merged_into_id is null;
