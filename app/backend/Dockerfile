# ─── Development stage ───────────────────────────────────────────────────────
FROM python:3.12-slim AS development

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl default-jre-headless && \
    rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv==0.5.9

WORKDIR /workspace
COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]"

ENV PYTHONPATH=/workspace
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production stage ────────────────────────────────────────────────────────
FROM python:3.12-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl default-jre-headless && \
    rm -rf /var/lib/apt/lists/*

RUN pip install uv==0.5.9

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system .
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN chown -R appuser:appuser /app
USER appuser

ENV PYTHONPATH=/app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -fk https://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--ssl-keyfile", "/ssl/current.key", "--ssl-certfile", "/ssl/current.crt"]
