FROM node:20-alpine
WORKDIR /app/src/dispatcher

# Build context is frontend, including the existing shared UI package.
COPY packages/ui /app/packages/ui
COPY src/dispatcher/package.json src/dispatcher/package-lock.json ./
RUN npm ci
# Shared source files resolve React/types through their frontend ancestor.
RUN ln -s /app/src/dispatcher/node_modules /app/node_modules
COPY src/dispatcher .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_LOGIN_MODE
ENV VITE_LOGIN_MODE=$VITE_LOGIN_MODE
RUN npm run build

EXPOSE 4173
CMD ["npm", "start", "--", "--host", "0.0.0.0"]
