-- Persistent AI chat
-- Run this after the existing schema.sql in the Supabase SQL editor.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'New anatomy chat',
  target_organ_id text,
  target_organ_name text,
  selected_structure_id text,
  selected_structure_name text,
  mode text not null default 'chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null,
  content text not null default '',
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),

  constraint chat_messages_role_valid
    check (role in ('user', 'assistant', 'system')),

  constraint chat_messages_parts_array
    check (jsonb_typeof(parts) = 'array')
);

create index if not exists chat_conversations_user_updated_idx
on public.chat_conversations(user_id, updated_at desc);

create index if not exists chat_messages_conversation_created_idx
on public.chat_messages(conversation_id, created_at asc);

create or replace function public.update_chat_conversation_timestamp()
returns trigger
language plpgsql
as $$
begin
  update public.chat_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_updated_conversation on public.chat_messages;

create trigger chat_messages_updated_conversation
after insert on public.chat_messages
for each row
execute function public.update_chat_conversation_timestamp();

grant select, insert, update, delete
on public.chat_conversations, public.chat_messages
to anon, authenticated;

-- MVP permissions match the existing notes and quiz tables.
alter table public.chat_conversations disable row level security;
alter table public.chat_messages disable row level security;
