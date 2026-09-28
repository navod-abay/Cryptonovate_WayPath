FROM node:20-alpine AS base
WORKDIR /app

# 1. Copy workspace manifests from repo root (needed for npm ci)
COPY package.json package-lock.json* ./

# 2. Copy frontend source
COPY frontend ./frontend

# 3. Install dependencies (uses root package-lock.json)
WORKDIR /app/frontend
RUN npm ci

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["npm", "run", "dev"]
