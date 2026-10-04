FROM node:20-alpine
WORKDIR /app

# Build context is this service's folder only (fully isolated)
COPY package.json package-lock.json ./
RUN rm -f package-lock.json && npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
# One driver per vehicle, read by src/db/seed.ts at boot
COPY seed-data ./seed-data
RUN npm run build

# Starts in dev mode (ts-node-dev watches /app/src, mounted by docker-compose)
EXPOSE 5001
CMD ["npm", "run", "dev"]
