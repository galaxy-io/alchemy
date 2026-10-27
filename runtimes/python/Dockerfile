# syntax=docker/dockerfile:1
# Python functions build on this: COPY handler.py /app/
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN pip install --no-cache-dir pyarrow==21.0.0
WORKDIR /app
ENTRYPOINT ["python", "/app/handler.py"]
