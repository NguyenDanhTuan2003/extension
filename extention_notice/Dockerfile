# ══════════════════════════════════════════════
# STAGE 1: Builder — Cài deps + Build TypeScript
# ══════════════════════════════════════════════
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files trước (tận dụng Docker layer cache)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

# Cài toàn bộ deps (bao gồm devDeps để build)
RUN npm install

# Copy toàn bộ source
COPY apps/ ./apps/
COPY libs/ ./libs/

# Build 2 app
RUN npx nest build api-gateway
RUN npx nest build notice-service

# ══════════════════════════════════════════════
# STAGE 2: API Gateway — Image production nhỏ gọn
# ══════════════════════════════════════════════
FROM node:22-alpine AS api-gateway

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# Chỉ cài production deps
RUN npm install --omit=dev

# Copy dist từ builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/apps/api-gateway/main.js"]

# ══════════════════════════════════════════════
# STAGE 3: Notice Service — Image production nhỏ gọn
# ══════════════════════════════════════════════
FROM node:22-alpine AS notice-service

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/apps/notice-service/main.js"]
