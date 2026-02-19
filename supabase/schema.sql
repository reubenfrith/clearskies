-- ClearSkies — Supabase schema
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── sites ────────────────────────────────────────────────────────────────────
-- One row per job site. Manually populated via Supabase dashboard or seed script.
create table if not exists sites (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  address          text,
  lat              float not null,
  lng              float not null,
  geotab_zone_id   text not null unique,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table sites is 'Active job sites monitored by the ClearSkies agent.';
comment on column sites.geotab_zone_id is 'Zone ID from MyGeotab → Administration → Zones.';

-- ─── holds_log ────────────────────────────────────────────────────────────────
-- One row per weather work hold event (open until all_clear_at is set).
create table if not exists holds_log (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references sites(id) on delete cascade,
  triggered_at       timestamptz not null,
  trigger_rule       text not null,           -- OshaRule enum value
  weather_snapshot   jsonb not null,          -- WeatherSnapshot at time of breach
  vehicles_on_site   jsonb not null,          -- VehicleOnSite[] confirmed on site
  hold_duration_mins int,                     -- null = hold until condition clears
  all_clear_at       timestamptz,             -- null = hold still active
  issued_by          text not null default 'auto', -- 'auto' | user email for manual holds
  notifications_sent jsonb,                   -- NotificationRecord[] (populated on all-clear)
  created_at         timestamptz not null default now()
);

comment on table holds_log is 'OSHA weather work hold records. Open holds have all_clear_at = NULL.';
comment on column holds_log.trigger_rule is 'One of: LIGHTNING_30_30, HIGH_WIND_GENERAL, HIGH_WIND_MATERIAL_HANDLING, EXTREME_HEAT';
comment on column holds_log.vehicles_on_site is 'Snapshot of vehicles confirmed inside the Geotab zone at hold creation time.';

-- Index for fast "is there an active hold?" lookups
create index if not exists holds_log_site_active_idx
  on holds_log (site_id, triggered_at desc)
  where all_clear_at is null;

-- ─── notification_log ─────────────────────────────────────────────────────────
-- One row per SMS sent — both hold alerts and all-clear alerts.
create table if not exists notification_log (
  id            uuid primary key default gen_random_uuid(),
  hold_id       uuid not null references holds_log(id) on delete cascade,
  driver_name   text,
  phone_number  text not null,
  message_type  text not null check (message_type in ('hold', 'all_clear')),
  sent_at       timestamptz not null,
  twilio_sid    text,
  status        text,
  created_at    timestamptz not null default now()
);

comment on table notification_log is 'Record of every SMS dispatched by ClearSkies (hold alerts and all-clears).';

create index if not exists notification_log_hold_idx on notification_log (hold_id);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- The agent uses the service role key (bypasses RLS).
-- The add-in frontend uses the anon key — read-only access to all tables,
-- write access to holds_log for manual holds/all-clears issued from the UI.

alter table sites enable row level security;
alter table holds_log enable row level security;
alter table notification_log enable row level security;

-- Public read (the add-in is embedded inside MyGeotab, auth handled by Geotab)
create policy "anon_read_sites" on sites
  for select using (true);

create policy "anon_read_holds" on holds_log
  for select using (true);

create policy "anon_read_notifications" on notification_log
  for select using (true);

-- Add-in can insert/update holds (manual holds & all-clears from the dashboard)
create policy "anon_insert_holds" on holds_log
  for insert with check (true);

create policy "anon_update_holds" on holds_log
  for update using (true);

-- ─── Seed: example sites (replace with real zone IDs) ────────────────────────
-- Uncomment and edit before running in your Supabase project.
-- insert into sites (name, address, lat, lng, geotab_zone_id) values
--   ('Site A — Downtown Tower',  '123 Main St, Chicago, IL',   41.8781, -87.6298, 'zABCDE12345'),
--   ('Site B — Riverside Bridge', '456 River Rd, Chicago, IL', 41.8827, -87.6233, 'zFGHIJ67890'),
--   ('Site C — North Suburb',    '789 Oak Ave, Evanston, IL',  42.0451, -87.6877, 'zKLMNO11111');
