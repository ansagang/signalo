-- The persona editor has always shown a Model selector, but the column was
-- never created — saving it silently dropped the value.
alter table public.personas
  add column if not exists model text not null default 'claude';

-- preset_id was NOT NULL with no default, so every insert that did not
-- invent one failed. It is only ever a provenance marker.
alter table public.personas
  alter column preset_id set default 'custom';

update public.personas set model = 'claude' where model is null;
