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
ENV PORT=3002

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Non-root security compliance
USER node

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health > /dev/null || exit 1

CMD ["node", "dist/index.js"]
