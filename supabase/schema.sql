-- BB28 Fantasy Pool · run this once in Supabase → SQL Editor
create table if not exists pool_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table pool_state enable row level security;

-- Friends-pool trust model: anyone with the link can read and write pool data.
create policy "pool read"   on pool_state for select using (true);
create policy "pool insert" on pool_state for insert with check (true);
create policy "pool update" on pool_state for update using (true);

-- ——— House Chat image uploads ———
-- Public bucket for photos/memes dropped into the chat. Same honor-system
-- trust model: anyone with the link (anon key) can upload and view.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', true, 10485760)  -- 10 MB cap
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "chat media read"   on storage.objects;
drop policy if exists "chat media insert" on storage.objects;
create policy "chat media read"   on storage.objects for select using (bucket_id = 'chat-media');
create policy "chat media insert" on storage.objects for insert with check (bucket_id = 'chat-media');
