# Stage 1: Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production Lean Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

# Non-root security compliance
USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
