-- Per-trip graduated autonomy for the agentic layer (L1 Suggest … L4 Pre-authorised).
-- Idempotent: matches the block in supabase/schema.sql.
alter table public.trips add column if not exists autonomy_level text not null default 'L1';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trips_autonomy_level_check') then
    alter table public.trips add constraint trips_autonomy_level_check
      check (autonomy_level in ('L1','L2','L3','L4'));
  end if;
end $$;
