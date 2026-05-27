# ─── Development stage ───────────────────────────────────────────────────────
FROM python:3.12-slim AS development

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
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
    postgresql-client && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
RUN python -c "import alembic; print('alembic ok')"

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Yedek dizinini oluştur ve izinleri ayarla (volume mount edilse dahi)
RUN mkdir -p /app/backups && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
