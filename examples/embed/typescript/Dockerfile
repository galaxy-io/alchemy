# Node 24 runs TypeScript directly by stripping types; no compile step.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY handler.ts ./
ENTRYPOINT ["node", "/app/handler.ts"]
