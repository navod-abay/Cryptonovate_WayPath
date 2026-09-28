FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services/planning-allocation ./services/planning-allocation

RUN npm ci

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/services/planning-allocation
RUN npm run build

EXPOSE 3003
CMD ["npm", "run", "dev"]