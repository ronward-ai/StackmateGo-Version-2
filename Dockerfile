# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artefacts
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT; server/index.ts reads it
EXPOSE 8080

CMD ["node", "dist/index.js"]
