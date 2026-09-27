-- Add the anatomy structure attached to each chat session.
-- Run this once for an existing database after chat_schema.sql.

alter table public.chat_conversations
  add column if not exists target_organ_id text,
  add column if not exists target_organ_name text;
