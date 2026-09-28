FROM node:20-alpine
WORKDIR /app

# 1. Copy workspace configuration
COPY package.json package-lock.json* ./

# 2. Copy shared types and service source
COPY packages ./packages
COPY services/auth-rbac ./services/auth-rbac

# 3. Install dependencies
RUN npm ci

# 4. Build shared types
WORKDIR /app/packages/shared-types
RUN npm run build

# 5. Build auth-rbac
WORKDIR /app/services/auth-rbac
RUN npm run build

# 6. Expose port and start in dev mode (ts-node-dev watches /app/services/auth-rbac/src)
EXPOSE 3001
CMD ["npm", "run", "dev"]