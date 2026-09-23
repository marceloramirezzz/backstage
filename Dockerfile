# syntax=docker/dockerfile:1

# ---- deps: install everything needed to build (cached until the lockfile changes)
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile Next into a self-contained server under .next/standalone
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: only what the server and the migrate command need
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output bundles server.js plus the node_modules it traced (incl. pg).
# Static assets and public/ aren't included, so copy them next to it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# The migrate command runs straight from TypeScript source, so ship it too.
# src/db/migrate.ts finds migrations/ at ../../migrations relative to itself.
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/db ./src/db
COPY --from=build --chown=node:node /app/migrations ./migrations

USER node
EXPOSE 3000

# Default: the web server. Migrations: `docker run <image> node scripts/migrate.ts`
CMD ["node", "server.js"]
