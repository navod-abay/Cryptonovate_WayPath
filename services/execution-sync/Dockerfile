FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services/execution-sync ./services/execution-sync

RUN npm ci

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/services/execution-sync
RUN npm run build

EXPOSE 3005
CMD ["npm", "run", "dev"]