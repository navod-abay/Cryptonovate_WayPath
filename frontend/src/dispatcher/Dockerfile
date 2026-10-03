FROM node:20-alpine
WORKDIR /app

# Copy dispatcher app files
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

EXPOSE 4173

ENV HOST=0.0.0.0

CMD ["npm", "start"]
