-- =====================================================================
--  K-CORE · Курс у кожному платежі
--
--  Раніше курс зберігався лише тоді, коли валюта платежу інша, ніж
--  валюта угоди (його треба для перерахунку), а в решті платежів база
--  його стирала. Тепер курс дня зберігається завжди — як довідка
--  «за яким курсом прийшли гроші». Перерахунок не змінюється:
--  та сама валюта → зараховується сума як є.
--
--  Перед зміною: копія payment_history → backup.payment_history_20261020
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.payment_history_20261020 as table public.payment_history;

create or replace function public.payment_history_prepare()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
    v_cur text;
begin
    select currency into v_cur from installations where custom_id = NEW.installation_custom_id;
    v_cur := coalesce(v_cur, 'USD');
    NEW.currency := coalesce(NEW.currency, v_cur);

    if NEW.currency = v_cur then
        -- Та сама валюта: зараховуємо як є, курс лишаємо як довідку
        NEW.amount_object := NEW.amount;
    elsif NEW.exchange_rate is null then
        raise exception 'Угода в %, а платіж у %: вкажіть курс (гривень за 1 долар)',
            case v_cur when 'USD' then 'доларах' else 'гривнях' end,
            case NEW.currency when 'USD' then 'доларах' else 'гривнях' end
            using errcode = 'P0001';
    elsif NEW.currency = 'UAH' and v_cur = 'USD' then
        NEW.amount_object := round(NEW.amount / NEW.exchange_rate, 2);
    else
        NEW.amount_object := round(NEW.amount * NEW.exchange_rate, 2);
    end if;

    return NEW;
end $$;
