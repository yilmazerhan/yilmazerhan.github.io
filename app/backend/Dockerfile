# ─── Development stage ───────────────────────────────────────────────────────
FROM python:3.12-slim AS development

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    postgresql-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production stage ────────────────────────────────────────────────────────
FROM python:3.12-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    postgresql-client && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
# Install from the committed lockfile, not the open version ranges in
# pyproject.toml. Previously uv.lock was committed but never used by the build, so
# two builds of the same commit could ship different dependency versions, rollback
# could not reproduce a known-good set, and a bad upstream release entered
# production automatically on the next `update.sh`. `uv export` emits fully pinned
# requirements with hashes, so pip runs in --require-hashes mode.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv==0.8.17 && \
    uv export --frozen --no-dev --no-emit-project -o /tmp/requirements.txt && \
    pip install --no-cache-dir -r /tmp/requirements.txt && \
    pip install --no-cache-dir --no-deps . && \
    pip uninstall -y uv && \
    rm /tmp/requirements.txt
RUN python -c "import alembic; print('alembic ok')"

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .
COPY entrypoint.sh ./entrypoint.sh

# Yedek dizinini oluştur ve izinleri ayarla (volume mount edilse dahi)
RUN mkdir -p /app/backups && chmod +x /app/entrypoint.sh && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
