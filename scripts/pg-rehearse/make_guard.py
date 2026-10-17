#!/usr/bin/env python3
"""Wrap a migration in the guarded apply script George pastes into the Supabase SQL editor.

    scripts/pg-rehearse/make_guard.py supabase/migrations/0029_takeover_units.sql > /path/to/apply-0029.sql

The script refuses when the latest applied migration is not the previous number, when this number is already
present, or when the md5 of the embedded SQL differs from the file's (trailing newline stripped), and records
the migration in supabase_migrations.schema_migrations when it applies. Run it twice and the second run is
refused with "latest applied migration is NNNN" — which means it already applied, not that it failed.
"""
import hashlib
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
name = path.stem                      # 0029_takeover_units
version, mig_name = name.split("_", 1)
previous = f"{int(version) - 1:04d}"
sql = path.read_text().rstrip("\n")
md5 = hashlib.md5(sql.encode()).hexdigest()
tag = "mig"
while f"${tag}$" in sql:
    tag += "x"

print(f"""-- Guarded apply for {name} (md5 {md5[:8]}…). Paste into the Supabase SQL editor and run once.
do $guard$
declare
  v_latest text;
  v_sql text := ${tag}${sql}${tag}$;
begin
  select max(version) into v_latest from supabase_migrations.schema_migrations;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '{version}') then
    raise exception 'Refused: {version} is already applied (nothing changed).';
  end if;
  if v_latest is distinct from '{previous}' then
    raise exception 'Refused: latest applied migration is %, expected {previous} (nothing changed). If it says {version}, this already applied.', v_latest;
  end if;
  if md5(v_sql) <> '{md5}' then
    raise exception 'Refused: embedded SQL does not match {name} (md5 %) (nothing changed).', md5(v_sql);
  end if;
  execute v_sql;
  insert into supabase_migrations.schema_migrations (version, name, statements) values ('{version}', '{mig_name}', array[v_sql]);
  raise notice 'Applied {name} (md5 {md5[:8]}).';
end $guard$;""")
