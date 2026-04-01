# ---- Build stage ----
FROM node:20-slim AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy build output from build stage
COPY --from=build /app/dist ./dist

# Copy migration files for drizzle-kit push (run separately in pipeline)
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 8080

# Health check for Azure App Service / Container Apps
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

USER node

CMD ["node", "dist/index.cjs"]
