-- PowerCouple CRM — Supabase (Postgres) schema
-- Firestore-compatible document store. The application talks to this table through
-- lib/supabase/firestoreShim.ts, which mimics the Firestore Admin SDK surface.
--
-- A "collection" is identified by its path (e.g. "leads" or
-- "whatsappChats/972500000000/thread_messages"). Each document row stores its full
-- path, the parent collection path, the collection's last segment (for collectionGroup
-- queries), and its JSON body.

create table if not exists fs_documents (
  path            text primary key,
  collection_path text not null,
  collection_id   text not null,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_fs_collection_path on fs_documents (collection_path);
create index if not exists idx_fs_collection_id   on fs_documents (collection_id);
create index if not exists idx_fs_data_gin        on fs_documents using gin (data jsonb_path_ops);

-- The shim connects with the service role (direct Postgres connection string),
-- so row level security is not required for app access. Enable + lock down anyway
-- so the table is never exposed through the public PostgREST/anon API.
alter table fs_documents enable row level security;
-- (no policies = no anon/auth access; service-role bypasses RLS)
