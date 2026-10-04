FROM node:20-alpine
WORKDIR /app/src/loader

# Build context is frontend, including the shared UI package (aliased in vite.config.ts).
COPY packages/ui /app/packages/ui
COPY src/loader/package.json src/loader/package-lock.json ./
RUN npm ci
# Shared source files resolve React/types through their frontend ancestor.
RUN ln -s /app/src/loader/node_modules /app/node_modules
COPY src/loader .
# The gateway origin (the app appends /api/<service>) and the depot this kiosk stands in.
ARG VITE_API_GATEWAY_URL=http://localhost
ARG VITE_LOADER_DEPOT=Peliyagoda
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_LOADER_DEPOT=$VITE_LOADER_DEPOT
RUN npm run build

EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
