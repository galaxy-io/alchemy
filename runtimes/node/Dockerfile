# syntax=docker/dockerfile:1
# TypeScript and JavaScript functions build on this: COPY handler.ts /app/
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
ENTRYPOINT ["node", "/app/handler.ts"]
