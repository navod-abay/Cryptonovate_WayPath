FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services/analytics-prediction ./services/analytics-prediction

RUN npm ci

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/services/analytics-prediction
RUN npm run build

EXPOSE 3006
CMD ["npm", "run", "dev"]