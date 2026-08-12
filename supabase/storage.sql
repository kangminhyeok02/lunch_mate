-- LUNCH MATE — 메뉴 사진 보관함
-- Supabase Studio → SQL Editor → New query → 붙여넣고 Run
--
-- migration.sql 과 마찬가지로 여러 번 실행해도 안전합니다.

-- 공개 버킷: 참가자가 로그인 없이 사진을 봐야 하므로 public = true
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 읽기는 누구나, 쓰기도 anon 키로 가능하게 둔다.
-- 업로드 엔드포인트가 ADMIN_PASSWORD 로 이미 막혀 있으므로 실제 관문은 앱에 있다.
-- 더 조이려면 SUPABASE_SERVICE_ROLE_KEY 를 설정하고 아래를 to service_role 로 바꾼다.
drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists menu_images_write on storage.objects;
create policy menu_images_write
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'menu-images');

drop policy if exists menu_images_update on storage.objects;
create policy menu_images_update
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'menu-images')
  with check (bucket_id = 'menu-images');

drop policy if exists menu_images_delete on storage.objects;
create policy menu_images_delete
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'menu-images');
