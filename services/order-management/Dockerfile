FROM node:20-alpine
WORKDIR /app

# Build context is this service's folder only (fully isolated)
COPY package.json package-lock.json ./
RUN rm -f package-lock.json && npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# The listening port is not baked into the image: it comes from PORT at runtime
# (docker-compose / the host sets it and publishes it).
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

# Starts in dev mode (ts-node-dev watches /app/src, mounted by docker-compose)
CMD ["npm", "run", "dev"]
