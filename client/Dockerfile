# =============================================
# Stage 1: Build the client
# =============================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy shared types first (needed for build)
COPY shared/ ./shared/

# Copy client package files and install deps
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci

# Copy client source
COPY client/ ./

# Build the client
RUN npm run build

# =============================================
# Stage 2: Serve with Nginx
# =============================================
FROM nginx:alpine

# Copy built files
COPY --from=build /app/client/dist /usr/share/nginx/html

# Copy custom nginx config
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
