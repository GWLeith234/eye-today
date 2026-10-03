#!/usr/bin/env bash
# Starts the local Supabase stack used by the full Playwright suite and writes
# its env file. GoTrue has to be running: the app validates sessions with
# auth.getUser(), and the migrations write to auth.users and storage.buckets.
# A plain Postgres container cannot serve those. Unused containers are left off
# so CI stays closer to the time budget.
set -euo pipefail

out="${1:-supabase.env}"
# Names the CLI accepts. Auth, the database and storage stay up: sessions call
# GoTrue, and the migrations insert storage.buckets. The pooler is already off
# in config.toml, so it is not named here.
exclude="studio,imgproxy,edge-runtime,logflare,vector,realtime"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is not installed" >&2
  exit 1
fi

supabase start -x "$exclude"
supabase status -o env >"$out"
echo "Wrote $out"
