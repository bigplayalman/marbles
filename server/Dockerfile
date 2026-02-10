# =============================================
# Stage 1: Build the server
# =============================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy shared types
COPY shared/ ./shared/

# Copy server package files and install deps
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

# Copy server source
COPY server/ ./

# Build TypeScript
RUN npm run build

# =============================================
# Stage 2: Production image
# =============================================
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=build /app/server/dist ./dist

# Copy shared types (needed at runtime for JS imports)
COPY --from=build /app/shared ../shared

# Security: run as non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/server/src/index.js"]
