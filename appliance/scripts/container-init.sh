#!/bin/sh
set -eu

attempt=1
while ! bun run db:migrate; do
  if [ "$attempt" -ge 30 ]; then
    echo "database migration did not succeed after 30 attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

sleep 2
exec bun run db:seed-local
