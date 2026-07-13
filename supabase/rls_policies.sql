-- ============================================================
-- RLS policies for barakhoevica / biosina
-- Выполнить в Supabase Dashboard → SQL Editor
--
-- Идея: анонимный браузер (anon key) может только читать (SELECT)
-- таблицы products и reviews. INSERT/UPDATE/DELETE с этим ключом
-- запрещены на уровне базы данных — независимо от того, что
-- отправляет фронтенд. Изменения возможны только через service_role
-- ключ, который используется исключительно внутри Edge Functions
-- и никогда не попадает в браузер.
-- ============================================================

-- 1. Включаем RLS на обеих таблицах
alter table public.products enable row level security;
alter table public.reviews  enable row level security;

-- 2. На всякий случай удаляем старые политики с этими именами,
--    если скрипт запускается повторно
drop policy if exists "public_read_products" on public.products;
drop policy if exists "public_read_reviews"  on public.reviews;

-- 3. Публичное чтение (нужно для витрины и карусели отзывов)
create policy "public_read_products"
  on public.products
  for select
  to anon, authenticated
  using (true);

-- Отзывы: публично видны только одобренные (status = 'approved').
-- Отзывы посетителей попадают в таблицу через submit-review со статусом
-- 'pending' и не видны, пока администратор их не одобрит.
alter table public.reviews add column if not exists status text not null default 'pending';

-- Уже существующие в таблице отзывы были опубликованы и видны и раньше —
-- переводим их в 'approved', чтобы они не пропали с сайта после миграции.
update public.reviews set status = 'approved' where status = 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_status_check'
  ) then
    alter table public.reviews
      add constraint reviews_status_check check (status in ('pending','approved'));
  end if;
end $$;

create policy "public_read_reviews"
  on public.reviews
  for select
  to anon, authenticated
  using (status = 'approved');

-- 4. INSERT / UPDATE / DELETE политик для anon/authenticated
--    сознательно НЕ создаём. При включённом RLS без политики
--    на операцию — операция запрещена для всех, кроме service_role
--    (service_role полностью обходит RLS и используется только
--    внутри Edge Function admin-action).
--
-- Итог:
--   SELECT  -> разрешено всем (anon key из браузера)
--   INSERT  -> запрещено анонимному ключу
--   UPDATE  -> запрещено анонимному ключу
--   DELETE  -> запрещено анонимному ключу
--   Всё вышеперечисленное разрешено только service_role внутри
--   Edge Function admin-action, после проверки JWT администратора.
