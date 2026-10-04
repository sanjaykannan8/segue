FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.0 /uv /usr/local/bin/uv
# A font for the text on the route map (the slim image ships none).
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home segue
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
# Exactly the versions in uv.lock: a build never picks up a newer release by itself.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
USER segue
CMD ["uvicorn", "segue.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
