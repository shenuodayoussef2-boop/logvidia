
create extension if not exists pgcrypto;

create table public.products (
    woo_id bigint primary key,
    name text not null,
    slug text,
    permalink text,
    description text,
    image_url text,
    price numeric(12,2),
    currency_code text default 'EGP',
    is_in_stock boolean default false,
    updated_at timestamptz default now()
);

create table public.chat_logs (
    id uuid primary key default gen_random_uuid(),
    session_id text not null,
    question text not null,
    answer text not null,
    created_at timestamptz default now()
);

create index products_name_idx
on public.products using gin (
    to_tsvector('simple', coalesce(name, ''))
);

create index chat_logs_date_idx
on public.chat_logs (created_at desc);

alter table public.products enable row level security;
alter table public.chat_logs enable row level security;

revoke all on public.products from anon, authenticated;
revoke all on public.chat_logs from anon, authenticated;
