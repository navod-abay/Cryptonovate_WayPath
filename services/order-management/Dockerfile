FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services/order-management ./services/order-management

RUN npm ci

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/services/order-management
RUN npm run build

EXPOSE 3002
CMD ["npm", "run", "dev"]