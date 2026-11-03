# syntax=docker/dockerfile:1
# Python functions build on this: COPY handler.py /app/
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.7,source=/uv,target=/bin/uv \
    uv pip install --system --no-cache pyarrow==21.0.0
WORKDIR /app
ENTRYPOINT ["python", "/app/handler.py"]
