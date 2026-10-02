FROM node:20-alpine
WORKDIR /app

# Build context is this service's folder only (fully isolated)
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Starts in dev mode (ts-node-dev watches /app/src, mounted by docker-compose)
EXPOSE 3004
CMD ["npm", "run", "dev"]
