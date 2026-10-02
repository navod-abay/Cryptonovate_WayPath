FROM node:20-alpine
WORKDIR /app

# Build context is this service's folder only (fully isolated)
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health > /dev/null || exit 1

# Starts in dev mode (ts-node-dev watches /app/src, mounted by docker-compose)
CMD ["npm", "run", "dev"]
