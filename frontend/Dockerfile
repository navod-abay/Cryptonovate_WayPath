FROM node:20-alpine
WORKDIR /app

# Build context is the frontend folder only (fully isolated)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "dev"]
