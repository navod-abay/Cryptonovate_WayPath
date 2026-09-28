FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services/fleet-directory ./services/fleet-directory

RUN npm ci

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/services/fleet-directory
RUN npm run build

EXPOSE 3004
CMD ["npm", "run", "dev"]