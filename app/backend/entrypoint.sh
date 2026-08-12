#!/bin/sh
set -e

# Only run migrations for the API server.
# Celery worker and beat do NOT run migrations — the API container handles
# schema upgrades, and running alembic from multiple containers simultaneously
# can cause lock contention or crash-loop if the DB is briefly unreachable.
case "$1" in
  celery)
    echo "Celery process — skipping database migrations."
    ;;
  *)
    echo "Running database migrations..."
    alembic upgrade head
    echo "Database migrations complete."
    ;;
esac

echo "Starting: $*"
exec "$@"
